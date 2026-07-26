/**
 * Version constants that participate in generation identity
 * (docs/ARCHITECTURE_AND_CONTRACTS.md, "Determinism contract"). Bumping any of
 * these is a behavior change that must not silently rewrite existing worlds.
 */

export const GENERATOR_NAME = "worldforge";

/** Keep in sync with package.json. */
export const GENERATOR_VERSION = "0.1.0";

/**
 * Behavior version of the generation passes. W2 macro: 2. W3 hydrology: 3.
 * 9: decoration stage 1 (vegetation, ground cover, roadside markers).
 * 10: settlements.plans v2 — the W5.1 variety pool and the plaza fountain.
 */
export const GENERATOR_BEHAVIOR_VERSION = 10;

/** Behavior version of the WorldRecipe -> ResolvedWorldConfig compiler. */
export const RECIPE_COMPILER_VERSION = 9;

/** Versions of the named rule packs consumed by the recipe compiler. */
export const RULE_PACK_VERSIONS: { readonly [name: string]: number } = {
  "recipe.presets": 2,
  "macro.fields": 4,
  "macro.biomes": 1,
  "hydrology.water": 2,
  "routes.graph": 2,
  "settlements.plans": 2,
  "landmarks.stamps": 1,
  "decoration.props": 1,
  "adapter.tileforge": 3,
};

/**
 * Version of the TileForge resolution adapter itself. 2: the emitted river
 * layer carries the full two-tier network so fords sit on rendered runs.
 * 3: street-level ford decals wherever a stream crosses a corridor material,
 * so the §3 walkability ladder never severs a street.
 */
export const TILEFORGE_ADAPTER_VERSION = 3;
