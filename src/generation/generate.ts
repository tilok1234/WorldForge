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
  readonly regions: readonly unknown[];
  readonly settlements: readonly unknown[];
  readonly landmarks: readonly unknown[];
  readonly routes: readonly unknown[];
  readonly chunks: ReadonlyArray<{
    readonly coord: readonly [number, number];
    readonly layers: { readonly material: ReadonlyArray<readonly number[]> };
  }>;
}

/**
 * W0 walking skeleton: the single enabled pass (`terrain.base`) fills every
 * cell with `terrain.grass`. Real passes replace this stage from W2 onward;
 * the pipeline shape, identities, and validation are what W0 proves.
 */
export function generateWorld(
  normalized: NormalizedWorldRecipe,
  config: ResolvedWorldConfig,
): WorldArtifact {
  const { width, height, chunkWidth, chunkHeight } = config.world;
  if (width % chunkWidth !== 0 || height % chunkHeight !== 0) {
    throw new Error("resolved dimensions must be divisible by chunk dimensions");
  }
  const chunksAcross = width / chunkWidth;
  const chunksDown = height / chunkHeight;

  const chunks: Array<{
    coord: readonly [number, number];
    layers: { material: number[][] };
  }> = [];
  for (let cy = 0; cy < chunksDown; cy += 1) {
    for (let cx = 0; cx < chunksAcross; cx += 1) {
      const material = Array.from({ length: chunkHeight }, () =>
        new Array<number>(chunkWidth).fill(0),
      );
      chunks.push({ coord: [cx, cy], layers: { material } });
    }
  }

  return {
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
    semanticPalette: ["terrain.grass"],
    regions: [],
    settlements: [],
    landmarks: [],
    routes: [],
    chunks,
  };
}
