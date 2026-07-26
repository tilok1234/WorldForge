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
 * 11: stage 3 — farm plots with pen fences, harbor piers, waterline life.
 * 12: settlements.plans v4 — town scale-up: street arms, bigger plazas and
 *     radii, market stalls, short street-hugging approaches.
 * 13: decoration v3 — cosmetic decals keep off streams and blocked terrain
 *     (the package reference walkability would turn them into passage).
 * 14: sand beaches on low sea-level shores (macro.biomes 2) — the first
 *     production use of the package's corner16 dual-grid sand system.
 * 15: wilderness points of interest, phase A (decoration.pois 1) — camps,
 *     stone rings, battlefields, graveyards, shrines, fishing spots.
 * 16: POIs phase B (decoration.pois 2) — structure discoveries: mines,
 *     cave mouths, the stone circle, crypts, ruins, the giant skeleton.
 * 17: the density pass (the 90%-unused verdict) — rocky knolls
 *     (macro.biomes 3), palisaded bandit camps, poi budget 36/12
 *     (decoration.pois 3).
 */
export const GENERATOR_BEHAVIOR_VERSION = 17;

/** Behavior version of the WorldRecipe -> ResolvedWorldConfig compiler. */
export const RECIPE_COMPILER_VERSION = 9;

/** Versions of the named rule packs consumed by the recipe compiler. */
export const RULE_PACK_VERSIONS: { readonly [name: string]: number } = {
  "recipe.presets": 2,
  "macro.fields": 4,
  "macro.biomes": 3,
  "hydrology.water": 2,
  "routes.graph": 2,
  "settlements.plans": 4,
  "landmarks.stamps": 1,
  "decoration.props": 3,
  "decoration.pois": 3,
  "adapter.tileforge": 3,
};

/**
 * Version of the TileForge resolution adapter itself. 2: the emitted river
 * layer carries the full two-tier network so fords sit on rendered runs.
 * 3: street-level ford decals wherever a stream crosses a corridor material,
 * so the §3 walkability ladder never severs a street.
 */
export const TILEFORGE_ADAPTER_VERSION = 3;
