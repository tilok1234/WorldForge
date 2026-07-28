/**
 * Decoration compiler, stage 1: vegetation and ground cover
 * (docs/ARCHITECTURE_AND_CONTRACTS.md component 10; the alive-worlds brief).
 *
 * Plans SEMANTIC decoration — prop species, moss/tall-grass overlays, ground
 * decals — over the composed world. Placement is integer-only and every
 * concern draws from its own named channel, so adding a species never
 * reshuffles another. Forests form in low-frequency patches (a lattice
 * density field), never uniform scatter. Decoration runs after every
 * traversal-critical pass and never touches corridor materials, path cells,
 * crossings, structure footprints, or entrance aprons, so it cannot sever
 * required routes; the artifact records semantic keys and the TileForge
 * adapter maps them to package ids.
 */

import { channel, type Channel } from "../core/channels.js";
import { floorDiv } from "../core/coords.js";
import { PALETTE_INDEX, WORLD_PALETTE } from "../regions/biomes.js";
import { WATER_NONE, type HydrologyResult } from "../hydrology/hydrology.js";
import type { RoutesResult } from "../routes/routes.js";
import type { ResolvedWorldConfig } from "../recipe/compile.js";
import type { FarmResult } from "../settlements/farms.js";

/** Semantic prop keys, stage 1. Layer stores index + 1 (0 = none). */
export const DECOR_TYPES = [
  "prop.oak",
  "prop.birch",
  "prop.pine",
  "prop.willow",
  "prop.dead_tree",
  "prop.fruit_tree",
  "prop.stump",
  "prop.fallen_log",
  "prop.boulder",
  "prop.rock_outcrop",
  "prop.bush",
  "prop.flowers",
  "prop.sapling",
  "prop.mushrooms",
  "prop.ferns",
  "prop.snow_shrub",
  "prop.desert_shrub",
  "prop.roots",
  "prop.reeds",
  "prop.cattails",
  "prop.milestone",
  "prop.signpost",
  "prop.rowboat",
  "prop.fishnets",
  "prop.buoy",
  "prop.campfire",
  "prop.bedroll",
  "prop.game_rack",
  "prop.log_pile",
  "prop.standing_stone",
  "prop.runestone",
  "prop.broken_wagon",
  "prop.bone_pile",
  "prop.altar",
  "prop.brazier",
  "prop.gravestones",
  "prop.lone_grave",
  "prop.mine_cart",
  "prop.ore_vein",
  "prop.watchfire",
  "prop.skull_pole",
  "prop.loot_pile",
  "prop.spikes",
  "prop.banner",
  "prop.crystals",
  "prop.statue",
  "prop.pillar",
  "prop.stone_blocks",
  "prop.crates",
  "prop.wheelbarrow",
  "prop.tool_rack",
  "prop.sacks",
  "prop.firewood",
  "prop.ash_pile",
  "prop.burned_tree",
  "prop.cart",
  "prop.chest",
  "prop.archery_target",
  "prop.chopping_block",
  "prop.hay_bales",
  "prop.trough",
  "prop.wreck",
  "prop.broken_boards",
  "prop.giant_shroom",
  "prop.corrupted_tree",
  "prop.beehive",
  "prop.cactus",
  "prop.flower_bed",
] as const;

/** Semantic ground-decal keys, stage 1. Layer stores index + 1 (0 = none). */
export const DECAL_TYPES = [
  "decal.leaves",
  "decal.puddles",
  "decal.lilypads",
  "decal.driftwood",
  "decal.rubble",
  "decal.crater",
  "decal.arrows",
  "decal.battle_gear",
  "decal.bones",
  "decal.scorch",
  "decal.cracks",
  "decal.webs",
  "decal.rune_circle",
  "decal.crystal_field",
  "decal.steam_vent",
] as const;

