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
 *
 * decoration.pois v4 (the far reaches): the mountain mass and the deep
 * snow get their own kinds — prospector camps and ruined watches on rock
 * pockets, crystal outcrops inside the mass, trapper camps and forgotten
 * battlefields in the snowfields — plus wider mine/cave windows.
 */

import { channel } from "../core/channels.js";
import { PALETTE_INDEX, WORLD_PALETTE } from "../regions/biomes.js";
import { WATER_NONE, type HydrologyResult } from "../hydrology/hydrology.js";
import type { RoutesResult } from "../routes/routes.js";
import type { ResolvedWorldConfig } from "../recipe/compile.js";
import type { SettlementPlan } from "../settlements/settlements.js";
import type { LandmarkPlan } from "../settlements/landmarks.js";
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
  "poi.prospector_camp",
  "poi.crystal_outcrop",
  "poi.ruined_watch",
  "poi.trapper_camp",
  "poi.abandoned_caravan",
  "poi.witch_circle",
  "poi.frozen_wreck",
  "poi.mountain_shrine",
  "poi.city_ruin",
  "poi.hermit_hut",
  "poi.beast_den",
  "poi.pass_memorial",
  "poi.steam_vents",
  // Append-only (behavior 41): lone buildings in the wilderness.
  "poi.abandoned_homestead",
  "poi.lone_cottage",
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

// decoration.pois v13 (behavior 40): POI spacing scales with the world —
// the old flat 14 mathematically starved tiny 64² maps down to ~6 POIs,
// which read as dead space between the set-pieces. The value now comes
// from config.decoration.poiSpacing (tiny 7, everything else 14).
const MIN_SETTLEMENT_DISTANCE = 10;

