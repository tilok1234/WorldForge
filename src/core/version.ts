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
 * 18: settlements.plans v5 — the settlement hierarchy: rank 0 becomes the
 *     capital city (ring road, longer arms, 64-lot civic core), ranks
 *     1..townCount towns, and outposts grow into nine-lot villages.
 * 19: the far reaches (decoration.pois 4, decoration.props 4) — the
 *     mountains and deep snow get deliberate content: prospector camps,
 *     crystal outcrops, ruined watches, trapper camps, forgotten
 *     battlefields; poi budget 48/14; nine new prop species.
 * 20: every discoverable tells a story (decoration.pois 5, decoration.props
 *     5) — existing POIs grow into composed vignettes (story decals: bones,
 *     scorch, cracks, webs, rune circles); new kinds: abandoned caravan,
 *     witch circle, frozen wreck, mountain shrine; poi budget 64/16; ten
 *     more prop species.
 * 21: the old kingdom and the path network — ruined_city landmark stamp
 *     (walls, streets, keep, four delves: dungeon/temple/portal/crypt;
 *     landmarks.stamps 2), high_ground relation, shortcut trails between
 *     near settlements (routes.graph 4), wilderness spur paths to worked
 *     discoveries, mountain approaches graded to gravel; thirteen new
 *     structure types (decoration.pois 6, settlements.plans 6).
 * 22: three more great discoveries with roads — the World Tree (walk
 *     beneath the canopy), the Crystal Spire, the tended lighthouse
 *     (coastal relation; routes.graph 5, landmarks.stamps 3,
 *     decoration.pois 7); every landmark trail graded and reachable.
 * 23: the road into the back country — hunters_lodge landmark in the
 *     remote_corner (the quarter farthest from the capital; routes.graph
 *     6, landmarks.stamps 4, decoration.pois 8); trapper camps join the
 *     spur-path kinds.
 * 24: the second city — settlement selection reserves the capital-remote
 *     map quarter (routes.graph 7) and settlements.plans v7 crowns its
 *     best candidate the second city (cityCount), so the back country
 *     gets a main city, satellites, and real roads.
 * 25: character zones (decoration.props 6, the empty-spots verdict) —
 *     open stretches become distinct places: flower meadows, blighted
 *     groves, mushroom glens, burned woods, boulder fields, cactus
 *     flats; five new species (giant shroom, corrupted tree, beehive,
 *     cactus, flower bed).
 * 26: density dial (decoration.props 7) — ambient scatter roughly doubled
 *     per biome, sparser biomes' forest bases raised, tall-grass and moss
 *     patches widened, character zones more numerous and larger.
 */
export const GENERATOR_BEHAVIOR_VERSION = 26;

/** Behavior version of the WorldRecipe -> ResolvedWorldConfig compiler. */
export const RECIPE_COMPILER_VERSION = 13;

/** Versions of the named rule packs consumed by the recipe compiler. */
export const RULE_PACK_VERSIONS: { readonly [name: string]: number } = {
  "recipe.presets": 2,
  "macro.fields": 4,
  "macro.biomes": 3,
  "hydrology.water": 2,
  "routes.graph": 7,
  "settlements.plans": 7,
  "landmarks.stamps": 4,
  "decoration.props": 7,
  "decoration.pois": 8,
  "adapter.tileforge": 4,
};

/**
 * Version of the TileForge resolution adapter itself. 2: the emitted river
 * layer carries the full two-tier network so fords sit on rendered runs.
 * 3: street-level ford decals wherever a stream crosses a corridor material,
 * so the §3 walkability ladder never severs a street.
 * 4: mountain relief — quantized elevation levels inside the rock mass
 * (walkable cells stay level 0), rendered by the §2.8 cliff pass.
 */
export const TILEFORGE_ADAPTER_VERSION = 4;