/** Species that block movement (mirrors the package's prop walkability). */
const BLOCKING = new Set<string>([
  "prop.oak", "prop.birch", "prop.pine", "prop.willow", "prop.dead_tree",
  "prop.fruit_tree", "prop.stump", "prop.fallen_log", "prop.boulder",
  "prop.rock_outcrop", "prop.milestone", "prop.signpost", "prop.rowboat",
  "prop.buoy", "prop.campfire", "prop.game_rack", "prop.log_pile",
  "prop.standing_stone", "prop.runestone", "prop.broken_wagon",
  "prop.bone_pile", "prop.altar", "prop.brazier", "prop.gravestones",
  "prop.lone_grave", "prop.mine_cart", "prop.ore_vein", "prop.watchfire",
  "prop.skull_pole", "prop.loot_pile", "prop.spikes", "prop.banner",
  "prop.crystals", "prop.statue", "prop.pillar", "prop.stone_blocks",
  "prop.crates", "prop.wheelbarrow", "prop.tool_rack", "prop.sacks",
  "prop.firewood",
  // Story props (v5): ash_pile and broken_boards are walkable in the
  // package (ground litter); the rest block.
  "prop.burned_tree", "prop.cart", "prop.chest", "prop.archery_target",
  "prop.chopping_block", "prop.hay_bales", "prop.trough", "prop.wreck",
  "prop.giant_shroom", "prop.corrupted_tree", "prop.beehive", "prop.cactus",
  "prop.flower_bed",
]);

/** Two-part canopy species (§2.10): skip when a structure sits above. */
const TWO_PART = new Set<string>([
  "prop.oak", "prop.birch", "prop.pine", "prop.willow", "prop.dead_tree",
  "prop.fruit_tree", "prop.pillar", "prop.giant_shroom",
]);

interface SpeciesWeight {
  readonly key: (typeof DECOR_TYPES)[number];
  readonly weight: number;
}

/** Forest-roll species per biome (patch-gated canopy and large features). */
const FOREST_SPECIES: Readonly<Record<string, readonly SpeciesWeight[]>> = {
  // decoration.props v10 (behavior 41): every table carries rare accents —
  // a woods roll should surprise occasionally, not cycle four species.
  "terrain.grass": [
    { key: "prop.oak", weight: 48 },
    { key: "prop.birch", weight: 24 },
    { key: "prop.pine", weight: 8 },
    { key: "prop.fruit_tree", weight: 3 },
    { key: "prop.stump", weight: 5 },
    { key: "prop.fallen_log", weight: 5 },
    { key: "prop.boulder", weight: 4 },
    { key: "prop.beehive", weight: 2 },
    { key: "prop.giant_shroom", weight: 1 },
  ],
  "terrain.dry_grass": [
    { key: "prop.dead_tree", weight: 30 },
    { key: "prop.desert_shrub", weight: 34 },
    { key: "prop.boulder", weight: 12 },
    { key: "prop.stump", weight: 9 },
    { key: "prop.cactus", weight: 9 },
    { key: "prop.rock_outcrop", weight: 4 },
    { key: "prop.bone_pile", weight: 2 },
  ],
  "terrain.snow": [
    { key: "prop.pine", weight: 62 },
    { key: "prop.snow_shrub", weight: 17 },
    { key: "prop.dead_tree", weight: 5 },
    { key: "prop.boulder", weight: 5 },
    { key: "prop.fallen_log", weight: 6 },
    { key: "prop.rock_outcrop", weight: 5 },
  ],
  "terrain.rock": [
    { key: "prop.boulder", weight: 45 },
    { key: "prop.rock_outcrop", weight: 30 },
    { key: "prop.pine", weight: 15 },
    { key: "prop.dead_tree", weight: 10 },
  ],
  "terrain.mud": [
    { key: "prop.willow", weight: 30 },
    { key: "prop.dead_tree", weight: 22 },
    { key: "prop.roots", weight: 22 },
    { key: "prop.fallen_log", weight: 13 },
    { key: "prop.mushrooms", weight: 8 },
    { key: "prop.giant_shroom", weight: 3 },
    { key: "prop.stump", weight: 2 },
  ],
  "terrain.swamp": [
    { key: "prop.reeds", weight: 36 },
    { key: "prop.cattails", weight: 20 },
    { key: "prop.willow", weight: 20 },
    { key: "prop.roots", weight: 9 },
    { key: "prop.mushrooms", weight: 8 },
    { key: "prop.giant_shroom", weight: 4 },
    { key: "prop.dead_tree", weight: 3 },
  ],
};

