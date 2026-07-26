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
] as const;

/** Semantic ground-decal keys, stage 1. Layer stores index + 1 (0 = none). */
export const DECAL_TYPES = [
  "decal.leaves",
  "decal.puddles",
  "decal.lilypads",
  "decal.driftwood",
  "decal.rubble",
] as const;

/** Species that block movement (mirrors the package's prop walkability). */
const BLOCKING = new Set<string>([
  "prop.oak", "prop.birch", "prop.pine", "prop.willow", "prop.dead_tree",
  "prop.fruit_tree", "prop.stump", "prop.fallen_log", "prop.boulder",
  "prop.rock_outcrop", "prop.milestone", "prop.signpost",
]);

/** Two-part canopy species (§2.10): skip when a structure sits above. */
const TWO_PART = new Set<string>([
  "prop.oak", "prop.birch", "prop.pine", "prop.willow", "prop.dead_tree",
  "prop.fruit_tree",
]);

interface SpeciesWeight {
  readonly key: (typeof DECOR_TYPES)[number];
  readonly weight: number;
}

/** Forest-roll species per biome (patch-gated canopy and large features). */
const FOREST_SPECIES: Readonly<Record<string, readonly SpeciesWeight[]>> = {
  "terrain.grass": [
    { key: "prop.oak", weight: 52 },
    { key: "prop.birch", weight: 26 },
    { key: "prop.pine", weight: 8 },
    { key: "prop.fruit_tree", weight: 2 },
    { key: "prop.stump", weight: 6 },
    { key: "prop.fallen_log", weight: 6 },
  ],
  "terrain.dry_grass": [
    { key: "prop.dead_tree", weight: 34 },
    { key: "prop.desert_shrub", weight: 40 },
    { key: "prop.boulder", weight: 14 },
    { key: "prop.stump", weight: 12 },
  ],
  "terrain.snow": [
    { key: "prop.pine", weight: 72 },
    { key: "prop.snow_shrub", weight: 18 },
    { key: "prop.dead_tree", weight: 5 },
    { key: "prop.boulder", weight: 5 },
  ],
  "terrain.rock": [
    { key: "prop.boulder", weight: 45 },
    { key: "prop.rock_outcrop", weight: 30 },
    { key: "prop.pine", weight: 15 },
    { key: "prop.dead_tree", weight: 10 },
  ],
  "terrain.mud": [
    { key: "prop.willow", weight: 35 },
    { key: "prop.dead_tree", weight: 25 },
    { key: "prop.roots", weight: 25 },
    { key: "prop.fallen_log", weight: 15 },
  ],
  "terrain.swamp": [
    { key: "prop.reeds", weight: 40 },
    { key: "prop.cattails", weight: 22 },
    { key: "prop.willow", weight: 22 },
    { key: "prop.roots", weight: 10 },
    { key: "prop.mushrooms", weight: 6 },
  ],
};

/** Ungated light scatter per biome (small, non-blocking flavor). */
const SCATTER_SPECIES: Readonly<Record<string, readonly SpeciesWeight[]>> = {
  "terrain.grass": [
    { key: "prop.bush", weight: 34 },
    { key: "prop.flowers", weight: 30 },
    { key: "prop.sapling", weight: 16 },
    { key: "prop.mushrooms", weight: 10 },
    { key: "prop.ferns", weight: 10 },
  ],
  "terrain.dry_grass": [
    { key: "prop.desert_shrub", weight: 60 },
    { key: "prop.flowers", weight: 20 },
    { key: "prop.bush", weight: 20 },
  ],
  "terrain.snow": [{ key: "prop.snow_shrub", weight: 100 }],
  "terrain.mud": [
    { key: "prop.roots", weight: 60 },
    { key: "prop.reeds", weight: 40 },
  ],
  "terrain.swamp": [
    { key: "prop.reeds", weight: 55 },
    { key: "prop.cattails", weight: 45 },
  ],
};

/** Forest patch-roll base chance permille (before the patch gate). */
const FOREST_BASE_PERMILLE: Readonly<Record<string, number>> = {
  "terrain.grass": 900,
  "terrain.dry_grass": 320,
  "terrain.snow": 700,
  "terrain.rock": 140,
  "terrain.mud": 420,
  "terrain.swamp": 520,
};

/** Flat scatter chance permille per biome. */
const SCATTER_PERMILLE: Readonly<Record<string, number>> = {
  "terrain.grass": 26,
  "terrain.dry_grass": 22,
  "terrain.snow": 12,
  "terrain.mud": 30,
  "terrain.swamp": 45,
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

export function decorateWorld(
  grid: readonly number[],
  structureLayer: Uint8Array,
  hydro: HydrologyResult,
  routesResult: RoutesResult,
  entranceCells: readonly number[],
  config: ResolvedWorldConfig,
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
      structureLayer[index] !== 0
    ) {
      protectedCells[index] = 1;
    }
  }
  for (const route of routesResult.routes) {
    for (const crossing of route.crossings) {
      protectedCells[crossing.cell] = 1;
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
    if (BLOCKING.has(key) && nearStructure(index)) return false;
    if (TWO_PART.has(key) && y > 0 && structureLayer[index - width] !== 0) return false;
    propLayer[index] = typeIndex.get(key) as number;
    return true;
  };

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
        const base = FOREST_BASE_PERMILLE[biome] ?? 0;
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
        const chance = Math.floor(((SCATTER_PERMILLE[biome] ?? 0) * density) / 400);
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
        if (patch > 720 && overlayField.permilleAt(x, y, 2) < 640) {
          tallGrassLayer[index] = 1;
          overlayCount += 1;
        }
      } else if (material === rockValue) {
        const patch = latticePermille(overlayField, x, y, 9, 3);
        if (patch > 780 && overlayField.permilleAt(x, y, 4) < 520) {
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

      if (isWater) {
        // Lily pads on pond shallows: mostly-enclosed water, calm read.
        if (hydro.isRiver[index] === 0 && decalRoll.permilleAt(x, y, 0) < 70) {
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
      if (material === mudValue || material === swampValue) {
        if (decalRoll.permilleAt(x, y, 2) < 55) {
          decalLayer[index] = decalIndex.get("decal.puddles") as number;
          decalCount += 1;
          continue;
        }
      }
      if (material === rockValue || material === gravelValue) {
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
      // Driftwood on open banks.
      if (propLayer[index] === 0 && decalRoll.permilleAt(x, y, 4) < 24) {
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

  return { propLayer, mossLayer, tallGrassLayer, decalLayer, propCount, decalCount, overlayCount };
}