export function planPois(
  grid: readonly number[],
  structureLayer: Uint8Array,
  hydro: HydrologyResult,
  routesResult: RoutesResult,
  settlementPlans: readonly SettlementPlan[],
  landmarkPlans: readonly LandmarkPlan[],
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
  const mudValue = PALETTE_INDEX["terrain.mud"];
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
      if (Math.max(Math.abs(placed.x - x), Math.abs(placed.y - y)) < config.decoration.poiSpacing) return false;
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
  const nearTrail = (x: number, y: number, radius: number): boolean => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const index = cellAt(x + dx, y + dy);
        if (index !== -1 && routesResult.pathLayer[index] === 1) return true;
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
    // Decoration v3 discipline: cosmetic decals never sit on blocked
    // terrain (the packaged reference would ambiguously grant passage).
    if (grid[index] === rockValue || grid[index] === PALETTE_INDEX["terrain.swamp"]) return;
    // Deliberate beats ambient (v5): a story decal clears the ambient prop
    // under it — otherwise forest vignettes lose their ground marks to
    // random trees. Vignettes keep their own props and decals on disjoint
    // cells, so a POI never erases its own work.
    decoration.propLayer[index] = 0;
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
    "poi.mine": 6,
    "poi.cave": 7,
    "poi.stone_circle": 1,
    "poi.crypt": 2,
    "poi.ruin": 5,
    "poi.giant_skeleton": 1,
    "poi.bandit_camp": 3,
    "poi.prospector_camp": 3,
    "poi.crystal_outcrop": 3,
    "poi.ruined_watch": 2,
    "poi.trapper_camp": 3,
    "poi.abandoned_caravan": 2,
    "poi.witch_circle": 1,
    "poi.frozen_wreck": 2,
    "poi.mountain_shrine": 2,
    "poi.city_ruin": budget,
    "poi.hermit_hut": 1,
    "poi.beast_den": 2,
    "poi.pass_memorial": 2,
    "poi.steam_vents": 2,
    "poi.abandoned_homestead": 2,
    "poi.lone_cottage": 2,
  };
  // Far-reach quota (decoration.pois v4): rock- and snow-bound kinds get a
  // reserved slice of the budget. Rock edges are ~2% of cells, so without a
  // reserve the common grass kinds soak every slot before the candidate
  // stream ever samples the mountains. Far kinds may spill into the general
  // pool on rock-rich worlds; general kinds never eat the reserve.
  const FAR_KINDS = new Set<PoiType>([
    "poi.mine",
    "poi.cave",
    "poi.prospector_camp",
    "poi.crystal_outcrop",
    "poi.ruined_watch",
    "poi.trapper_camp",
    "poi.frozen_wreck",
    "poi.mountain_shrine",
    "poi.hermit_hut",
    "poi.beast_den",
    "poi.pass_memorial",
    "poi.steam_vents",
  ]);
  const farQuota = Math.max(2, Math.trunc((budget * 3) / 10));
  const generalBudget = budget - farQuota;
  let farCount = 0;
  let cityCount = 0;
  const capped = (type: PoiType): boolean => {
    if ((typeCounts.get(type) ?? 0) >= TYPE_CAPS[type]) return true;
    const generalUsed = pois.length - farCount - cityCount;
    if (FAR_KINDS.has(type)) {
      return farCount >= farQuota && generalUsed >= generalBudget;
    }
    return generalUsed >= generalBudget;
  };
  const record = (type: PoiType, x: number, y: number, structure?: PoiStructure): void => {
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    if (FAR_KINDS.has(type)) farCount += 1;
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

  // The old kingdom (decoration.pois v6): a ruined_city landmark gets its
  // furniture — a broken keep, collapsed houses, and FOUR distinct delves
  // (dungeon, temple, portal, crypt) at fixed offsets inside the walls.
  // City records ride outside the wilderness budget (cityCount) and their
  // structures reach the loader through the normal POI pass-cell path.
  for (const plan of landmarkPlans) {
    if (
      plan.type !== "ruined_city" &&
      plan.type !== "world_tree" &&
      plan.type !== "crystal_spire" &&
      plan.type !== "lighthouse" &&
      plan.type !== "hunters_lodge" &&
      plan.type !== "mountain_hamlet"
    ) {
      continue;
    }
    // allowPath: the gate sits astride the old through-trail (its pass
    // cells keep the road open); everything else dodges trails so no
    // route gets walled off by a ruin.
    const cityCell = (cell: number, allowPath: boolean): boolean =>
      cell !== -1 &&
      hydro.waterKind[cell] === WATER_NONE &&
      hydro.isRiver[cell] === 0 &&
      grid[cell] !== road &&
      grid[cell] !== cobble &&
      (allowPath || routesResult.pathLayer[cell] === 0) &&
      structureLayer[cell] === 0 &&
      farms.cropLayer[cell] === 0 &&
      farms.fenceLayer[cell] === 0 &&
      farms.pierLayer[cell] === 0 &&
      !crossings.has(cell) &&
      !entrances.has(cell);
    const cityStamp = (
      type: StructureType,
      spots: ReadonlyArray<readonly [number, number]>,
      allowPath = false,
    ): void => {
      const footprint = STRUCTURE_FOOTPRINTS[type];
      if (footprint === undefined) return;
      const [w, h] = footprint;
      for (const [sx, sy] of spots) {
        const originX = plan.x + sx;
        const originY = plan.y + sy;
        let fits = true;
        for (let yy = 0; yy < h && fits; yy += 1) {
          for (let xx = 0; xx < w && fits; xx += 1) {
            if (!cityCell(cellAt(originX + xx, originY + yy), allowPath)) fits = false;
          }
        }
        if (!fits) continue;
        for (let yy = 0; yy < h; yy += 1) {
          for (let xx = 0; xx < w; xx += 1) {
            const cell = (originY + yy) * width + originX + xx;
            structureLayer[cell] = STRUCTURE_LAYER_VALUE[type];
            decoration.propLayer[cell] = 0;
            decoration.decalLayer[cell] = 0;
          }
        }
        typeCounts.set("poi.city_ruin", (typeCounts.get("poi.city_ruin") ?? 0) + 1);
        cityCount += 1;
        pois.push({
          id: pois.length,
          type: "poi.city_ruin",
          x: originX,
          y: originY,
          structure: { type, x: originX, y: originY, w, h },
        });
        return;
      }
    };
    if (plan.type === "ruined_city") {
      cityStamp("structure.ruined_gate", [[7, 11]], true);
      cityStamp("structure.keep", [[4, 4], [10, 4], [4, 7], [10, 7]]);
      cityStamp("structure.ruined_tower", [[1, 1], [1, 2]]);
      cityStamp("structure.ruined_tower", [[14, 1], [14, 2]]);
      cityStamp("structure.dungeon", [[4, 1], [2, 2], [10, 1]]);
      cityStamp("structure.monolith", [[6, 1], [2, 4], [12, 1]]);
      cityStamp("structure.ruin_temple", [[11, 2], [11, 1], [5, 2]]);
      cityStamp("structure.buried_statue", [[1, 4], [1, 6], [14, 4]]);
      cityStamp("structure.house_abandoned", [[10, 4], [9, 4], [11, 5]]);
      cityStamp("structure.house_burned", [[13, 4], [12, 4], [13, 5]]);
      cityStamp("structure.crypt", [[2, 8], [1, 8], [2, 9]]);
      cityStamp("structure.house_abandoned", [[4, 8], [5, 8], [4, 9]]);
      cityStamp("structure.house_burned", [[9, 8], [10, 8], [9, 9]]);
      cityStamp("structure.portal", [[12, 8], [12, 9], [11, 8]]);
      // Street furniture: the ruins between the ruins.
      putProp(plan.x + 5, plan.y + 1, "prop.pillar");
      putProp(plan.x + 12, plan.y + 1, "prop.pillar");
      putProp(plan.x + 1, plan.y + 6, "prop.stone_blocks");
      putProp(plan.x + 15, plan.y + 6, "prop.broken_boards");
      putProp(plan.x + 5, plan.y + 10, "prop.ash_pile");
      putProp(plan.x + 14, plan.y + 10, "prop.stone_blocks");
      putDecal(plan.x + 6, plan.y + 2, "decal.rubble");
      putDecal(plan.x + 10, plan.y + 6, "decal.cracks");
      putDecal(plan.x + 4, plan.y + 6, "decal.webs");
      putDecal(plan.x + 12, plan.y + 10, "decal.bones");
      putDecal(plan.x + 8, plan.y + 3, "decal.scorch");
      putDecal(plan.x + 2, plan.y + 10, "decal.rubble");
    } else if (plan.type === "world_tree") {
      // The World Tree: the eldest living thing, ringed by the stones of
      // whoever worshipped here first. Walk beneath the canopy arch.
      // The trail ends AT the tree (anchor inside the footprint): allowPath.
      cityStamp("structure.world_tree", [[2, 2], [3, 2], [2, 3]], true);
      putProp(plan.x + 1, plan.y + 1, "prop.standing_stone");
      putProp(plan.x + 7, plan.y + 1, "prop.standing_stone");
      putProp(plan.x + 1, plan.y + 6, "prop.standing_stone");
      putProp(plan.x + 7, plan.y + 6, "prop.standing_stone");
      putProp(plan.x + 4, plan.y + 7, "prop.runestone");
      putProp(plan.x + 2, plan.y + 6, "prop.flowers");
      putProp(plan.x + 6, plan.y + 6, "prop.mushrooms");
      putProp(plan.x + 6, plan.y + 1, "prop.flowers");
      putDecal(plan.x + 4, plan.y + 6, "decal.rune_circle");
      putDecal(plan.x + 2, plan.y + 1, "decal.leaves");
      putDecal(plan.x + 6, plan.y + 5, "decal.leaves");
    } else if (plan.type === "crystal_spire") {
      // The Crystal Spire: the vein the outcrops all lead back to.
      cityStamp("structure.crystal_spire", [[2, 1], [3, 1], [2, 2]], true);
      putProp(plan.x + 1, plan.y + 4, "prop.crystals");
      putProp(plan.x + 5, plan.y + 3, "prop.crystals");
      putProp(plan.x + 4, plan.y + 5, "prop.crystals");
      putProp(plan.x + 1, plan.y + 1, "prop.crystals");
      putProp(plan.x + 5, plan.y + 5, "prop.boulder");
      putDecal(plan.x + 3, plan.y + 4, "decal.crystal_field");
      putDecal(plan.x + 5, plan.y + 1, "decal.crystal_field");
      putDecal(plan.x + 1, plan.y + 5, "decal.crystal_field");
    } else if (plan.type === "lighthouse") {
      // The lighthouse: still tended — someone keeps the lamp and the
      // catch coming in.
      cityStamp("structure.lighthouse", [[2, 1], [3, 1], [2, 2]], true);
      putProp(plan.x + 1, plan.y + 4, "prop.fishnets");
      putProp(plan.x + 5, plan.y + 4, "prop.crates");
      putProp(plan.x + 1, plan.y + 1, "prop.firewood");
      putProp(plan.x + 5, plan.y + 2, "prop.sacks");
      putDecal(plan.x + 4, plan.y + 5, "decal.driftwood");
      putDecal(plan.x + 1, plan.y + 5, "decal.puddles");
    } else if (plan.type === "hunters_lodge") {
      // The Winterlodge: the last warm roof before the deep snow — every
      // trapper in the quarter hauls their furs here.
      cityStamp("structure.hunter_lodge", [[2, 2], [2, 1], [1, 2]], true);
      putProp(plan.x + 1, plan.y + 4, "prop.game_rack");
      putProp(plan.x + 5, plan.y + 4, "prop.game_rack");
      putProp(plan.x + 5, plan.y + 2, "prop.firewood");
      putProp(plan.x + 1, plan.y + 1, "prop.log_pile");
      putProp(plan.x + 5, plan.y + 1, "prop.chopping_block");
      putProp(plan.x + 4, plan.y + 5, "prop.signpost");
      putProp(plan.x + 1, plan.y + 5, "prop.campfire");
      putDecal(plan.x + 2, plan.y + 5, "decal.bones");
    } else if (plan.type === "mountain_hamlet") {
      // A hamlet in the high bowl: shepherds and stonecutters who never
      // come down. Cottages around a well, fodder for the winter.
      cityStamp("structure.well", [[5, 5], [5, 4], [4, 5]], true);
      cityStamp("structure.watchtower", [[2, 2], [7, 2], [2, 3]]);
      cityStamp("structure.cottage", [[7, 4], [7, 5], [8, 4]]);
      cityStamp("structure.cottage", [[2, 6], [1, 6], [2, 5]]);
      cityStamp("structure.cottage", [[6, 7], [7, 7], [5, 7]]);
      putProp(plan.x + 4, plan.y + 7, "prop.hay_bales");
      putProp(plan.x + 3, plan.y + 3, "prop.trough");
      putProp(plan.x + 8, plan.y + 7, "prop.chopping_block");
      putProp(plan.x + 5, plan.y + 9, "prop.signpost");
      putProp(plan.x + 2, plan.y + 8, "prop.firewood");
      putProp(plan.x + 8, plan.y + 2, "prop.boulder");
      putDecal(plan.x + 6, plan.y + 3, "decal.puddles");
    }
  }

  // Cave mouths seed first (the far reaches' anchors): rock-edge cells are
  // ~2% of the world, so the general stream rarely samples one before the
  // budget fills. A dedicated bounded scan on its own channel lane places
  // them before anything else can spend the far quota.
  const caveTarget = Math.min(TYPE_CAPS["poi.cave"], Math.max(2, Math.trunc(budget / 12)));
  for (let attempt = 0; attempt < attempts && (typeCounts.get("poi.cave") ?? 0) < caveTarget; attempt += 1) {
    const x = roll.intAt(attempt, 4, 4, width - 8, 0) + 4;
    const y = roll.intAt(attempt, 5, 4, height - 8, 0) + 4;
    const center = cellAt(x, y);
    if (center === -1 || !claimable(center) || grid[center] !== rockValue) continue;
    if (!farEnough(x, y)) continue;
    let openX = -1;
    let openY = -1;
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
      const index = cellAt(x + dx, y + dy);
      if (index !== -1 && grid[index] !== rockValue && hydro.waterKind[index] === WATER_NONE) {
        openX = x + dx;
        openY = y + dy;
        break;
      }
    }
    if (openX === -1) continue;
    const stamp = stampStructure("structure.cave_mouth", x, y);
    if (stamp !== null) {
      // Someone camped at the mouth once; something drags bones out still.
      putProp(openX + (openX === x ? 1 : 0), openY + (openY === y ? 1 : 0), "prop.ash_pile");
      putDecal(openX, openY + (openY > y ? 1 : openY < y ? -1 : 0), "decal.bones");
      record("poi.cave", x, y, stamp);
    }
  }

  // Pass memorials seed on their own lane (the history the user reads on
  // the way up): trailside graves near the rock, placed before the general
  // stream can spend their sites.
  for (let attempt = 0; attempt < attempts && (typeCounts.get("poi.pass_memorial") ?? 0) < TYPE_CAPS["poi.pass_memorial"]; attempt += 1) {
    const x = roll.intAt(attempt, 6, 4, width - 8, 0) + 4;
    const y = roll.intAt(attempt, 7, 4, height - 8, 0) + 4;
    const center = cellAt(x, y);
    if (center === -1 || !claimable(center)) continue;
    if (!farEnough(x, y)) continue;
    const material = grid[center] as number;
    if (material !== grass && material !== gravel && material !== snow && material !== dryGrass) continue;
    if (!rockNear(x, y, 5) || !nearTrail(x, y, 5)) continue;
    if (!clearRegion(x - 1, y - 1, 3, 2)) continue;
    putProp(x, y, "prop.gravestones");
    putProp(x + 1, y + 1, "prop.lone_grave");
    putProp(x - 1, y, "prop.milestone");
    putDecal(x, y + 1, "decal.bones");
    record("poi.pass_memorial", x, y);
  }

  for (let attempt = 0; attempt < attempts && pois.length < budget + cityCount; attempt += 1) {
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
      settlementGap > 12 &&
      nearRoad(x, y, 18) &&
      !nearRoad(x, y, 3) &&
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
      // The story: a robbed wagon dumped outside, the strongbox dragged in.
      putProp(x + 1, y, "prop.chest");
      putProp(x - 5, y + 2, "prop.cart");
      putDecal(x + 1, y + 5, "decal.bones");
      record("poi.bandit_camp", x, y);
      continue;
    }

    // Abandoned caravan: a merchant train that never made town — wagons
    // ransacked mid-road, cargo scattered, arrows still in the ground.
    if (
      (material === grass || material === dryGrass) &&
      !capped("poi.abandoned_caravan") &&
      nearRoad(x, y, 8) &&
      !nearRoad(x, y, 2) &&
      settlementGap > 14 &&
      clearRegion(x - 2, y - 1, 5, 4)
    ) {
      putProp(x - 1, y, "prop.broken_wagon");
      putProp(x + 1, y + 1, "prop.cart");
      putProp(x - 2, y + 1, "prop.crates");
      putProp(x + 1, y - 1, "prop.sacks");
      putProp(x + 2, y, "prop.chest");
      putDecal(x, y + 1, "decal.arrows");
      putDecal(x - 1, y - 1, "decal.arrows");
      putDecal(x, y + 2, "decal.bones");
      record("poi.abandoned_caravan", x, y);
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
        // The ground still remembers the fall.
        putDecal(x - 2, y + 3, "decal.cracks");
        putDecal(x + 5, y, "decal.cracks");
        putDecal(x - 3, y + 1, "decal.bones");
        record("poi.giant_skeleton", x, y, stamp);
        continue;
      }
    }

    // Hermit's hut: one who left the world — the garden says they are
    // still here. Rare and first-pick on the near-rock pockets.
    if (
      (material === grass || material === gravel) &&
      !capped("poi.hermit_hut") &&
      variant < 120 &&
      rockNear(x, y, 3) &&
      settlementGap > 20 &&
      clearRegion(x - 1, y - 1, 4, 3)
    ) {
      const stamp = stampStructure("structure.hermit_hut", x, y);
      if (stamp !== null) {
        putProp(x - 1, y + 1, "prop.campfire");
        putProp(x + 2, y, "prop.firewood");
        putProp(x + 2, y + 2, "prop.chopping_block");
        putProp(x - 1, y - 1, "prop.flowers");
        putProp(x + 1, y + 2, "prop.flower_bed");
        record("poi.hermit_hut", x, y, stamp);
        continue;
      }
    }

    // Abandoned homestead (behavior 41): a farm that failed — the house
    // stands, the fields never came in. Lone buildings between settlements
    // make the country read inhabited rather than four set-pieces.
    if (
      (material === grass || material === dryGrass || material === mudValue) &&
      !capped("poi.abandoned_homestead") &&
      variant >= 120 &&
      variant < 240 &&
      settlementGap > 16 &&
      clearRegion(x - 1, y - 1, 4, 3)
    ) {
      const stamp = stampStructure("structure.house_abandoned", x, y);
      if (stamp !== null) {
        putProp(x - 1, y + 1, "prop.broken_wagon");
        putProp(x + 2, y, "prop.hay_bales");
        putProp(x + 2, y + 2, "prop.ash_pile");
        putProp(x - 1, y - 1, "prop.lone_grave");
        putDecal(x + 1, y + 2, "decal.cracks");
        record("poi.abandoned_homestead", x, y, stamp);
        continue;
      }
    }

    // Lone cottage (behavior 41): someone still lives out here — smoke in
    // the chimney, wood split for winter.
    if (
      material === grass &&
      !capped("poi.lone_cottage") &&
      variant >= 240 &&
      variant < 340 &&
      settlementGap > 16 &&
      clearRegion(x - 1, y - 1, 4, 3)
    ) {
      const stamp = stampStructure("structure.cottage", x, y);
      if (stamp !== null) {
        putProp(x - 1, y + 1, "prop.firewood");
        putProp(x + 2, y, "prop.chopping_block");
        putProp(x + 2, y + 2, "prop.trough");
        putProp(x - 1, y - 1, "prop.beehive");
        putProp(x + 1, y + 2, "prop.flower_bed");
        record("poi.lone_cottage", x, y, stamp);
        continue;
      }
    }

    // Mine: a shaft into the rock with working clutter.
    if (
      (material === grass || material === dryGrass || material === gravel) &&
      !capped("poi.mine") &&
      rockNear(x, y, 4) &&
      variant < 650
    ) {
      const stamp = stampStructure("structure.mine_shaft", x, y);
      if (stamp !== null) {
        putProp(x - 1, y + 1, "prop.mine_cart");
        putProp(x + 2, y, "prop.ore_vein");
        putProp(x + 2, y + 2, "prop.log_pile");
        // Shift's end: ore sacked up, the cookfire long cold.
        putProp(x - 2, y + 1, "prop.sacks");
        putProp(x - 1, y - 1, "prop.ash_pile");
        putDecal(x + 1, y + 2, "decal.rubble");
        record("poi.mine", x, y, stamp);
        continue;
      }
    }

    // Cave mouth: where open land meets the rock mass.
    if (
      material === rockValue &&
      !capped("poi.cave") &&
      variant < 700
    ) {
      let openX = -1;
      let openY = -1;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
        const index = cellAt(x + dx, y + dy);
        if (index !== -1 && grid[index] !== rockValue && hydro.waterKind[index] === WATER_NONE) {
          openX = x + dx;
          openY = y + dy;
          break;
        }
      }
      if (openX !== -1) {
        const stamp = stampStructure("structure.cave_mouth", x, y);
        if (stamp !== null) {
          putProp(openX + (openX === x ? 1 : 0), openY + (openY === y ? 1 : 0), "prop.ash_pile");
          putDecal(openX, openY + (openY > y ? 1 : openY < y ? -1 : 0), "decal.bones");
          record("poi.cave", x, y, stamp);
          continue;
        }
      }
    }

    // --- The far reaches (behavior 19): the mountains and the deep snow ---

    // Prospector camp: a digger's claim on a pocket against the rock,
    // tools left out between shifts. The variant window splits the
    // near-rock cells with the mine block above (mine takes < 650).
    if (
      (material === grass || material === dryGrass || material === gravel) &&
      !capped("poi.prospector_camp") &&
      variant >= 650 &&
      rockNear(x, y, 2) &&
      settlementGap > 14 &&
      clearRegion(x - 1, y - 1, 4, 3)
    ) {
      putProp(x, y, "prop.campfire");
      putProp(x - 1, y, "prop.bedroll");
      putProp(x + 1, y - 1, "prop.crates");
      putProp(x + 1, y + 1, "prop.wheelbarrow");
      putProp(x + 2, y, "prop.tool_rack");
      putProp(x - 1, y + 1, "prop.sacks");
      // The claim's strongbox, and the spoil heap that paid for it.
      putProp(x + 2, y - 1, "prop.chest");
      putDecal(x, y + 2, "decal.rubble");
      record("poi.prospector_camp", x, y);
      continue;
    }

    // Crystal outcrop: a glittering vein deep in the rock mass — the
    // mountains' interior gets deliberate finds, not just texture.
    if (material === rockValue && !capped("poi.crystal_outcrop") && variant < 350) {
      let interior = true;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
        const index = cellAt(x + dx, y + dy);
        if (index === -1 || grid[index] !== rockValue) {
          interior = false;
          break;
        }
      }
      if (interior) {
        // A whole vein blooming through the ridge — big enough to spot
        // from the valley floor.
        putProp(x, y, "prop.crystals");
        putProp(x + 1, y + 1, "prop.crystals");
        putProp(x - 1, y + 1, "prop.boulder");
        putProp(x + 1, y - 1, "prop.crystals");
        putProp(x - 1, y - 1, "prop.crystals");
        putProp(x + 2, y, "prop.crystals");
        putProp(x - 2, y, "prop.boulder");
        record("poi.crystal_outcrop", x, y);
        continue;
      }
    }

    // Mountain shrine: braziers kept lit beside a worn statue, high in the
    // rock — someone still climbs up here to tend them.
    if (material === rockValue && !capped("poi.mountain_shrine") && variant >= 350 && variant < 550) {
      let interior = true;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
        const index = cellAt(x + dx, y + dy);
        if (index === -1 || grid[index] !== rockValue) {
          interior = false;
          break;
        }
      }
      if (interior) {
        putProp(x, y, "prop.statue");
        putProp(x - 1, y + 1, "prop.brazier");
        putProp(x + 1, y + 1, "prop.brazier");
        putProp(x, y - 1, "prop.stone_blocks");
        record("poi.mountain_shrine", x, y);
        continue;
      }
    }

    // Ruined watch: toppled pillars and a worn statue on a mountain pocket
    // — whoever kept watch over the passes is long gone.
    if (
      (material === grass || material === snow) &&
      !capped("poi.ruined_watch") &&
      rockNear(x, y, 3) &&
      settlementGap > 18 &&
      clearRegion(x - 1, y - 1, 4, 3)
    ) {
      putProp(x - 1, y - 1, "prop.pillar");
      putProp(x + 2, y - 1, "prop.pillar");
      putProp(x, y, "prop.statue");
      putProp(x + 1, y + 1, "prop.stone_blocks");
      putDecal(x - 1, y + 1, "decal.rubble");
      // It did not fall to time — it burned, and the webs came after.
      putProp(x - 1, y, "prop.broken_boards");
      putDecal(x + 1, y, "decal.scorch");
      putDecal(x + 2, y + 1, "decal.cracks");
      putDecal(x, y - 1, "decal.webs");
      record("poi.ruined_watch", x, y);
      continue;
    }

    // Beast den: the lair in the rock face — the bones outside are fresh.
    if (material === rockValue && !capped("poi.beast_den") && variant >= 550 && variant < 850) {
      let openX = -1;
      let openY = -1;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
        const index = cellAt(x + dx, y + dy);
        if (index !== -1 && grid[index] !== rockValue && hydro.waterKind[index] === WATER_NONE) {
          openX = x + dx;
          openY = y + dy;
          break;
        }
      }
      if (openX !== -1) {
        const stamp = stampStructure("structure.den", x, y);
        if (stamp !== null) {
          putProp(openX + (openX === x ? 1 : 0), openY + (openY === y ? 1 : 0), "prop.bone_pile");
          putDecal(openX, openY + (openY > y ? 1 : openY < y ? -1 : 0), "decal.bones");
          record("poi.beast_den", x, y, stamp);
          continue;
        }
      }
    }

    // Pass memorial: those the crossing took, buried beside the old trail.
    if (
      (material === grass || material === gravel || material === snow) &&
      !capped("poi.pass_memorial") &&
      rockNear(x, y, 3) &&
      nearTrail(x, y, 3) &&
      clearRegion(x - 1, y - 1, 3, 3)
    ) {
      putProp(x, y, "prop.gravestones");
      putProp(x + 1, y + 1, "prop.lone_grave");
      putProp(x - 1, y, "prop.milestone");
      putDecal(x, y + 1, "decal.bones");
      record("poi.pass_memorial", x, y);
      continue;
    }

    // Steam vents: the mountain breathes — scalding breath from the deep.
    if (material === rockValue && !capped("poi.steam_vents") && variant >= 850) {
      let interior = true;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
        const index = cellAt(x + dx, y + dy);
        if (index === -1 || grid[index] !== rockValue) {
          interior = false;
          break;
        }
      }
      if (interior) {
        putDecal(x, y, "decal.steam_vent");
        putDecal(x + 2, y + 1, "decal.steam_vent");
        putDecal(x - 1, y + 2, "decal.steam_vent");
        putDecal(x + 1, y - 2, "decal.steam_vent");
        putProp(x - 2, y, "prop.boulder");
        record("poi.steam_vents", x, y);
        continue;
      }
    }

    // Trapper camp: a fur hunter wintering in the deep snowfields.
    if (
      material === snow &&
      !capped("poi.trapper_camp") &&
      (treesNear(x, y, 4) >= 5 || settlementGap > 20) &&
      clearRegion(x - 1, y - 1, 3, 3)
    ) {
      putProp(x, y, "prop.campfire");
      putProp(x - 1, y, "prop.bedroll");
      putProp(x + 1, y - 1, "prop.game_rack");
      putProp(x + 1, y + 1, "prop.firewood");
      putProp(x - 1, y + 1, "prop.log_pile");
      // The winter larder: a chopping block and the kill pile beside it.
      putProp(x + 2, y, "prop.chopping_block");
      putDecal(x - 2, y, "decal.bones");
      record("poi.trapper_camp", x, y);
      continue;
    }

    // Frozen wreck: a ship the ice caught and never gave back, its cargo
    // still crated on the shore.
    if (
      material === snow &&
      !capped("poi.frozen_wreck") &&
      clearRegion(x - 1, y, 3, 2)
    ) {
      let shoreWater = false;
      for (let dy = -3; dy <= 3 && !shoreWater; dy += 1) {
        for (let dx = -3; dx <= 3 && !shoreWater; dx += 1) {
          const index = cellAt(x + dx, y + dy);
          if (index !== -1 && hydro.waterKind[index] !== WATER_NONE && hydro.isRiver[index] === 0) {
            shoreWater = true;
          }
        }
      }
      if (shoreWater) {
        putProp(x, y, "prop.wreck");
        putProp(x + 1, y + 1, "prop.crates");
        putProp(x - 1, y + 1, "prop.broken_boards");
        putDecal(x - 1, y, "decal.driftwood");
        record("poi.frozen_wreck", x, y);
        continue;
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
        // The processional way: braziers flank the approach, the ground
        // ring still shimmers where the rites were held.
        putProp(x - 3, y + 3, "prop.brazier");
        putProp(x + 3, y + 3, "prop.brazier");
        putDecal(x, y + 4, "decal.rune_circle");
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
        // Sealed long ago; the door says otherwise.
        putDecal(x + 1, y + 3, "decal.webs");
        putDecal(x + 3, y + 2, "decal.bones");
        record("poi.crypt", x, y, stamp);
        continue;
      }
    }

    // Ruin: a collapsed farmstead deep in the wild (snow included — the
    // far reaches keep their dead homesteads too).
    if (
      (material === grass || material === dryGrass || material === snow) &&
      !capped("poi.ruin") &&
      !nearRoad(x, y, 4) &&
      variant < 200
    ) {
      const stamp = stampStructure("structure.ruin", x, y);
      if (stamp !== null) {
        putProp(x - 1, y - 1, "prop.broken_wagon");
        // The homestead burned: a charred tree, cold ashes, what the
        // family dropped when they ran.
        putProp(x - 2, y + 2, "prop.burned_tree");
        putProp(x + 3, y + 1, "prop.ash_pile");
        putProp(x + 2, y + 3, "prop.broken_boards");
        putDecal(x - 1, y + 3, "decal.scorch");
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
      // One grave dug outside the fence — whoever it was, the village
      // would not bury them inside.
      putProp(x + 6, y + 4, "prop.lone_grave");
      putDecal(x + 1, y + 1, "decal.webs");
      record("poi.graveyard", x, y);
      continue;
    }

    // Witch circle: deep in the woods where nobody sensible goes — a rune
    // ring, cold braziers, skulls on poles, webs in the branches.
    if (
      material === grass &&
      !capped("poi.witch_circle") &&
      treesNear(x, y, 4) >= 8 &&
      !nearRoad(x, y, 6) &&
      settlementGap > 18 &&
      clearRegion(x - 1, y - 1, 3, 3)
    ) {
      putDecal(x, y, "decal.rune_circle");
      putProp(x - 1, y - 1, "prop.skull_pole");
      putProp(x + 1, y - 1, "prop.brazier");
      putProp(x - 1, y + 1, "prop.brazier");
      putProp(x + 1, y + 1, "prop.mushrooms");
      putDecal(x, y - 1, "decal.webs");
      putDecal(x + 2, y, "decal.webs");
      record("poi.witch_circle", x, y);
      continue;
    }

    // Hunter camp: a clearing inside real forest, the practice target
    // still standing from the last quiet evening.
    if (material === grass && !capped("poi.hunters_camp") && treesNear(x, y, 4) >= 10 && clearRegion(x - 1, y - 1, 3, 3)) {
      putProp(x, y, "prop.campfire");
      putProp(x - 1, y, "prop.bedroll");
      putProp(x + 1, y - 1, "prop.game_rack");
      putProp(x + 1, y + 1, "prop.log_pile");
      putProp(x + 3, y, "prop.archery_target");
      putProp(x - 1, y + 2, "prop.chopping_block");
      putDecal(x + 2, y, "decal.arrows");
      record("poi.hunters_camp", x, y);
      continue;
    }

    // Battlefield: open ground close to a road — old history on the route.
    // Far from everything on snow it becomes a forgotten battlefield.
    if (
      (material === grass || material === dryGrass || material === snow) &&
      (nearRoad(x, y, 5) || (material === snow && settlementGap > 25)) &&
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
      // The standard nobody came back for still flies over the burned line.
      putProp(x + 2, y - 1, "prop.banner");
      putDecal(x, y + 1, "decal.scorch");
      putDecal(x - 2, y, "decal.bones");
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
      // The ground between the stones still carries the working.
      putDecal(x + 1, y, "decal.rune_circle");
      putDecal(x - 1, y, "decal.rune_circle");
      record("poi.standing_stones", x, y);
      continue;
    }

    // Wayside shrine: right beside the road, fresh flowers at its base —
    // somebody stops here every day.
    if ((material === grass || material === dryGrass || material === snow) && !capped("poi.wayside_shrine") && nearRoad(x, y, 2) && variant < 350 && clearRegion(x, y, 2, 1)) {
      putProp(x, y, "prop.altar");
      putProp(x + 1, y, "prop.brazier");
      putProp(x - 1, y, "prop.flowers");
      putProp(x + 1, y + 1, "prop.flowers");
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
        // The catch crated up, the boards of an older jetty gone soft.
        putProp(x - 1, y, "prop.crates");
        putProp(x, y + 1, "prop.broken_boards");
        void wx;
        void wy;
        record("poi.fishing_spot", x, y);
        continue;
      }
    }
  }

  return pois;
}
