import { recipeIdentity } from "../recipe/normalize.js";
import {
  generationIdentity,
  resolvedConfigIdentity,
  type ResolvedWorldConfig,
} from "../recipe/compile.js";
import type { NormalizedWorldRecipe } from "../recipe/schema.js";
import {
  GENERATOR_BEHAVIOR_VERSION,
  GENERATOR_NAME,
  GENERATOR_VERSION,
  RECIPE_COMPILER_VERSION,
} from "../core/version.js";
import { composeWorld, type ComposedWorld } from "./composeWorld.js";
import { WORLD_PALETTE } from "../regions/biomes.js";
import { STRUCTURE_TYPES } from "../settlements/structures.js";
import { DECAL_TYPES, DECOR_TYPES } from "../decoration/decorate.js";
import { CROP_TYPES, FENCE_TYPES, PIER_TYPES } from "../settlements/farms.js";

/**
 * Format 4 (Milestone W5): adds the structure layer, settlements, landmarks.
 * Format 5 (decoration stage 1): prop/moss/tallgrass/decal layers plus the
 * propTypes/decalTypes key tables.
 * Format 6 (stage 3): crop/fence/pier layers plus their key tables (crop
 * values are cropTypeIndex*16 + growth stage 1-4).
 */
export const ARTIFACT_FORMAT_VERSION = 6;

export interface WorldArtifact {
  readonly formatVersion: number;
  readonly generator: {
    readonly name: string;
    readonly version: string;
    readonly seed: number;
    readonly generatorBehaviorVersion: number;
    readonly recipeCompilerVersion: number;
    readonly recipeSha256: string;
    readonly resolvedConfigSha256: string;
    readonly generationIdentitySha256: string;
  };
  /** Explicit conventions so no consumer has to guess axis or array order. */
  readonly coordinates: {
    readonly origin: "top-left";
    readonly xIncreases: "eastward";
    readonly yIncreases: "southward";
    readonly cellOrder: "row-major";
    readonly chunkOrder: "row-major";
  };
  readonly dimensions: {
    readonly width: number;
    readonly height: number;
    readonly chunkWidth: number;
    readonly chunkHeight: number;
  };
  readonly dependencies: {
    readonly tileforge: {
      readonly packageId: string;
      readonly packageSha256: string;
      readonly manifestSha256: string;
    } | null;
  };
  /** Material layer values index into this palette of semantic keys. */
  readonly semanticPalette: readonly string[];
  /** Structure layer values are 1-based indexes into this list. */
  readonly structureTypes: readonly string[];
  /** Prop layer values are 1-based indexes into this list. */
  readonly propTypes: readonly string[];
  /** Decal layer values are 1-based indexes into this list. */
  readonly decalTypes: readonly string[];
  /** Crop layer values are (1-based index into this list) * 16 + stage. */
  readonly cropTypes: readonly string[];
  /** Fence layer values are 1-based indexes into this list. */
  readonly fenceTypes: readonly string[];
  /** Pier layer values are 1-based indexes into this list. */
  readonly pierTypes: readonly string[];
  readonly hydrology: {
    readonly seaLevelPermille: number;
    readonly oceanCellCount: number;
    readonly lakeCount: number;
    readonly riverCellCount: number;
    readonly networkRiverCellCount: number;
    readonly riverSourceCount: number;
    readonly wetlandCellCount: number;
  };
  readonly destinations: ReadonlyArray<{
    readonly id: number;
    readonly kind: string;
    readonly cell: readonly [number, number];
  }>;
  readonly regions: ReadonlyArray<{
    readonly id: number;
    readonly biome: string;
    readonly cellCount: number;
  }>;
  readonly settlements: ReadonlyArray<{
    readonly id: number;
    readonly kind: string;
    readonly purpose: string;
    readonly anchor: readonly [number, number];
    readonly radius: number;
    readonly structures: ReadonlyArray<{
      readonly type: string;
      readonly cell: readonly [number, number];
      readonly footprint: readonly [number, number];
      readonly entrance: readonly [number, number];
    }>;
  }>;
  readonly landmarks: ReadonlyArray<{
    readonly id: number;
    readonly type: string;
    readonly cell: readonly [number, number];
    readonly footprint: readonly [number, number];
    readonly entrance: readonly [number, number];
  }>;
  readonly routes: ReadonlyArray<{
    readonly id: number;
    readonly routeClass: string;
    readonly from: readonly [number, number];
    readonly to: readonly [number, number];
    readonly length: number;
    readonly crossings: ReadonlyArray<{
      readonly cell: readonly [number, number];
      readonly kind: string;
    }>;
  }>;
  readonly chunks: ReadonlyArray<{
    readonly coord: readonly [number, number];
    readonly layers: {
      readonly material: ReadonlyArray<readonly number[]>;
      /** Raw terrain elevation, permille. */
      readonly elevation: ReadonlyArray<readonly number[]>;
      /** 1 where a river runs on land, else 0. */
      readonly river: ReadonlyArray<readonly number[]>;
      /** 1 where the dirt-path band (trail class) runs, else 0. */
      readonly path: ReadonlyArray<readonly number[]>;
      /** 0 = none, else 1-based index into structureTypes. */
      readonly structure: ReadonlyArray<readonly number[]>;
      /** 0 = none, else 1-based index into propTypes. */
      readonly prop: ReadonlyArray<readonly number[]>;
      /** 0/1 ground overlays. */
      readonly moss: ReadonlyArray<readonly number[]>;
      readonly tallgrass: ReadonlyArray<readonly number[]>;
      /** 0 = none, else 1-based index into decalTypes. */
      readonly decal: ReadonlyArray<readonly number[]>;
      /** 0 = none, else cropTypeIndex*16 + stage. */
      readonly crop: ReadonlyArray<readonly number[]>;
      /** 0 = none, else 1-based index into fenceTypes. */
      readonly fence: ReadonlyArray<readonly number[]>;
      /** 0 = none, else 1-based index into pierTypes. */
      readonly pier: ReadonlyArray<readonly number[]>;
    };
  }>;
}

