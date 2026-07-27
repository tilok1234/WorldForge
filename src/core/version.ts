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
 * 27: mountain hamlets — high-bowl villages (cottages, well, watchtower)
 *     placed as landmarks on the terraces with graded climbing trails
 *     (landmarks.stamps 5, decoration.pois 9); recipe vocabulary gains
 *     mountain_hamlet.
 * 28: the living mountains (decoration.pois 10) — hermit huts, beast
 *     dens, pass memorials beside the old trails, steam vents where the
 *     mountain breathes; steam vents are the one decal allowed on rock
 *     (spec substrate; hazard, never walk-granting).
 * 29: the thicket (decoration.props 8, macro.biomes 4) — rock gains its
 *     own scatter table (impassable, so blocking costs nothing), every
 *     biome dials up again, overlays widen, zones multiply, and rocky
 *     knolls rise 18 -> 30.
 * 30: density is an authoring choice (density.presets 1, recipe.presets
 *     3) — world.densityPreset sparse|balanced|dense scales the POI
 *     budget, ambient decoration, and shortcut trails; default balanced,
 *     the canonical world pins dense.
 * 31: generation variety hardening (routes.graph 8, macro.biomes 5) —
 *     roads soft-avoid future landmark stamp footprints (the warm-vale
 *     recipe exposed roads crossing sites picked before carving), and
 *     the §2.7 sand margin holds on all four world edges (the highland
 *     recipe pushed beaches to the far edge and the emitter threw).
 * 32: the medium size preset (recipe.presets 4, macro.fields 5,
 *     macro.biomes 6, hydrology.water 3, routes.graph 9,
 *     settlements.plans 8, decoration.pois 11) — world.sizePreset gains
 *     medium: 512x512 in 16x16 chunks, octaves shifted one level up so
 *     half the map is still one landform, sublinear scaling everywhere
 *     else (river thresholds, spacing, settlement geometry, POI base
 *     150) so bigger reads as roomier country, never denser cities.
 * 33: the connected medium (routes.graph 10, settlements.plans 9) — the
 *     first-medium verdict ("a lot more settlements and roads connecting
 *     the whole map"): medium towns 4 -> 5, shortcut trails 6 -> 10 with
 *     longer span, destination spacing 44 -> 40; NEW quadrant floors
 *     (RouteRules.quadrantMin, resolved-config format 12) guarantee every
 *     map quadrant a minimum settlement presence — score competition
 *     alone left whole 512-map quadrants empty. quadrantMin 0 on
 *     tiny/small keeps approved selections byte-identical. The three
 *     medium recipes push settlement/route/landmark budgets so the web
 *     spans the map. Prop/POI density doctrine untouched.
 */
export const GENERATOR_BEHAVIOR_VERSION = 33;

/** Behavior version of the WorldRecipe -> ResolvedWorldConfig compiler. */
export const RECIPE_COMPILER_VERSION = 17;

/** Versions of the named rule packs consumed by the recipe compiler. */
export const RULE_PACK_VERSIONS: { readonly [name: string]: number } = {
  "recipe.presets": 4,
  "macro.fields": 5,
  "macro.biomes": 6,
  "hydrology.water": 3,
  "routes.graph": 10,
  "settlements.plans": 9,
  "landmarks.stamps": 5,
  "decoration.props": 8,
  "decoration.pois": 11,
  "density.presets": 1,
  "adapter.tileforge": 6,
};

/**
 * Version of the TileForge resolution adapter itself. 2: the emitted river
 * layer carries the full two-tier network so fords sit on rendered runs.
 * 3: street-level ford decals wherever a stream crosses a corridor material,
 * so the §3 walkability ladder never severs a street.
 * 4: mountain relief — quantized elevation levels inside the rock mass
 * (walkable cells stay level 0), rendered by the §2.8 cliff pass.
 * 5: mountain water — waterfall decals on stream drop lips, sparse rapids
 * on terrace runs.
 * 6: two-tile cascades — the plunge cell below each lip falls too.
 */
export const TILEFORGE_ADAPTER_VERSION = 6;
