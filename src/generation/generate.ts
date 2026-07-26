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
import { buildMacroFields, type MacroFields } from "../fields/macroFields.js";
import { BIOME_KEYS, buildBiomeWorld, type BiomeWorld } from "../regions/biomes.js";

export const ARTIFACT_FORMAT_VERSION = 1;

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
  readonly dependencies: { readonly tileforge: null };
  /** Material layer values index into this palette of semantic keys. */
  readonly semanticPalette: readonly string[];
  readonly regions: ReadonlyArray<{
    readonly id: number;
    readonly biome: string;
    readonly cellCount: number;
  }>;
  readonly settlements: readonly unknown[];
  readonly landmarks: readonly unknown[];
  readonly routes: readonly unknown[];
  readonly chunks: ReadonlyArray<{
    readonly coord: readonly [number, number];
    readonly layers: { readonly material: ReadonlyArray<readonly number[]> };
  }>;
}

export interface GenerationResult {
  readonly artifact: WorldArtifact;
  /** Intermediate data for debug rendering and validation; not persisted. */
  readonly fields: MacroFields;
  readonly biomeWorld: BiomeWorld;
}

/**
 * W2 generation: macro fields (macro.fields pass) classified into biome
 * regions (regions.biomes pass); the material layer is the biome grid sliced
 * into chunks. Hydrology, routes, and placements arrive in later milestones.
 */
export function generateWorldDetailed(
  normalized: NormalizedWorldRecipe,
  config: ResolvedWorldConfig,
): GenerationResult {
  const { width, height, chunkWidth, chunkHeight } = config.world;
  if (width % chunkWidth !== 0 || height % chunkHeight !== 0) {
    throw new Error("resolved dimensions must be divisible by chunk dimensions");
  }

  const fields = buildMacroFields(config);
  const biomeWorld = buildBiomeWorld(fields, config);

  const chunksAcross = width / chunkWidth;
  const chunksDown = height / chunkHeight;
  const chunks: Array<{
    coord: readonly [number, number];
    layers: { material: number[][] };
  }> = [];
  for (let cy = 0; cy < chunksDown; cy += 1) {
    for (let cx = 0; cx < chunksAcross; cx += 1) {
      const material: number[][] = [];
      for (let ly = 0; ly < chunkHeight; ly += 1) {
        const row = new Array<number>(chunkWidth);
        const worldY = cy * chunkHeight + ly;
        for (let lx = 0; lx < chunkWidth; lx += 1) {
          const worldX = cx * chunkWidth + lx;
          row[lx] = biomeWorld.biomeGrid[worldY * width + worldX] as number;
        }
        material.push(row);
      }
      chunks.push({ coord: [cx, cy], layers: { material } });
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
    dependencies: { tileforge: null },
    semanticPalette: [...BIOME_KEYS],
    regions: biomeWorld.regions.map((region) => ({
      id: region.id,
      biome: region.biome,
      cellCount: region.cellCount,
    })),
    settlements: [],
    landmarks: [],
    routes: [],
    chunks,
  };

  return { artifact, fields, biomeWorld };
}

export function generateWorld(
  normalized: NormalizedWorldRecipe,
  config: ResolvedWorldConfig,
): WorldArtifact {
  return generateWorldDetailed(normalized, config).artifact;
}