/** Ungated light scatter per biome (small, non-blocking flavor). */
const SCATTER_SPECIES: Readonly<Record<string, readonly SpeciesWeight[]>> = {
  "terrain.grass": [
    { key: "prop.bush", weight: 30 },
    { key: "prop.flowers", weight: 28 },
    { key: "prop.sapling", weight: 14 },
    { key: "prop.mushrooms", weight: 10 },
    { key: "prop.ferns", weight: 10 },
    { key: "prop.fallen_log", weight: 5 },
    { key: "prop.stump", weight: 3 },
  ],
  "terrain.dry_grass": [
    { key: "prop.desert_shrub", weight: 48 },
    { key: "prop.flowers", weight: 18 },
    { key: "prop.bush", weight: 18 },
    { key: "prop.cactus", weight: 12 },
    { key: "prop.bone_pile", weight: 4 },
  ],
  "terrain.snow": [
    { key: "prop.snow_shrub", weight: 62 },
    { key: "prop.fallen_log", weight: 12 },
    { key: "prop.stump", weight: 14 },
    { key: "prop.boulder", weight: 8 },
    { key: "prop.dead_tree", weight: 4 },
  ],
  "terrain.rock": [
    { key: "prop.rock_outcrop", weight: 40 },
    { key: "prop.boulder", weight: 30 },
    { key: "prop.dead_tree", weight: 14 },
    { key: "prop.pine", weight: 16 },
  ],
  "terrain.mud": [
    { key: "prop.roots", weight: 46 },
    { key: "prop.reeds", weight: 32 },
    { key: "prop.mushrooms", weight: 14 },
    { key: "prop.cattails", weight: 8 },
  ],
  "terrain.swamp": [
    { key: "prop.reeds", weight: 50 },
    { key: "prop.cattails", weight: 40 },
    { key: "prop.mushrooms", weight: 10 },
  ],
};

/** Forest patch-roll base chance permille (before the patch gate). */
const FOREST_BASE_PERMILLE: Readonly<Record<string, number>> = {
  "terrain.grass": 900,
  "terrain.dry_grass": 520,
  "terrain.snow": 850,
  "terrain.rock": 340,
  "terrain.mud": 620,
  "terrain.swamp": 520,
};

/** Flat scatter chance permille per biome. */
const SCATTER_PERMILLE: Readonly<Record<string, number>> = {
  "terrain.grass": 72,
  "terrain.dry_grass": 62,
  "terrain.snow": 50,
  "terrain.rock": 74,
  "terrain.mud": 70,
  "terrain.swamp": 72,
};

export interface DecorationResult {
  /** Row-major; index + 1 into DECOR_TYPES, 0 = none. */
  readonly propLayer: Uint8Array;
  /** Row-major 0/1. */
  readonly mossLayer: Uint8Array;
  readonly tallGrassLayer: Uint8Array;
  /** Row-major; index + 1 into DECAL_TYPES, 0 = none. */
  readonly decalLayer: Uint8Array;
  readonly propCount: number;
  readonly decalCount: number;
  readonly overlayCount: number;
}

/** Smoothstep-free integer bilinear lattice noise in [0, 1000). */
function latticePermille(noise: Channel, x: number, y: number, period: number, salt: number): number {
  const ix = floorDiv(x, period);
  const iy = floorDiv(y, period);
  const qx = ((x - ix * period) * 1000) / period;
  const qy = ((y - iy * period) * 1000) / period;
  const n00 = noise.hashAt(ix, iy, salt) % 1000;
  const n10 = noise.hashAt(ix + 1, iy, salt) % 1000;
  const n01 = noise.hashAt(ix, iy + 1, salt) % 1000;
  const n11 = noise.hashAt(ix + 1, iy + 1, salt) % 1000;
  const top = n00 * (1000 - qx) + n10 * qx;
  const bottom = n01 * (1000 - qx) + n11 * qx;
  return Math.floor((top * (1000 - qy) + bottom * qy) / 1_000_000);
}

const CARDINALS: readonly (readonly [number, number])[] = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
];

