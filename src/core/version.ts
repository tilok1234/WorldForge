/**
 * Version constants that participate in generation identity
 * (docs/ARCHITECTURE_AND_CONTRACTS.md, "Determinism contract"). Bumping any of
 * these is a behavior change that must not silently rewrite existing worlds.
 */

export const GENERATOR_NAME = "worldforge";

/** Keep in sync with package.json. */
export const GENERATOR_VERSION = "0.1.0";

/** Behavior version of the generation passes. W2 macro: 2. W3 hydrology: 3. */
export const GENERATOR_BEHAVIOR_VERSION = 3;

/** Behavior version of the WorldRecipe -> ResolvedWorldConfig compiler. */
export const RECIPE_COMPILER_VERSION = 3;

/** Versions of the named rule packs consumed by the recipe compiler. */
export const RULE_PACK_VERSIONS: { readonly [name: string]: number } = {
  "recipe.presets": 1,
  "macro.fields": 2,
  "macro.biomes": 1,
  "hydrology.water": 1,
};
