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
 * 34: the large size preset (recipe.presets 5, macro.fields 6,
 *     macro.biomes 7, hydrology.water 4, routes.graph 11,
 *     settlements.plans 10, decoration.pois 12) — world.sizePreset gains
 *     large: 1024x1024 in 32x32 chunks, third city, seven towns, POI base
 *     300, budget caps raised (settlements 32, routes 12, landmarks 12).
 *     Sector floors generalize the v10 quadrants (RouteRules.sectorGrid +
 *     sectorMin replace quadrantMin; resolved-config format 13): large
 *     keeps a settlement in every 256-cell sector of a 4x4 grid; medium's
 *     2x2 grid of 2 is byte-identical to the quadrant floors it replaces.
 *     Renders past the browser-size cap band-compose straight into the
 *     preview (a 32768px full render would break Node's buffer limits).
 *     Also decoration.props 9: blocking props keep off street-ford and
 *     crossing cells (the §3 ladder walks fords; the first 1024 map
 *     rolled a tree onto one and severed a street — smaller worlds had
 *     never hit the odds). Approved worlds shift by single cells, not
 *     looks: the canonical world drops 3 of 12460 props (they stood in
 *     crossings) and gains 3 walkable cells (flood 33887 -> 33890).
 * 35: the climate library (recipe.presets 6, hydrology.water 5) —
 *     world.climatePreset gains arid_steppe, wet_lowland, frozen_north:
 *     the palettes the variety arc proved through raw biases become
 *     vocabulary (sunburnt-reach, weeping-marsh, the-long-winter lineage).
 *     Sea level and the wetland gate carry each climate's water character;
 *     author biases stay additive on top.
 * 36: authored placement (routes.graph 12, landmarks.stamps 6,
 *     authoring.overrides 1; docs/GAME_INTEGRATION_PLAN.md §4, ratified) —
 *     the handcrafted-rule contract becomes recipe vocabulary: landmark
 *     entries gain `at` (exact pinned anchor; fails with a named error,
 *     never silently relocates) and `near` (cell + radius constrained
 *     search), mutually exclusive with relation; pinned slots select
 *     before free competition so nothing steals an authored site;
 *     `authoredStamps` declares one-off per-recipe stampFormat-1 stamps
 *     (types "recipe.<name>", validated by the fixture parser);
 *     `cellOverrides` applies sparse designer spot decisions (material /
 *     clearProp / clearDecal) after every procedural pass and before
 *     validation — water materials refused (hydrology owns water),
 *     warn-only soft cap 64. Recipes without the new fields generate
 *     identical layers (identities shift with the version bumps; floods
 *     are the invariant).
 * 37: settlement pins (routes.graph 13; the deferred half of plan §4.1,
 *     rank interaction designer-ratified 2026-07-27) — recipes gain a
 *     rank-ordered `settlements` array of at/near constraints: entry
 *     order IS rank order, so the first entry authors the capital, the
 *     second the second city, and so on down the tier ladder. Pins
 *     select before every competitive phase; later phases treat them as
 *     real (remote quarter measures from a pinned capital and stands
 *     down when rank 1 is pinned; sector floors count pins toward their
 *     sector). An unsettleable or crowded pin is a named generation
 *     error, never a relocation. Recipes without the field generate
 *     identical layers (identities shift with the version bumps; floods
 *     are the invariant).
 * 38: explicit settlement ranks (routes.graph 14; the append flagged at
 *     behavior 37) — settlement entries gain an optional `rank` claiming
 *     a specific budget slot, so a village can be pinned while the
 *     capital stays free-competed. Effective rank = rank ?? entry index;
 *     ranks are unique and inside the budget (validation). The solver
 *     resolves pins in ascending rank order, competitive phases top up
 *     around the claims (the capital phase fills rank 0 when unclaimed,
 *     the remote quarter fills rank 1 when unclaimed, measuring from the
 *     rank-0 settlement), and a final permutation seats every pick at
 *     its rank — the identity permutation for contiguous-prefix pins, so
 *     behavior-37 recipes and pin-free recipes generate identical
 *     layers (identities shift with the version bumps; floods are the
 *     invariant).
 * 39: terrain texture (terrain.texture 1) — large single-material ground
 *     regions gain fine-grained variety: seeded interior mottling (mud
 *     grows grass tussocks, grass parched patches, dry grass sandy
 *     scours, snow windswept scree — organic 1-5 cell patches) and edge
 *     dithering where two ground materials meet. Runs after every
 *     structural pass and before decoration, so settlements, roads, and
 *     landmarks never move while props and POIs follow the textured
 *     ground. Walkability-neutral by construction (swaps stay inside
 *     the walkable ground set; corridors, structures, crops, fences,
 *     piers, fords, river cells, and the §2.7 sand margin are guarded).
 *     First LAYER-visible behavior change since the variety arc:
 *     approved worlds re-textured, verdict round required; ambient
 *     decoration re-rolls where materials changed, so floods shift
 *     slightly (consumer flood EQUALITY remains the invariant).
 * 40: organic small maps, step 1 (decoration.pois 13; user verdict "it
 *     feels like 4 spots on map") — POI spacing scales with the world:
 *     the flat 14-cell minimum mathematically starved tiny 64² maps to
 *     ~6 placed POIs of an 18-POI budget. Tiny now spaces at 7; every
 *     other size keeps 14, so small+ worlds generate identical layers
 *     (identities shift with the version bumps).
 * 41: wilderness variety (decoration.props 10, decoration.pois 14; user
 *     verdict "more variations of props and structures in the woods,
 *     some buildings here and there") — every ambient species table
 *     gains rare accents (beehives and giant shrooms under grass
 *     canopy, cactus and bleached bones in the steppe, scree and logs
 *     in the snow, fungus in the fen), and two lone-building POI kinds
 *     join append-only: poi.abandoned_homestead (house_abandoned +
 *     failed-farm dressing; grass/dry) and poi.lone_cottage (cottage +
 *     lived-in dressing; grass), cap 2 each, away from settlements.
 *     LAYER-VISIBLE on every world (ambient rerolls + new POIs).
 * 42: snowed-in homesteads (decoration.pois 15; frost-hollow organic
 *     pass) — poi.abandoned_homestead accepts snow ground: the frozen
 *     north's version of the failed farm. Snow worlds gain the kind;
 *     other worlds' layers change only through the version-bump reroll.
 * 43: zone composition, step 1 (macro.fields 7; assessment ratified
 *     2026-07-27, approach C) — recipes gain a `zones` grid: per-zone
 *     climate character as ADDITIVE temperature/moisture offsets in
 *     reading order, seam mode "blended" (separable seamBand box blur
 *     over the offset map -> climate gradient) or "hard" (step at the
 *     border), both shipped for the designer A/B. Elevation and sea
 *     level stay world-global — one landmass, one ocean — which is
 *     what keeps the composed world seamless. Zone-free recipes
 *     generate identical layers (identities shift with the bumps).
 * 44: wandering hard seams (macro.fields 8; verdict "those are way too
 *     hard seams") — hard mode keeps its sharp transition but the
 *     border line itself meanders: the zone lookup is warped by smooth
 *     two-octave fbm up to seamJitterCells (10), then a 2-cell settle
 *     blur de-aliases the frontier. Blended mode unchanged. Zone-free
 *     recipes generate identical layers.
 * 45: anchor-shaped zones (macro.fields 9; user direction "make shapes
 *     that make sense for the zones instead of filling a square") —
 *     zones gain layout "anchors": each entry carries an anchor cell
 *     and a territory weight, and cells belong to the weighted nearest
 *     anchor (integer d²w'² comparison, first-entry tiebreak), so zone
 *     shapes follow authored geography. Grid layout stays the default;
 *     seam modes apply unchanged on top. Zone-free and grid recipes
 *     generate identical layers.
 * 46: zone elevation (macro.fields 10; user direction "one with islands
 *     and semi islands") — zone entries gain elevationPermille:
 *     strongly negative drowns a zone into sea (islands, channels,
 *     bays), positive raises highland. Sea level stays world-global;
 *     elevation offsets ALWAYS blend at the border whatever the seam
 *     mode (coasts shelve, no cliff lines), and the frontier wander
 *     applies first so coastlines meander. CAUTION on record: routes
 *     and reachability validators assume one connected landmass —
 *     inhabited zones must stay land-connected (peninsulas, isthmuses);
 *     true detached islands are safe only while uninhabited.
 *     Multi-component routing is an OPEN DECISION for a later behavior.
 * 47: trails stay open (settlements.plans 11, landmarks.stamps 7,
 *     decoration.pois 16) — three sever mechanics exposed by
 *     the-eight-lands' mountain-notch spurs, all invisible to the
 *     compose-time gate (it walks corridors without structure
 *     knowledge): plaza furniture (fountain, well) never sits on
 *     pathLayer; a ruined city's wall BREACHES where an old trail
 *     passes (stamps also honestly interrupt covered trails — pathLayer
 *     clears under stamped structure cells); and POI-pass furniture may
 *     cover a trail END but never a THROUGH-trail (>= 2 boundary
 *     crossings refuse the spot; gates exempt — their pass cells keep
 *     the trail open; the lodge gains alternate spots). The approach
 *     carver only joins trail segments that provably reach a corridor
 *     (hopping ford-width stream gaps — wet worlds' trails continue
 *     across fords) and falls back to any trail rather than stranding a
 *     gate. The CLI gates resolve and export on destination reachability
 *     through the PUBLIC loader (the consumers' own nudge+flood rule),
 *     so a severed world can never ship silently again. Canonical
 *     shifted +48 walkable cells (33845 -> 33893), consumers equal.
 */
export const GENERATOR_BEHAVIOR_VERSION = 47;

/** Behavior version of the WorldRecipe -> ResolvedWorldConfig compiler. */
export const RECIPE_COMPILER_VERSION = 28;

/** Versions of the named rule packs consumed by the recipe compiler. */
export const RULE_PACK_VERSIONS: { readonly [name: string]: number } = {
  "recipe.presets": 6,
  "macro.fields": 10,
  "macro.biomes": 7,
  "hydrology.water": 5,
  "routes.graph": 14,
  "settlements.plans": 11,
  "landmarks.stamps": 7,
  "terrain.texture": 1,
  "decoration.props": 10,
  "decoration.pois": 16,
  "density.presets": 1,
  "authoring.overrides": 1,
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