function cellIn(x: number, y: number, width: number, height: number): number {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return -1;
  }
  return y * width + x;
}

export function decorateWorld(
  grid: readonly number[],
  structureLayer: Uint8Array,
  hydro: HydrologyResult,
  routesResult: RoutesResult,
  entranceCells: readonly number[],
  config: ResolvedWorldConfig,
  farms: FarmResult,
  streetFordCells: readonly number[],
  laneCells: readonly number[] = [],
): DecorationResult {
  const { width, height } = config.world;
  const cellCount = width * height;
  const propLayer = new Uint8Array(cellCount);
  const mossLayer = new Uint8Array(cellCount);
  const tallGrassLayer = new Uint8Array(cellCount);
  const decalLayer = new Uint8Array(cellCount);
  const density = config.decoration.densityPermille;
  if (density === 0) {
    return { propLayer, mossLayer, tallGrassLayer, decalLayer, propCount: 0, decalCount: 0, overlayCount: 0 };
  }

  const seed = config.seed;
  const forestField = channel(seed, "decor.forest_field");
  const forestRoll = channel(seed, "decor.forest_roll");
  const scatterRoll = channel(seed, "decor.scatter");
  const overlayField = channel(seed, "decor.overlays");
  const decalRoll = channel(seed, "decor.decals");
  const roadside = channel(seed, "decor.roadside");

  const roadValue = PALETTE_INDEX["terrain.packed_road"];
  const cobbleValue = PALETTE_INDEX["terrain.cobble"];
  const gravelValue = PALETTE_INDEX["terrain.gravel"];
  const paletteKey = (index: number): string => WORLD_PALETTE[index] ?? "";

  // Protected cells: traversal-critical or structural. Blocking props also
  // keep a one-cell apron around structures (door approaches).
  const protectedCells = new Uint8Array(cellCount);
  for (let index = 0; index < cellCount; index += 1) {
    const material = grid[index] as number;
    if (
      material === roadValue ||
      material === cobbleValue ||
      routesResult.pathLayer[index] === 1 ||
      structureLayer[index] !== 0 ||
      farms.cropLayer[index] !== 0 ||
      farms.fenceLayer[index] !== 0 ||
      farms.pierLayer[index] !== 0
    ) {
      protectedCells[index] = 1;
    }
  }
  for (const route of routesResult.routes) {
    for (const crossing of route.crossings) {
      protectedCells[crossing.cell] = 1;
    }
  }
  // Street-ford cells (composeWorld's single source of truth) stay open to
  // cosmetic props (reeds beside the crossing read fine) but must never
  // take a BLOCKING prop: the §3 ladder walks fords, and a blocking prop
  // there severs the street. The first blocked ford appeared on the first
  // 1024-cell map — smaller worlds had simply never rolled one.
  const fordCells = new Uint8Array(cellCount);
  for (const cell of streetFordCells) {
    fordCells[cell] = 1;
  }
  for (const route of routesResult.routes) {
    for (const crossing of route.crossings) {
      fordCells[crossing.cell] = 1;
    }
  }
  for (const cell of entranceCells) {
    protectedCells[cell] = 1;
    const x = cell % width;
    if (cell - width >= 0) protectedCells[cell - width] = 1;
    if (cell + width < cellCount) protectedCells[cell + width] = 1;
    if (x > 0) protectedCells[cell - 1] = 1;
    if (x < width - 1) protectedCells[cell + 1] = 1;
  }
  // Worn/unpainted approach lanes (behavior 50): a verified route that grew
  // grass back is still the way to somebody's door — no props on it, same
  // as the solid cobble it replaced. Cell-exact, no halo.
  for (const cell of laneCells) {
    protectedCells[cell] = 1;
  }
  const nearStructure = (index: number): boolean => {
    const x = index % width;
    return (
      (index - width >= 0 && structureLayer[index - width] !== 0) ||
      (index + width < cellCount && structureLayer[index + width] !== 0) ||
      (x > 0 && structureLayer[index - 1] !== 0) ||
      (x < width - 1 && structureLayer[index + 1] !== 0)
    );
  };

  const typeIndex = new Map<string, number>();
  DECOR_TYPES.forEach((key, index) => typeIndex.set(key, index + 1));
  const decalIndex = new Map<string, number>();
  DECAL_TYPES.forEach((key, index) => decalIndex.set(key, index + 1));

  const place = (index: number, key: (typeof DECOR_TYPES)[number], x: number, y: number): boolean => {
    if (propLayer[index] !== 0) return false;
    if (BLOCKING.has(key) && (nearStructure(index) || fordCells[index] === 1)) return false;
    if (TWO_PART.has(key) && y > 0 && structureLayer[index - width] !== 0) return false;
    propLayer[index] = typeIndex.get(key) as number;
    return true;
  };

  // Density preset (density.presets v1): ambientPermille scales scatter,
  // forest bases, and zone count — not every map is this populated.
  const ambient = config.decoration.ambientPermille;
  const scaled = (value: number): number => Math.min(960, Math.trunc((value * ambient) / 1000));

  let propCount = 0;
  let overlayCount = 0;
  let decalCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (protectedCells[index] === 1) continue;
      const biome = paletteKey(grid[index] as number);

      // Forest roll: patch-gated canopy and large features. The gate rises
      // linearly from the treeline at 350 so forest cores close their canopy
      // while meadows stay clear (measured: dense grass blocks reach ~40-60%
      // tree occupancy at density 400, empty blocks survive).
      const forest = FOREST_SPECIES[biome];
      if (forest !== undefined) {
        const patch = latticePermille(forestField, x, y, 12, 0);
        const gate = Math.max(0, patch - 350);
        const base = scaled(FOREST_BASE_PERMILLE[biome] ?? 0);
        const chance = Math.floor((base * gate * density) / (650 * 400));
        if (forestRoll.permilleAt(x, y) < chance) {
          const pick = forestRoll.weightedPickAt(x, y, forest.map((s) => s.weight), 1);
          if (place(index, (forest[pick] as SpeciesWeight).key, x, y)) {
            propCount += 1;
            continue;
          }
        }
      }

      // Flat light scatter (non-blocking flavor).
      const scatter = SCATTER_SPECIES[biome];
      if (scatter !== undefined && propLayer[index] === 0) {
        const chance = Math.floor((scaled(SCATTER_PERMILLE[biome] ?? 0) * density) / 400);
        if (scatterRoll.permilleAt(x, y) < chance) {
          const pick = scatterRoll.weightedPickAt(x, y, scatter.map((s) => s.weight), 1);
          if (place(index, (scatter[pick] as SpeciesWeight).key, x, y)) {
            propCount += 1;
          }
        }
      }
    }
  }

  // Ground overlays: tall grass on grass/dry grass, moss on moist rock —
  // both in lattice patches, never per-cell confetti.
  const grassValue = PALETTE_INDEX["terrain.grass"];
  const dryGrassValue = PALETTE_INDEX["terrain.dry_grass"];
  const rockValue = PALETTE_INDEX["terrain.rock"];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (protectedCells[index] === 1) continue;
      const material = grid[index] as number;
      if (material === grassValue || material === dryGrassValue) {
        const patch = latticePermille(overlayField, x, y, 9, 1);
        if (patch > 620 && overlayField.permilleAt(x, y, 2) < 780) {
          tallGrassLayer[index] = 1;
          overlayCount += 1;
        }
      } else if (material === rockValue) {
        const patch = latticePermille(overlayField, x, y, 9, 3);
        if (patch > 660 && overlayField.permilleAt(x, y, 4) < 700) {
          mossLayer[index] = 1;
          overlayCount += 1;
        }
      }
    }
  }

  // Ground decals: one per cell, semantic causes only.
  const deciduous = new Set<number>([
    typeIndex.get("prop.oak") as number,
    typeIndex.get("prop.birch") as number,
    typeIndex.get("prop.fruit_tree") as number,
  ]);
  const mudValue = PALETTE_INDEX["terrain.mud"];
  const swampValue = PALETTE_INDEX["terrain.swamp"];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const material = grid[index] as number;
      const isWater = hydro.waterKind[index] !== WATER_NONE;

      const isStream = hydro.isRiver[index] !== 0;
      if (isWater) {
        // Lily pads on pond shallows: mostly-enclosed water, calm read.
        if (!isStream && decalRoll.permilleAt(x, y, 0) < 70) {
          let landNeighbors = 0;
          for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (hydro.waterKind[ny * width + nx] === WATER_NONE) landNeighbors += 1;
          }
          if (landNeighbors >= 3) {
            decalLayer[index] = decalIndex.get("decal.lilypads") as number;
            decalCount += 1;
          }
        }
        continue;
      }
      if (protectedCells[index] === 1) continue;
      // Cosmetic decals never sit on stream cells or blocked terrain: the
      // package's reference walkability grants passage for ANY walkable-true
      // decal over blocked ground (its prose limits that to stepping stones,
      // frost, and ford) — staying off blocked substrates keeps worlds
      // unambiguous under either reading. Upstream question recorded.
      if (isStream) continue;

      if (propLayer[index] === 0 && material === grassValue) {
        // Leaf litter beside deciduous trees.
        let besideTree = false;
        for (const offset of [index - width, index + width, index - 1, index + 1]) {
          if (offset >= 0 && offset < cellCount && deciduous.has(propLayer[offset] as number)) {
            besideTree = true;
            break;
          }
        }
        if (besideTree && decalRoll.permilleAt(x, y, 1) < 320) {
          decalLayer[index] = decalIndex.get("decal.leaves") as number;
          decalCount += 1;
          continue;
        }
      }
      if (material === mudValue) {
        if (decalRoll.permilleAt(x, y, 2) < 55) {
          decalLayer[index] = decalIndex.get("decal.puddles") as number;
          decalCount += 1;
          continue;
        }
      }
      if (material === gravelValue) {
        let besideOutcrop = false;
        const outcrop = typeIndex.get("prop.rock_outcrop") as number;
        for (const offset of [index - width, index + width, index - 1, index + 1]) {
          if (offset >= 0 && offset < cellCount && propLayer[offset] === outcrop) {
            besideOutcrop = true;
            break;
          }
        }
        if (besideOutcrop && decalRoll.permilleAt(x, y, 3) < 300) {
          decalLayer[index] = decalIndex.get("decal.rubble") as number;
          decalCount += 1;
          continue;
        }
      }
      // Driftwood on open walkable banks (beaches included).
      const walkableBank =
        material === grassValue || material === dryGrassValue ||
        material === mudValue || material === gravelValue ||
        material === PALETTE_INDEX["terrain.sand"];
      if (walkableBank && propLayer[index] === 0 && decalRoll.permilleAt(x, y, 4) < 24) {
        let besideWater = false;
        for (const offset of [index - width, index + width, index - 1, index + 1]) {
          if (offset >= 0 && offset < cellCount && hydro.waterKind[offset] !== WATER_NONE) {
            besideWater = true;
            break;
          }
        }
        if (besideWater) {
          decalLayer[index] = decalIndex.get("decal.driftwood") as number;
          decalCount += 1;
        }
      }
    }
  }

  // Waterline life: reed and cattail fringes on calm lake shallows, and
  // working clutter around piers (a moored rowboat at the head, nets on the
  // shore cell, a buoy out in open water).
  const aquatic = channel(seed, "decor.aquatic");
  const reedsValue = typeIndex.get("prop.reeds") as number;
  const cattailsValue = typeIndex.get("prop.cattails") as number;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (hydro.waterKind[index] === WATER_NONE || hydro.isRiver[index] !== 0) continue;
      if (farms.pierLayer[index] !== 0 || propLayer[index] !== 0 || decalLayer[index] !== 0) continue;
      let landNeighbors = 0;
      for (const [dx, dy] of CARDINALS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (hydro.waterKind[ny * width + nx] === WATER_NONE) landNeighbors += 1;
      }
      if (landNeighbors >= 2 && aquatic.permilleAt(x, y, 0) < 130) {
        propLayer[index] = aquatic.permilleAt(x, y, 1) < 550 ? reedsValue : cattailsValue;
        propCount += 1;
      }
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (farms.pierLayer[index] === 0) continue;
      let pierNeighbors = 0;
      let landward = -1;
      let seaward: readonly [number, number] | null = null;
      for (const [dx, dy] of CARDINALS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const neighbor = ny * width + nx;
        if (farms.pierLayer[neighbor] !== 0) pierNeighbors += 1;
        else if (hydro.waterKind[neighbor] === WATER_NONE) landward = neighbor;
        else seaward = [dx, dy];
      }
      if (pierNeighbors > 1) continue; // interior pier cells
      if (landward !== -1 && propLayer[landward] === 0 && protectedCells[landward] === 0) {
        propLayer[landward] = typeIndex.get("prop.fishnets") as number;
        propCount += 1;
      }
      if (seaward !== null) {
        const [dx, dy] = seaward;
        const moor = (y + dy) * width + x + dx;
        if (moor >= 0 && moor < cellCount && propLayer[moor] === 0 && farms.pierLayer[moor] === 0 && fordCells[moor] === 0) {
          propLayer[moor] = typeIndex.get("prop.rowboat") as number;
          propCount += 1;
        }
        const buoyX = x + dx * 3;
        const buoyY = y + dy * 3;
        const buoy = cellIn(buoyX, buoyY, width, height);
        if (buoy !== -1 && hydro.waterKind[buoy] !== WATER_NONE && propLayer[buoy] === 0 && farms.pierLayer[buoy] === 0 && fordCells[buoy] === 0) {
          propLayer[buoy] = typeIndex.get("prop.buoy") as number;
          propCount += 1;
        }
      }
    }
  }

  // Roadside markers: milestones on straight highway runs, signposts at
  // junctions — beside the corridor, never on it.
  const sideOffsets = [-width, width, -1, 1] as const;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (grid[index] !== roadValue) continue;
      let corridorNeighbors = 0;
      for (const offset of sideOffsets) {
        const neighbor = index + offset;
        if (neighbor < 0 || neighbor >= cellCount) continue;
        if (grid[neighbor] === roadValue || grid[neighbor] === cobbleValue) corridorNeighbors += 1;
      }
      const junction = corridorNeighbors >= 3;
      const chance = junction ? 100 : 12;
      if (roadside.permilleAt(x, y, 0) >= chance) continue;
      const key = junction ? "prop.signpost" : "prop.milestone";
      for (const offset of sideOffsets) {
        const side = index + offset;
        if (side < 0 || side >= cellCount) continue;
        if (protectedCells[side] === 1 || propLayer[side] !== 0) continue;
        const sideBiome = paletteKey(grid[side] as number);
        if (!(sideBiome in FOREST_SPECIES) && sideBiome !== "terrain.gravel") continue;
        const sideY = Math.floor(side / width);
        if (place(side, key, side % width, sideY)) {
          propCount += 1;
          break;
        }
      }
    }
  }

  // Character zones (decoration.props v6, the empty-spots verdict): the
  // big open stretches become distinct places — a flower meadow, a
  // blighted grove, a mushroom glen, a burned wood, a boulder field, a
  // cactus flat. Each is an irregular blob that OVERRIDES ambient
  // decoration, so it reads as a place at overview scale, not texture.
  {
    interface ZoneKind {
      readonly name: string;
      readonly biomes: ReadonlySet<string>;
      readonly species: readonly SpeciesWeight[];
      readonly decal?: { readonly key: (typeof DECAL_TYPES)[number]; readonly permille: number };
      readonly density: number;
    }
    const ZONE_KINDS: readonly ZoneKind[] = [
      {
        name: "flower_meadow",
        biomes: new Set(["terrain.grass"]),
        species: [
          { key: "prop.flowers", weight: 42 },
          { key: "prop.flower_bed", weight: 22 },
          { key: "prop.fruit_tree", weight: 12 },
          { key: "prop.beehive", weight: 6 },
          { key: "prop.bush", weight: 18 },
        ],
        density: 500,
      },
      {
        name: "blighted_grove",
        biomes: new Set(["terrain.grass", "terrain.mud"]),
        species: [
          { key: "prop.corrupted_tree", weight: 40 },
          { key: "prop.dead_tree", weight: 22 },
          { key: "prop.mushrooms", weight: 20 },
          { key: "prop.roots", weight: 18 },
        ],
        decal: { key: "decal.webs", permille: 90 },
        density: 540,
      },
      {
        name: "shroom_glen",
        biomes: new Set(["terrain.grass", "terrain.mud"]),
        species: [
          { key: "prop.giant_shroom", weight: 24 },
          { key: "prop.mushrooms", weight: 46 },
          { key: "prop.ferns", weight: 30 },
        ],
        density: 520,
      },
      {
        name: "burned_wood",
        biomes: new Set(["terrain.grass", "terrain.snow"]),
        species: [
          { key: "prop.burned_tree", weight: 40 },
          { key: "prop.dead_tree", weight: 22 },
          { key: "prop.ash_pile", weight: 24 },
          { key: "prop.stump", weight: 14 },
        ],
        decal: { key: "decal.scorch", permille: 120 },
        density: 500,
      },
      {
        name: "boulder_field",
        biomes: new Set(["terrain.grass", "terrain.dry_grass", "terrain.snow"]),
        species: [
          { key: "prop.boulder", weight: 46 },
          { key: "prop.rock_outcrop", weight: 32 },
          { key: "prop.stump", weight: 8 },
          { key: "prop.bush", weight: 14 },
        ],
        decal: { key: "decal.rubble", permille: 100 },
        density: 480,
      },
      {
        name: "cactus_flat",
        biomes: new Set(["terrain.dry_grass"]),
        species: [
          { key: "prop.cactus", weight: 52 },
          { key: "prop.desert_shrub", weight: 32 },
          { key: "prop.boulder", weight: 16 },
        ],
        density: 500,
      },
    ];
    const zones = channel(seed, "decor.zones");
    const zoneTarget = Math.max(2, Math.trunc((Math.trunc(width / 16) * ambient) / 1000));
    const centers: Array<readonly [number, number]> = [];
    const attempts = zoneTarget * 30;
    for (let attempt = 0; attempt < attempts && centers.length < zoneTarget; attempt += 1) {
      const cx = zones.intAt(attempt, 0, 10, width - 20, 0) + 10;
      const cy = zones.intAt(attempt, 1, 10, height - 20, 0) + 10;
      const center = cy * width + cx;
      if (protectedCells[center] === 1) continue;
      const centerBiome = paletteKey(grid[center] as number);
      const eligible = ZONE_KINDS.filter((kind) => kind.biomes.has(centerBiome));
      if (eligible.length === 0) continue;
      let spaced = true;
      for (const [ox, oy] of centers) {
        if (Math.max(Math.abs(ox - cx), Math.abs(oy - cy)) < 26) {
          spaced = false;
          break;
        }
      }
      if (!spaced) continue;
      const kind = eligible[zones.intAt(attempt, 2, 0, eligible.length, 0)] as ZoneKind;
      const radius = 9 + zones.intAt(attempt, 3, 0, 8, 0);
      const weights = kind.species.map((s) => s.weight);
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const index = y * width + x;
          if (protectedCells[index] === 1) continue;
          if (!kind.biomes.has(paletteKey(grid[index] as number))) continue;
          // Irregular edge: distance falloff against a per-cell roll.
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          if (zones.permilleAt(x, y, 4) < Math.trunc((distance * 850) / (radius + 1))) continue;
          // The zone replaces ambient decoration outright.
          propLayer[index] = 0;
          decalLayer[index] = 0;
          if (zones.permilleAt(x, y, 5) < kind.density) {
            const pick = zones.weightedPickAt(x, y, weights, 6);
            const key = (kind.species[pick] as SpeciesWeight).key;
            if (place(index, key, x, y)) propCount += 1;
          } else if (kind.decal !== undefined && zones.permilleAt(x, y, 7) < kind.decal.permille) {
            decalLayer[index] = decalIndex.get(kind.decal.key) as number;
            decalCount += 1;
          }
        }
      }
      centers.push([cx, cy]);
    }
  }

  return { propLayer, mossLayer, tallGrassLayer, decalLayer, propCount, decalCount, overlayCount };
}
