/**
 * Points of interest, phase A (the too-empty verdict): small deliberate
 * discoveries scattered through the wilderness with semantic causes —
 * hunter camps in forest clearings, standing-stone rings on open uplands,
 * old battlefields beside the roads, fenced graveyards outside settlements,
 * wayside shrines at junctions, fishing spots on far shores.
 *
 * Phase A uses props, decals, and fences only (structure POIs — mines,
 * caves, crypts — are phase B, which needs the loader's pass-cell model).
 * POIs stamp AFTER ambient decoration and overwrite it: deliberate beats
 * ambient. Placement is channel-driven with bounded attempts, spaced away
 * from settlements and each other, and never touches corridors, crossings,
 * structures, entrances, farms, or piers.
 */

import { channel } from "../core/channels.js";
import { PALETTE_INDEX, WORLD_PALETTE } from "../regions/biomes.js";
import { WATER_NONE, type HydrologyResult } from "../hydrology/hydrology.js";
import type { RoutesResult } from "../routes/routes.js";
import type { ResolvedWorldConfig } from "../recipe/compile.js";
import type { SettlementPlan } from "../settlements/settlements.js";
import type { FarmResult } from "../settlements/farms.js";
import { DECAL_TYPES, DECOR_TYPES, type DecorationResult } from "./decorate.js";
import {
  STRUCTURE_FOOTPRINTS,
  STRUCTURE_LAYER_VALUE,
  type StructureType,
} from "../settlements/structures.js";

export const POI_TYPES = [
  "poi.hunters_camp",
  "poi.standing_stones",
  "poi.battlefield",
  "poi.graveyard",
  "poi.wayside_shrine",
  "poi.fishing_spot",
  "poi.mine",
  "poi.cave",
  "poi.stone_circle",
  "poi.crypt",
  "poi.ruin",
  "poi.giant_skeleton",
  "poi.bandit_camp",
] as const;
export type PoiType = (typeof POI_TYPES)[number];

/** Structure footprint carried by structure-bearing POIs (phase B): the
 * loader rebuilds per-cell indexes from this to apply pass-cell walkability. */