export interface GenerationResult {
  readonly artifact: WorldArtifact;
  readonly composed: ComposedWorld;
}

export function generateWorldDetailed(
  normalized: NormalizedWorldRecipe,
  config: ResolvedWorldConfig,
): GenerationResult {
  const { width, height, chunkWidth, chunkHeight } = config.world;
  if (width % chunkWidth !== 0 || height % chunkHeight !== 0) {
    throw new Error("resolved dimensions must be divisible by chunk dimensions");
  }

  const composed = composeWorld(config);

  const chunksAcross = width / chunkWidth;
  const chunksDown = height / chunkHeight;
  const chunks: Array<{
    coord: readonly [number, number];
    layers: {
      material: number[][]; elevation: number[][]; river: number[][];
      path: number[][]; structure: number[][]; prop: number[][];
      moss: number[][]; tallgrass: number[][]; decal: number[][];
      crop: number[][]; fence: number[][]; pier: number[][];
    };
  }> = [];
  const layerSources: readonly (readonly [string, ArrayLike<number>])[] = [
    ["material", composed.grid as unknown as ArrayLike<number>],
    ["elevation", composed.fields.elevation],
    ["river", composed.hydro.isMajorRiver],
    ["path", composed.routesResult.pathLayer],
    ["structure", composed.structureLayer],
    ["prop", composed.decoration.propLayer],
    ["moss", composed.decoration.mossLayer],
    ["tallgrass", composed.decoration.tallGrassLayer],
    ["decal", composed.decoration.decalLayer],
    ["crop", composed.farms.cropLayer],
    ["fence", composed.farms.fenceLayer],
    ["pier", composed.farms.pierLayer],
  ];
  for (let cy = 0; cy < chunksDown; cy += 1) {
    for (let cx = 0; cx < chunksAcross; cx += 1) {
      const layers = {} as Record<string, number[][]>;
      for (const [name, source] of layerSources) {
        const rows: number[][] = [];
        for (let ly = 0; ly < chunkHeight; ly += 1) {
          const row = new Array<number>(chunkWidth);
          const worldY = cy * chunkHeight + ly;
          for (let lx = 0; lx < chunkWidth; lx += 1) {
            row[lx] = source[worldY * width + cx * chunkWidth + lx] as number;
          }
          rows.push(row);
        }
        layers[name] = rows;
      }
      chunks.push({
        coord: [cx, cy],
        layers: layers as unknown as (typeof chunks)[number]["layers"],
      });
    }
  }

  const artifact: WorldArtifact = {
    formatVersion: ARTIFACT_FORMAT_VERSION,
    generator: {
      name: GENERATOR_NAME,
      version: GENERATOR_VERSION,
      seed: normalized.seed,
      generatorBehaviorVersion: GENERATOR_BEHAVIOR_VERSION,
      recipeCompilerVersion: RECIPE_COMPILER_VERSION,
      recipeSha256: recipeIdentity(normalized),
      resolvedConfigSha256: resolvedConfigIdentity(config),
      generationIdentitySha256: generationIdentity(normalized, config),
    },
    coordinates: {
      origin: "top-left",
      xIncreases: "eastward",
      yIncreases: "southward",
      cellOrder: "row-major",
      chunkOrder: "row-major",
    },
    dimensions: { width, height, chunkWidth, chunkHeight },
    dependencies: config.dependencies,
    semanticPalette: [...WORLD_PALETTE],
    structureTypes: [...STRUCTURE_TYPES],
    propTypes: [...DECOR_TYPES],
    decalTypes: [...DECAL_TYPES],
    cropTypes: [...CROP_TYPES],
    fenceTypes: [...FENCE_TYPES],
    pierTypes: [...PIER_TYPES],
    hydrology: {
      seaLevelPermille: config.water.seaLevelPermille,
      oceanCellCount: composed.hydro.oceanCellCount,
      lakeCount: composed.hydro.lakeCount,
      riverCellCount: composed.hydro.majorRiverCellCount,
      networkRiverCellCount: composed.hydro.riverCellCount,
      riverSourceCount: composed.hydro.riverTraces.length,
      wetlandCellCount: composed.wetlandCellCount,
    },
    destinations: composed.routesResult.destinations.map((destination) => ({
      id: destination.id,
      kind: destination.kind,
      cell: [destination.cell % width, Math.trunc(destination.cell / width)] as const,
    })),
    regions: composed.regions.map((region) => ({
      id: region.id,
      biome: region.biome,
      cellCount: region.cellCount,
    })),
    settlements: composed.settlementPlans.map((plan) => ({
      id: plan.id,
      kind: plan.kind,
      purpose: plan.purpose,
      anchor: [plan.anchorX, plan.anchorY] as const,
      radius: plan.radius,
      structures: plan.structures.map((structure) => ({
        type: structure.type,
        cell: [structure.x, structure.y] as const,
        footprint: [structure.width, structure.height] as const,
        entrance: [structure.entranceX, structure.entranceY] as const,
      })),
    })),
    landmarks: composed.landmarkPlans.map((plan) => ({
      id: plan.id,
      type: plan.type,
      cell: [plan.x, plan.y] as const,
      footprint: [plan.width, plan.height] as const,
      entrance: [plan.entranceX, plan.entranceY] as const,
    })),
    routes: composed.routesResult.routes.map((route) => ({
      id: route.id,
      routeClass: route.routeClass,
      from: [route.fromCell % width, Math.trunc(route.fromCell / width)] as const,
      to: [route.toCell % width, Math.trunc(route.toCell / width)] as const,
      length: route.length,
      crossings: route.crossings.map((crossing) => ({
        cell: [crossing.cell % width, Math.trunc(crossing.cell / width)] as const,
        kind: crossing.kind,
      })),
    })),
    chunks,
  };

  return { artifact, composed };
}

export function generateWorld(
  normalized: NormalizedWorldRecipe,
  config: ResolvedWorldConfig,
): WorldArtifact {
  return generateWorldDetailed(normalized, config).artifact;
}
