import { canonicalSha256 } from "../core/identity.js";
import {
  GENERATOR_BEHAVIOR_VERSION,
  GENERATOR_NAME,
  GENERATOR_VERSION,
  RECIPE_COMPILER_VERSION,
  RULE_PACK_VERSIONS,
} from "../core/version.js";
import type { ClimatePreset, NormalizedWorldRecipe, SizePreset } from "./schema.js";

/**
 * RecipeCompiler v1 (docs/ARCHITECTURE_AND_CONTRACTS.md, "Recipe and resolved
 * configuration contract"): expands presets through the pinned rule packs into
 * fully explicit generator parameters. The output is derived data — hashed for
 * verification, never independently authored.
 */

/** recipe.presets rule pack, version 1. Values are explicit and versioned. */
const SIZE_RULES: { readonly [key in SizePreset]: WorldDimensions } = {
  tiny: { width: 64, height: 64, chunkWidth: 16, chunkHeight: 16 },
  small: { width: 256, height: 256, chunkWidth: 32, chunkHeight: 32 },
};

const CLIMATE_RULES: { readonly [key in ClimatePreset]: ClimateBase } = {
  temperate: {
    baseTemperaturePermille: 0,
    baseMoisturePermille: 0,
    coastalInfluencePermille: 0,
  },
  cold_coastal: {
    baseTemperaturePermille: -400,
    baseMoisturePermille: 200,
    coastalInfluencePermille: 500,
  },
};

interface WorldDimensions {
  readonly width: number;
  readonly height: number;
  readonly chunkWidth: number;
  readonly chunkHeight: number;
}

interface ClimateBase {
  readonly baseTemperaturePermille: number;
  readonly baseMoisturePermille: number;
  readonly coastalInfluencePermille: number;
}

export interface ResolvedWorldConfig {
  readonly resolvedConfigFormat: 1;
  readonly recipeCompilerVersion: number;
  readonly generatorBehaviorVersion: number;
  readonly rulePackVersions: { readonly [name: string]: number };
  readonly seed: number;
  readonly world: WorldDimensions;
  readonly climate: ClimateBase & {
    readonly northElevationBiasPermille: number;
    readonly temperatureBiasPermille: number;
    readonly moistureBiasPermille: number;
  };
  readonly budgets: NormalizedWorldRecipe["budgets"];
  /** Named generation passes enabled at this behavior version. */
  readonly passes: readonly string[];
  /** W0A: no TileForge package is pinned yet; adapter stages stay disabled. */
  readonly dependencies: { readonly tileforge: null };
}

export function compileRecipe(normalized: NormalizedWorldRecipe): ResolvedWorldConfig {
  const size = SIZE_RULES[normalized.world.sizePreset];
  const climate = CLIMATE_RULES[normalized.world.climatePreset];
  return {
    resolvedConfigFormat: 1,
    recipeCompilerVersion: RECIPE_COMPILER_VERSION,
    generatorBehaviorVersion: GENERATOR_BEHAVIOR_VERSION,
    rulePackVersions: RULE_PACK_VERSIONS,
    seed: normalized.seed,
    world: size,
    climate: {
      ...climate,
      northElevationBiasPermille: normalized.biases.northElevationPermille,
      temperatureBiasPermille: normalized.biases.temperaturePermille,
      moistureBiasPermille: normalized.biases.moisturePermille,
    },
    budgets: normalized.budgets,
    passes: ["terrain.base"],
    dependencies: { tileforge: null },
  };
}

export function resolvedConfigIdentity(config: ResolvedWorldConfig): string {
  return canonicalSha256(config);
}

/**
 * Generation identity (docs/ARCHITECTURE_AND_CONTRACTS.md): normalized recipe
 * (which contains the seed) + compiler version + generator version + rule-pack
 * versions + pinned dependency identities. The resolved-config hash is derived
 * verification, not an identity input.
 */
export function generationIdentity(
  normalized: NormalizedWorldRecipe,
  config: ResolvedWorldConfig,
): string {
  return canonicalSha256({
    dependencies: config.dependencies,
    generatorBehaviorVersion: GENERATOR_BEHAVIOR_VERSION,
    generatorName: GENERATOR_NAME,
    generatorVersion: GENERATOR_VERSION,
    normalizedRecipe: normalized,
    recipeCompilerVersion: RECIPE_COMPILER_VERSION,
    rulePackVersions: RULE_PACK_VERSIONS,
  });
}