export interface PoiStructure {
  readonly type: StructureType;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PlacedPoi {
  readonly id: number;
  readonly type: PoiType;
  readonly x: number;
  readonly y: number;
  readonly structure?: PoiStructure;
}

const MIN_POI_SPACING = 14;
const MIN_SETTLEMENT_DISTANCE = 10;

export function planPois(
  grid: readonly number[],
  structureLayer: Uint8Array,
  hydro: HydrologyResult,
  routesResult: RoutesResult,
  settlementPlans: readonly SettlementPlan[],
  farms: FarmResult,
  decoration: DecorationResult,
  config: ResolvedWorldConfig,
): PlacedPoi[] {
  const { width, height } = config.world;
  const budget = config.decoration.poiCount;
  const pois: PlacedPoi[] = [];
  if (budget === 0) {
    return pois;
  }
  const roll = channel(config.seed, "decor.pois");

  const road = PALETTE_INDEX["terrain.packed_road"];
  const cobble = PALETTE_INDEX["terrain.cobble"];
  const grass = PALETTE_INDEX["terrain.grass"];
  const dryGrass = PALETTE_INDEX["terrain.dry_grass"];
  const snow = PALETTE_INDEX["terrain.snow"];
  const gravel = PALETTE_INDEX["terrain.gravel"];
  const rockValue = PALETTE_INDEX["terrain.rock"];
  const propIndex = new Map<string, number>();
  DECOR_TYPES.forEach((key, index) => propIndex.set(key, index + 1));
  const decalIndex = new Map<string, number>();
  DECAL_TYPES.forEach((key, index) => decalIndex.set(key, index + 1));
  const prop = (key: string): number => {
    const value = propIndex.get(key);
    if (value === undefined) throw new Error(`unknown prop key ${key}`);
    return value;
  };
  const decal = (key: string): number => {
    const value = decalIndex.get(key);
    if (value === undefined) throw new Error(`unknown decal key ${key}`);
    return value;
  };

  const crossings = new Set<number>();
  for (const route of routesResult.routes) {
    for (const crossing of route.crossings) crossings.add(crossing.cell);
  }
  const entrances = new Set<number>();
  for (const plan of settlementPlans) {
    for (const structure of plan.structures) {
      entrances.add(structure.entranceY * width + structure.entranceX);
    }
  }

  const cellAt = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x;

  /** A cell a POI may claim: dry open land off everything deliberate. */
  const claimable = (index: number): boolean =>
    index !== -1 &&
    hydro.waterKind[index] === WATER_NONE &&
    hydro.isRiver[index] === 0 &&
    grid[index] !== road &&
    grid[index] !== cobble &&
    routesResult.pathLayer[index] === 0 &&
    structureLayer[index] === 0 &&
    farms.cropLayer[index] === 0 &&
    farms.fenceLayer[index] === 0 &&
    farms.pierLayer[index] === 0 &&
    !crossings.has(index) &&
    !entrances.has(index);

  const clearRegion = (x0: number, y0: number, w: number, h: number): boolean => {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        if (!claimable(cellAt(x, y))) return false;
      }
    }
    return true;
  };

  const farEnough = (x: number, y: number): boolean => {
    for (const placed of pois) {
      if (Math.max(Math.abs(placed.x - x), Math.abs(placed.y - y)) < MIN_POI_SPACING) return false;
    }
    return true;
  };
  const settlementDistance = (x: number, y: number): number => {
    let best = Infinity;
    for (const plan of settlementPlans) {
      best = Math.min(best, Math.max(Math.abs(plan.anchorX - x), Math.abs(plan.anchorY - y)));
    }
    return best;
  };
  const nearRoad = (x: number, y: number, radius: number): boolean => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const index = cellAt(x + dx, y + dy);
        if (index !== -1 && grid[index] === road) return true;
      }
    }
    return false;
  };
  const treesNear = (x: number, y: number, radius: number): number => {
    const treeValues = new Set(
      ["prop.oak", "prop.birch", "prop.pine", "prop.willow"].map((key) => prop(key)),
    );
    let count = 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const index = cellAt(x + dx, y + dy);
        if (index !== -1 && treeValues.has(decoration.propLayer[index] as number)) count += 1;
      }
    }
    return count;
  };
  const putProp = (x: number, y: number, key: string): void => {
    const index = cellAt(x, y);
    if (index === -1 || !claimable(index)) return;
    decoration.propLayer[index] = prop(key);
    decoration.decalLayer[index] = 0;
  };
  const putDecal = (x: number, y: number, key: string): void => {
    const index = cellAt(x, y);
    if (index === -1 || !claimable(index)) return;
    if (decoration.propLayer[index] !== 0) return;
    decoration.decalLayer[index] = decal(key);
  };

  // Per-type caps keep the mix varied: without them the commonest terrain
  // (forest) claims the whole budget with one POI kind.
  const typeCounts = new Map<PoiType, number>();
  const TYPE_CAPS: { readonly [key in PoiType]: number } = {
    "poi.hunters_camp": Math.max(2, Math.ceil(budget / 5)),
    "poi.standing_stones": Math.max(2, Math.ceil(budget / 6)),
    "poi.fishing_spot": Math.max(1, Math.ceil(budget / 6)),
    "poi.battlefield": budget,
    "poi.graveyard": budget,
    "poi.wayside_shrine": budget,
    "poi.mine": 4,
    "poi.cave": 4,
    "poi.stone_circle": 1,
    "poi.crypt": 2,
    "poi.ruin": 4,
    "poi.giant_skeleton": 1,
    "poi.bandit_camp": 3,
  };
  const capped = (type: PoiType): boolean =>
    (typeCounts.get(type) ?? 0) >= TYPE_CAPS[type];
  const record = (type: PoiType, x: number, y: number, structure?: PoiStructure): void => {
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    pois.push(structure === undefined ? { id: pois.length, type, x, y } : { id: pois.length, type, x, y, structure });
  };

  /** Atomically stamp a structure POI: footprint plus a one-cell gap must be
   * claimable; footprint cells clear their ambient decoration. */
  const stampStructure = (type: StructureType, originX: number, originY: number): PoiStructure | null => {
    const footprint = STRUCTURE_FOOTPRINTS[type];
    if (footprint === undefined) return null;
    const [w, h] = footprint;
    for (let sy = -1; sy <= h; sy += 1) {
      for (let sx = -1; sx <= w; sx += 1) {
        const cell = cellAt(originX + sx, originY + sy);
        if (cell === -1 || !claimable(cell)) return null;
      }
    }
    for (let sy = 0; sy < h; sy += 1) {
      for (let sx = 0; sx < w; sx += 1) {
        const cell = (originY + sy) * width + originX + sx;
        structureLayer[cell] = STRUCTURE_LAYER_VALUE[type];
        decoration.propLayer[cell] = 0;
        decoration.decalLayer[cell] = 0;
      }
    }
    return { type, x: originX, y: originY, w, h };
  };

  const rockNear = (x: number, y: number, radius: number): boolean => {
    const rock = PALETTE_INDEX["terrain.rock"];
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const index = cellAt(x + dx, y + dy);
        if (index !== -1 && grid[index] === rock) return true;
      }
    }
    return false;
  };

  // Deterministic bounded candidate scan; each accepted candidate becomes
  // whichever POI its surroundings support best.
  const attempts = budget * 28;
  for (let attempt = 0; attempt < attempts && pois.length < budget; attempt += 1) {
    const x = roll.intAt(attempt, 0, 4, width - 8, 0) + 4;
    const y = roll.intAt(attempt, 1, 4, height - 8, 0) + 4;
    const center = cellAt(x, y);
    if (center === -1 || !claimable(center)) continue;
    if (!farEnough(x, y)) continue;
    const material = grid[center] as number;
    const biome = WORLD_PALETTE[material] as string;
    const settlementGap = settlementDistance(x, y);
    if (settlementGap < MIN_SETTLEMENT_DISTANCE && settlementGap !== Infinity) {
      continue;
    }
    const variant = roll.permilleAt(x, y, 2);

    // Bandit camp: a palisaded raider den preying on the roads — near enough
    // to strike, far enough to hide. Ring with a south gate, camp clutter
    // inside, warnings staked outside.
    if (
      (material === grass || material === dryGrass) &&
      !capped("poi.bandit_camp") &&
      settlementGap > 16 &&
      nearRoad(x, y, 14) &&
      !nearRoad(x, y, 4) &&
      clearRegion(x - 4, y - 3, 9, 8)
    ) {
      const campWall = STRUCTURE_LAYER_VALUE["structure.camp_wall"];
      for (let sx = -3; sx <= 3; sx += 1) {
        for (const sy of [-2, 3]) {
          if (sy === 3 && (sx === 0 || sx === 1)) continue; // gate gap
          const cell = cellAt(x + sx, y + sy);
          if (cell !== -1) {
            structureLayer[cell] = campWall;
            decoration.propLayer[cell] = 0;
            decoration.decalLayer[cell] = 0;
          }
        }
      }
      for (let sy = -1; sy <= 2; sy += 1) {
        for (const sx of [-3, 3]) {
          const cell = cellAt(x + sx, y + sy);
          if (cell !== -1) {
            structureLayer[cell] = campWall;
            decoration.propLayer[cell] = 0;
            decoration.decalLayer[cell] = 0;
          }
        }
      }
      putProp(x, y, "prop.campfire");
      putProp(x - 1, y - 1, "prop.bedroll");
      putProp(x + 1, y - 1, "prop.bedroll");
      putProp(x - 2, y + 1, "prop.loot_pile");
      putProp(x + 2, y + 1, "prop.game_rack");
      putProp(x + 2, y - 1, "prop.banner");
      putProp(x - 2, y - 1, "prop.watchfire");
      putProp(x - 1, y + 4, "prop.skull_pole");
      putProp(x + 2, y + 4, "prop.skull_pole");
      putProp(x - 3, y + 4, "prop.spikes");
      putProp(x + 4, y + 4, "prop.spikes");
      record("poi.bandit_camp", x, y);
      continue;
    }

    // --- Structure discoveries (phase B) come first: rare, capped tight ---

    // Giant skeleton: a once-in-a-world find on open ground, far from anyone.
    if (
      (material === grass || material === dryGrass) &&
      variant < 60 &&
      !capped("poi.giant_skeleton") &&
      settlementGap > 25 &&
      !nearRoad(x, y, 6)
    ) {
      const stamp = stampStructure("structure.giant_skeleton", x, y);
      if (stamp !== null) {
        putProp(x - 2, y, "prop.bone_pile");
        putProp(x + 4, y + 2, "prop.bone_pile");
        record("poi.giant_skeleton", x, y, stamp);
        continue;
      }
    }

    // Mine: a shaft into the rock with working clutter.
    if (
      (material === grass || material === dryGrass || material === gravel) &&
      !capped("poi.mine") &&
      rockNear(x, y, 3) &&
      variant < 500
    ) {
      const stamp = stampStructure("structure.mine_shaft", x, y);
      if (stamp !== null) {
        putProp(x - 1, y + 1, "prop.mine_cart");
        putProp(x + 2, y, "prop.ore_vein");
        putProp(x + 2, y + 2, "prop.log_pile");
        record("poi.mine", x, y, stamp);
        continue;
      }
    }

    // Cave mouth: where open land meets the rock mass.
    if (
      material === rockValue &&
      !capped("poi.cave") &&
      variant < 500
    ) {
      let facesOpen = false;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
        const index = cellAt(x + dx, y + dy);
        if (index !== -1 && grid[index] !== rockValue && hydro.waterKind[index] === WATER_NONE) {
          facesOpen = true;
          break;
        }
      }
      if (facesOpen) {
        const stamp = stampStructure("structure.cave_mouth", x, y);
        if (stamp !== null) {
          record("poi.cave", x, y, stamp);
          continue;
        }
      }
    }

    // Stone circle: the grand sacred site, one per world at most.
    if (
      (material === grass || material === dryGrass || material === snow) &&
      !capped("poi.stone_circle") &&
      !nearRoad(x, y, 6) &&
      treesNear(x, y, 3) <= 2 &&
      variant < 400
    ) {
      const stamp = stampStructure("structure.stone_circle", x - 1, y - 1);
      if (stamp !== null) {
        record("poi.stone_circle", x, y, stamp);
        continue;
      }
    }

    // Crypt: old burial vault in reach of the living.
    if (
      material === grass &&
      !capped("poi.crypt") &&
      settlementGap >= MIN_SETTLEMENT_DISTANCE &&
      settlementGap <= 30 &&
      variant < 250
    ) {
      const stamp = stampStructure("structure.crypt", x, y);
      if (stamp !== null) {
        putProp(x - 1, y + 1, "prop.lone_grave");
        record("poi.crypt", x, y, stamp);
        continue;
      }
    }

    // Ruin: a collapsed farmstead deep in the wild.
    if (
      (material === grass || material === dryGrass) &&
      !capped("poi.ruin") &&
      !nearRoad(x, y, 4) &&
      variant < 200
    ) {
      const stamp = stampStructure("structure.ruin", x, y);
      if (stamp !== null) {
        putProp(x - 1, y - 1, "prop.broken_wagon");
        record("poi.ruin", x, y, stamp);
        continue;
      }
    }

    // Graveyard: within reach of a settlement, on open grass.
    if (
      material === grass &&
      settlementGap >= MIN_SETTLEMENT_DISTANCE &&
      settlementGap <= 24 &&
      variant < 400 && !capped("poi.graveyard") &&
      clearRegion(x - 1, y - 1, 6, 5)
    ) {
      for (let sx = -1; sx <= 4; sx += 1) {
        for (const sy of [-1, 3]) {
          if (sy === -1 && (sx === 1 || sx === 2)) continue; // gate gap
          const index = cellAt(x + sx, y + sy);
          if (index !== -1) farms.fenceLayer[index] = 2; // fence.iron
        }
      }
      for (const sy of [0, 1, 2]) {
        for (const sx of [-1, 4]) {
          const index = cellAt(x + sx, y + sy);
          if (index !== -1) farms.fenceLayer[index] = 2;
        }
      }
      putProp(x, y, "prop.gravestones");
      putProp(x + 2, y, "prop.gravestones");
      putProp(x + 1, y + 2, "prop.gravestones");
      putProp(x + 3, y + 1, "prop.lone_grave");
      record("poi.graveyard", x, y);
      continue;
    }

    // Hunter camp: a clearing inside real forest.
    if (material === grass && !capped("poi.hunters_camp") && treesNear(x, y, 4) >= 10 && clearRegion(x - 1, y - 1, 3, 3)) {
      putProp(x, y, "prop.campfire");
      putProp(x - 1, y, "prop.bedroll");
      putProp(x + 1, y - 1, "prop.game_rack");
      putProp(x + 1, y + 1, "prop.log_pile");
      record("poi.hunters_camp", x, y);
      continue;
    }

    // Battlefield: open ground close to a road — old history on the route.
    if (
      (material === grass || material === dryGrass) &&
      nearRoad(x, y, 5) &&
      variant < 500 &&
      !capped("poi.battlefield") &&
      clearRegion(x - 2, y - 2, 5, 5)
    ) {
      putDecal(x, y, "decal.crater");
      putDecal(x - 2, y + 1, "decal.arrows");
      putDecal(x + 1, y - 2, "decal.arrows");
      putDecal(x + 2, y + 1, "decal.battle_gear");
      putDecal(x - 1, y - 1, "decal.battle_gear");
      putProp(x + 1, y + 2, "prop.broken_wagon");
      putProp(x - 2, y - 2, "prop.bone_pile");
      record("poi.battlefield", x, y);
      continue;
    }

    // Standing stones: open upland, well away from roads and towns.
    if (
      (material === grass || material === dryGrass || material === snow) &&
      !capped("poi.standing_stones") &&
      !nearRoad(x, y, 6) &&
      treesNear(x, y, 3) <= 2 &&
      clearRegion(x - 2, y - 2, 5, 5)
    ) {
      putProp(x, y - 2, "prop.standing_stone");
      putProp(x + 2, y, "prop.standing_stone");
      putProp(x, y + 2, "prop.standing_stone");
      putProp(x - 2, y, "prop.standing_stone");
      putProp(x, y, "prop.runestone");
      record("poi.standing_stones", x, y);
      continue;
    }

    // Wayside shrine: right beside the road.
    if ((material === grass || material === dryGrass || material === snow) && !capped("poi.wayside_shrine") && nearRoad(x, y, 2) && variant < 350 && clearRegion(x, y, 2, 1)) {
      putProp(x, y, "prop.altar");
      putProp(x + 1, y, "prop.brazier");
      record("poi.wayside_shrine", x, y);
      continue;
    }

    // Fishing spot: a far shore with a beached boat and drying nets.
    if (settlementGap > 20 && !capped("poi.fishing_spot") && clearRegion(x, y, 2, 1)) {
      let shoreWater = -1;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const index = cellAt(x + dx, y + dy);
        if (index !== -1 && hydro.waterKind[index] !== WATER_NONE && hydro.isRiver[index] === 0) {
          shoreWater = index;
          break;
        }
      }
      if (shoreWater !== -1) {
        putProp(x, y, "prop.campfire");
        const wx = shoreWater % width;
        const wy = (shoreWater - wx) / width;
        if (decoration.propLayer[shoreWater] === 0 && farms.pierLayer[shoreWater] === 0) {
          decoration.propLayer[shoreWater] = prop("prop.rowboat");
        }
        putProp(x + 1, y, "prop.fishnets");
        void wx;
        void wy;
        record("poi.fishing_spot", x, y);
        continue;
      }
    }
  }

  return pois;
}
