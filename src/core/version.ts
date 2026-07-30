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
 * 48: zone settlement floors (routes.graph 15, resolved-config 23) —
 *     zone entries gain optional settlementFloor (default 0): the zone's
 *     territory keeps at least that many settlements before open
 *     competition, using the PURE territory function (zoneOwnerAt; the
 *     seam wander stays climate display). Opt-in by design: every
 *     pre-48 zone recipe and deliberately wild zone (the broken-isles
 *     island) generates unchanged. The last ratified zone-arc engine
 *     item from docs/ZONE_COMPOSITION_ASSESSMENT.md.
 * 49: settlement organics + variety (settlements.plans 12, resolved-config
 *     24; eight-holds rework directive "larger in some cases, dense middle
 *     thinning to scattered edges, more building variety") — recipes gain
 *     opt-in `settlementStyle`: growthPermille rolls per-settlement size
 *     (squared roll so most stay modest, some grow near the cap; cities
 *     full, towns half, outposts never; lots and approach budgets scale
 *     with the grown area), scatterPermille turns the uniform ring fill
 *     into a dense core thinning linearly to a scattered rim — and
 *     EXTENDS the fabric footprint by the scatter fraction so the lot
 *     list redistributes outward instead of losing its tail (civic
 *     specials always place; acceptance is per-cell on the new
 *     settlements.scatter channel), and variety flavors the building mix
 *     by purpose from nine newly rostered package structures (windmill,
 *     watermill, sawmill, quarry, store, warehouse, guardhouse, fisherhut,
 *     tent — all fully blocking, so loader walkability parity is
 *     untouched; dock deferred: pass-cells + waterline placement).
 *     Style-free recipes generate byte-identical layers AND keep their
 *     recipeSha256 (the normalized key exists only when authored — the
 *     canonical baseline sidecar stays valid).
 * 50: lived-in streets (settlements.plans 13, resolved-config 25; verdict
 *     round 2 "you don't have to always use a solid road… some houses
 *     doesn't have to have a road… should be more organic") —
 *     settlementStyle gains organicStreets: civic specials keep solid
 *     cobble approaches while ordinary houses get worn packed-earth lane
 *     fragments (BFS still verifies the route; the settlements.wear
 *     channel paints ~450‰ of its cells, ~250‰ past depth 600, doorstep
 *     always marked), some fringe houses (depth > 450, ~half) paint no
 *     lane at all — every mode still BFS-verifies the route and rolls
 *     back on failure, and the verified route becomes a LANE PROMISE
 *     recorded in laneCells: later structures refuse to stamp on it,
 *     farms keep fences and crops off it, decoration keeps every prop
 *     off it. The W5 entrance check gains a second tier to match: solid
 *     entrances still must join the CORRIDOR network byte-for-byte,
 *     while worn/none entrances check against walkable GROUND (their
 *     lanes are deliberately gappy — a corridor-only flood reads them
 *     as islands; the first styled generation refused exactly three
 *     such doorsteps before the tier existed — no road never means no
 *     route), yard clearance varies 1-2 cells, street arms
 *     roll per-direction lengths (50-130%), and deep fill houses humble
 *     into cottages. Off (and for every style-free recipe) the fabric is
 *     byte-identical to behavior 49.
 * 51: narrow streets (settlements.plans 14, resolved-config 26; verdict
 *     round 3 "work on how we do roads inside cities and settlements —
 *     more 1 tile wide roads inside the city") — settlementStyle gains
 *     `narrowStreets`: street arms keep their two-cell boulevard width
 *     only through the civic core (the inner third of each arm's own
 *     rolled length, so behavior 50's asymmetric arms narrow at
 *     different points) and run one cell wide beyond it. The freed side
 *     cells return to the lot pool, densifying the fabric the arms
 *     thread through. The city ring road and the behavior-50 worn house
 *     lanes were already one cell wide; plazas stay areas; corridor
 *     connectivity, street fords, the entrance checks, and the pack
 *     stamp's street guard are all cell-based and width-agnostic. Off
 *     (and for every style-free recipe) the fabric is byte-identical to
 *     behavior 50.
 * 52: narrow streets, part 2 — through-roads neck down (settlements.plans
 *     15; round-4 verdict "you are using 3 tiles wide ones… it looks
 *     like a clutter of a solid road when you do them wide") — behavior
 *     51 narrowed the settlement's own arms but the ROUTE corridors
 *     (streets 2-wide, highways 3-wide) still crossed settlements at
 *     doctrine width. The route painter now records each corridor's
 *     centerline and what every flank cell covered (first paint wins;
 *     inert for style-free generation), and under narrowStreets the
 *     settlement pass restores those flank cells to their original
 *     ground within settlement bounds before anything places — the
 *     through-road runs on as a one-wide centerline lane, fords and
 *     bridges keep their full line (crossings are path cells, never
 *     flanks), and the freed ground rejoins the lot pool. Country
 *     corridors outside settlement bounds keep the 2-4-wide doctrine.
 *     Off (and for every style-free recipe) the fabric is
 *     byte-identical to behavior 51.
 * 53: unpaved yards (settlements.plans 16; round-5 verdict "i see no 1
 *     tile wide roads at all") — behaviors 51-52 narrowed every lane,
 *     but the cobble PAD stamped under each building tiled a dense core
 *     into one solid slab that swallowed them. Under narrowStreets,
 *     EVERY building keeps the ground it was built on (a capital seats
 *     dozens of civic lots — paved civic pads alone rebuilt the slab);
 *     the plaza stays the one paved area, so the only
 *     road material left is the lanes themselves: plaza, core arm
 *     stubs, one-wide arms and necked through-roads, solid civic
 *     approaches, and behavior 50's worn fragments. Approaches cannot
 *     tunnel the unpaved pads (the carve BFS excludes structure cells)
 *     and now terminate at real lanes instead of a neighbour's pad —
 *     deep scattered houses that cannot reach a lane in budget roll
 *     back, which reads as further organic thinning. Worn/none carves
 *     also verify GROUND truth now: an already-paved doorstep proves
 *     nothing (it may be an isolated route flank painted over a rock
 *     notch — isOpenLand never excluded rock, and pre-53 the pads
 *     simply paved over it; the first v53 eight-holds run sealed a
 *     cottage doorstep inside a mountain pocket exactly this way), so
 *     the BFS always runs for worn/none and ROCK is closed to its
 *     walk, mirroring the compose ground tier. Solid approaches keep
 *     the legacy paving contract byte-for-byte. Off (and for every
 *     style-free recipe) the fabric is byte-identical to behavior 52.
 * 54: trunk sharing (routes.graph 16, resolved-config 27) — the round-6
 *     close-up showed parallel ROUTE BRAIDS: several MST spokes to the
 *     same city dijkstra'd side-by-side lanes, every strand a protected
 *     centerline, so the necking correctly spared a three-wide braid.
 *     Under narrowStreets the solver discounts a step onto an
 *     already-stamped road cell by roadReusePermille (600 — grade
 *     included, the road already paid for it), so later spokes merge
 *     into earlier trunks and enter settlements as one shared lane.
 *     roadReusePermille 0 (every style-free recipe) is byte-identical
 *     pre-54 routing.
 * 55: the street web (settlements.plans 17; round-6 verdict "you still
 *     dont use 1 tile wide roads inside cities") — what reads as "roads
 *     inside the city" is a CONTINUOUS followable lane network, and
 *     rounds 4-6 never produced one: the civic spine was two wide and
 *     every ordinary house had only behavior-50 worn dot fragments,
 *     i.e. no visible road at all. Under narrowStreets: arms run ONE
 *     cell wide from the plaza edge out (the two-wide civic spine is
 *     gone), and every connected house carves a SOLID one-wide lane —
 *     approaches terminate at the nearest existing lane, so lanes chain
 *     into streets and streets into the plaza, a grown street tree.
 *     The round-2 organics survive at the fringe: deep houses still
 *     roll roadless (the "none" lane mode) and stand free on the
 *     grass; worn fragments remain the organicStreets look wherever
 *     narrowStreets is off. Style-free recipes byte-identical.
 * 56: line roads (settlements.plans 18, routes.graph 17; round-7
 *     verdict with screenshot: "1 tile wide means 1 tile wide. not 2
 *     and 3") — the miss was the RENDERER, not the width: cobble is an
 *     area MATERIAL, and a one-cell cobble lane blob-renders with rims
 *     and transition padding into two-three visual tiles, then fuses
 *     with its neighbours into patches. The one-tile road LOOK is the
 *     PATH BAND — the thin line art wilderness trails use, which the
 *     corridor doctrine explicitly kept alive for minor spurs. Under
 *     narrowStreets every in-settlement road now draws as the band
 *     over natural ground: arms, the city ring, every house lane
 *     (approaches write pathLayer and count band cells as network, so
 *     lanes still chain into a street tree), and the through-route
 *     inside settlement bounds (centerline ground restored from the
 *     new corridorCenterPrev record, band drawn on top — its
 *     wilderness continuation already renders as corridor per
 *     doctrine, which stays untouched outside bounds along with every
 *     style-free recipe, byte-identical). Only the plaza remains a
 *     paved cobble area. Band cells live in routesResult.pathLayer, so
 *     every existing trail protection applies natively: footprintFits
 *     refuses to stamp on them, decoration keeps blocking props off,
 *     the §3 ladder walks them, and the compose entrance check counts
 *     them as network.
 * 57: the city-lane band (settlements.plans 19, adapter.tileforge 7;
 *     round-8 verdict "ye these works better" on the weight three-way,
 *     designer add: band art gets improved in TileForge later — a
 *     plain re-pin when it ships) — the path layer gains value 2 for
 *     in-settlement lanes: the adapter renders 2 as the package's
 *     heavier "road" band (retired for country ROUTES by the corridor
 *     doctrine, now BLESSED for city lanes — a scoped exception like
 *     the ruined-road archaeology), while wilderness trails (1) keep
 *     dirtpath. Every path-layer reader is value-agnostic for
 *     protection and walkability (loader trailAt, compose network +
 *     spur goals, decoration/POI keep-offs, landmark carver, viewer);
 *     the road-band family is walkable:true in the pinned manifest, so
 *     the resolved §3 ladder and Godot agree by construction.
 *     Style-free recipes never write value 2 and stay byte-identical.
 * 58: urban blocks (settlements.plans 20, resolved-config 28, compiler
 *     34; round-9 verdict "it honestly looks more like suburbs then
 *     like cities") — detached houses at even spacing ARE a suburb.
 *     settlementStyle gains `urbanBlocks`: inside a CITY's core (depth
 *     <= 350 permille), placements pack with a ZERO clearance ring so
 *     buildings attach into terraced rows, and core cottages build as
 *     full houses — a dense center of big attached blocks thinning to
 *     the familiar detached outskirts. Towns and outposts keep their
 *     scale; behavior 50's varied yards stand outside the core. The
 *     lane promise and entrance checks hold (doorsteps carve before a
 *     neighbour can attach across them, and a placement that cannot
 *     reach a lane rolls back as always). Style-free recipes and
 *     urbanBlocks-free styles stay byte-identical.
 * 59: city quarters (settlements.plans 21, decoration.props 11;
 *     round-10 clarification "theres just a ton of houses packed
 *     tightly together and doesnt look like an actual city with
 *     different open spots and markets and churches and graveyards") —
 *     urbanBlocks REPURPOSED one round after it shipped: the behavior-58
 *     attached rows are reverted (packing was never the wish; places
 *     were), and the flag now reserves QUARTERS that break the house
 *     fabric: a market square with a stall row and central well, a
 *     church close seating the chapel over a gravestone yard (the
 *     sequence's own chapel stands down), and grassy greens with a
 *     birch and flower beds. Cities seat market+church+two greens,
 *     towns market+church, outposts none; sites ring-scan
 *     deterministically, keep off streets, lanes, water, and each
 *     other, drop when no ground fits, join laneSet as stamp keep-outs
 *     (houses, fences, and crops stay out), and exclude ambient
 *     scatter — their dressing is deliberate. Style-free recipes and
 *     urbanBlocks-free styles stay byte-identical.
 * 60: harbor docks (settlements.plans 22; the behavior-49 deferral,
 *     un-deferred by the designer's "docs at the water") — the package
 *     dock (3x2, pass cells [0,1,3,4,5]: a walkable deck, only the
 *     top-right post blocks) joins the roster. Under variety, harbor
 *     settlements seat docks on the waterline: deck row over the
 *     shallows, shore row on land, doorstep carving a solid lane like
 *     any civic piece (double budget, rolls back and scans on when a
 *     site cannot connect). Cities seat two, towns and outposts one.
 *     The pack stamp exempts the deck like a gate (a designed walkway;
 *     sealing it would strand the waterline), so game porosity audits
 *     gain deck cells on harbor worlds. Variety-free recipes stay
 *     byte-identical.
 * 61: lived-in dressing (decoration.props 12; batch 1 of the pack
 *     assessment — the unused content was the settlement-life layer).
 *     Nine furniture species roster in (lamp, barrels, bench,
 *     noticeboard, table_chairs, anvil, workbench, laundry_line,
 *     baskets; all block, mirroring the package). Working yards:
 *     smithies seat anvil/workbench/tool_rack/firewood and taverns
 *     seat tables/barrels/lamp/laundry_line on free perimeter cells,
 *     walked clockwise from past the entrance so doorways stay clear.
 *     Market quarters gain a noticeboard, bench, and baskets on their
 *     frame corners. City-lane bands (pathLayer CITY_LANE only — never
 *     wilderness trails) seat spaced street lamps, cities 10 / towns 4
 *     / outposts none. All offsets deterministic off already-rolled
 *     geometry; no new channels. Every world with a smithy, tavern, or
 *     styled city redresses (flagged flood shifts expected; canonical
 *     re-measured).
 * 62: city walls (settlements.plans 23, compiler 35, resolved-config 29;
 *     opt-in settlementStyle.cityWalls) — cities raise a stone wall
 *     circuit at the built core's extent: fortress_wall cells on the
 *     chebyshev ring (the adapter's wall network renders them), broken
 *     at water and rivers (the waterfront stays open), never stamping
 *     over structures or props it cannot clear. Where streets cross the
 *     line, north/south walls seat a CITY GATE (new structure.city_gate,
 *     the package's pristine 3x2 gatehouse, arch pass cells [1,4]) and
 *     east/west walls leave clean two-wide openings (no vertical gate
 *     art in the package). Every lane, trail, and road crossing opens —
 *     the behavior-47 no-sever laws outrank the wall. Towns and outposts
 *     never wall; flag off = byte-identical.
 * 63: harbor row (decoration.props 13, settlements.plans 24; batch 3 of
 *     the pack assessment) — the b60 boathouses get their working
 *     waterfront: a fishingboat moored on open water against the deck
 *     row (first free water cell, north then flanks), a bollard pair on
 *     the shore cells flanking the boathouse, and crates + fishnets on
 *     the shore row via the b61 perimeter ring walk (water cells fail
 *     the guard, so pieces land on the land side; lanes and entrance
 *     halos stay clear as ever). Both new props block, mirroring the
 *     package. City harbors upgrade their straight pier to the stone
 *     JETTY family (PIER_TYPES appends pier.jetty; towns and outposts
 *     keep wood) — same walkable network, art-only. Dock dressing is
 *     default-on wherever a dock stands (b61 doctrine: completing an
 *     existing building); style-free worlds have no docks, so their
 *     only possible shift is a city-harbor jetty.
 * 64: chicken run + vineyard (settlements.plans 25, decoration.props 14;
 *     batch 4 of the pack assessment — the farm-extension pair). Every
 *     farming settlement raises ONE chicken run beside its farmstead: a
 *     3x2 yard ringed in pen fence with a single gate facing the farm,
 *     the new prop.coop (blocks) in the corner farthest from the gate
 *     and a trough inside by it; strict 5x4 fit, first ring spot wins,
 *     cramped farms simply go without. Vineyards: crop.grapes joins the
 *     plot roll ONLY where the world's temperature offset (climate base
 *     + author bias) reaches +40 (warm-vale country) — a grape plot
 *     rings itself in the plain fence.wood family instead of pen
 *     fencing. Cold and neutral worlds keep the pre-64 pool size, so
 *     their rolls are byte-identical; warm worlds re-roll plot crops
 *     (art-only). Worlds without farming settlements are untouched.
 * 65: manor gardens (settlements.plans 26, decoration.props 15; batch 5
 *     of the pack assessment) — city garden greens (urbanBlocks
 *     quarters) wall themselves in the clipped fence.hedge family and
 *     dress FORMAL: topiary on the four inside corners, a sundial at
 *     the center, flower beds on the mid insides of roomy squares (the
 *     b59 birch-and-beds look retires). Streets, lanes, and standing
 *     occupancy break the hedge ring exactly as they break the city
 *     wall — behavior-47 no-sever laws outrank it. A green nothing
 *     crosses carves a mid-side gate toward open ground and planter
 *     urns flank it inside (farms records the gate; decoration seats
 *     the urns). All three new props block, mirroring the package.
 *     Style-free and quarter-free worlds are byte-identical.
 * 66: gate guard posts (batch 6 of the pack assessment — completing the
 *     b62 gatehouse, b61 doctrine: default-on where a city gate stands).
 *     Each placed gatehouse seats a garrison trio at fixed deterministic
 *     spots: a brazier pair just inside the walls flanking the
 *     through-street (the dusk lit-entrance payoff at the city door),
 *     ONE banner on the approach side greeting arrivals (west tower
 *     first, east as fallback), and an archery target in the tower nook
 *     against the inner wall (the guards' drill corner). Every seat is
 *     pathLayer-checked and yard-guarded — nothing ever stands on a
 *     street, lane, or trail (behavior 47 outranks) and occupied spots
 *     are skipped, never hunted. No new props, channels, or config keys:
 *     the dressing rides structure.city_gate existence, so only
 *     settlementStyle.cityWalls cities shift and style-free worlds stay
 *     byte-identical. Bridge-end posts and a seated guardhouse remain
 *     recorded catalog levers (wilderness ambient density wants its own
 *     verdict).
 * 67: orchards (settlements.plans 27; batch 7 of the pack assessment —
 *     the farm-extension lane again). Every farming settlement plants
 *     ONE orchard beside its farmstead: six fruit trees in spaced rows
 *     inside a 7x5 clearing, ringed in the plain fence.wood family with
 *     a two-cell gate facing the farm; a beehive works the far corner
 *     and the pickers' baskets wait inside the gate (farms plans the
 *     stand, decoration seats the props — the pen pattern). Strict 9x7
 *     fit scanned outward AFTER the chicken run, first spot wins — PLUS
 *     the ACCESS GUARANTEE: the three-cell apron outside the gate must
 *     touch the settlement's lane/path network (the first cut seated a
 *     stand in a woods hole that ambient forest sealed shut — no road
 *     never means no route). The envelope + apron are PROTECTED ground
 *     like a quarter: ambient scatter, character zones (one chewed four
 *     planted trees on the first cut — zones override ambient outright),
 *     and roadside markers all skip them. Cramped or laneless farms go
 *     without. Roll-free by design: fixed shape, no channel draws —
 *     every pre-67 roll is byte-identical and worlds without farming
 *     settlements are untouched entirely.
 * 68: entrances follow the road (settlements.plans 28, decoration.pois
 *     17; round-19 ruling: "that thing needs a entrance where the road
 *     goes into it"). TWO fences learn it. ORCHARD: any of the four
 *     ring sides may carry the two-cell gate — each side scores its
 *     three-cell apron by lane contact (chebyshev <= 1 per apron cell)
 *     and the strongest contact wins, ties preferring the side that
 *     faces the farm, then the fixed N/S/W/E order; baskets ride
 *     inside whichever gate opens, the beehive keeps the far corner,
 *     and east/west roads can now host stands (the b67 lever), so farm
 *     coverage rises. GRAVEYARD (the enclosure the ruling actually
 *     pointed at): TWO defects met — the iron ring stamped with no
 *     path check, and the b21 spur carver was fence-blind, so a spur
 *     carved AFTER the fence ran straight through the ring while the
 *     carved gap sat on the far side. Now fence never stamps on a
 *     path cell (behavior 47 outranks; a pre-existing trail crossing
 *     IS the gate, b65 garden precedent) AND the spur BFS treats
 *     fence cells as blocked like everything else that blocks — a
 *     spur leaves a fenced yard through its designed gate, so the
 *     trail arrives AT the entrance. Worlds with trail-side
 *     graveyards re-route (flagged flood shifts); style-free
 *     identity untouched.
 */
export const GENERATOR_BEHAVIOR_VERSION = 68;

/** Behavior version of the WorldRecipe -> ResolvedWorldConfig compiler. */
// 33 belongs to behavior 54's roadReusePermille shape change (bumped late —
// exactly the sequential-bump slip the handoff warns about); 34 is behavior
// 58's urbanBlocks.
export const RECIPE_COMPILER_VERSION = 35;

/** Versions of the named rule packs consumed by the recipe compiler. */
export const RULE_PACK_VERSIONS: { readonly [name: string]: number } = {
  "recipe.presets": 6,
  "macro.fields": 10,
  "macro.biomes": 7,
  "hydrology.water": 5,
  "routes.graph": 17,
  "settlements.plans": 28,
  "landmarks.stamps": 7,
  "terrain.texture": 1,
  "decoration.props": 15,
  "decoration.pois": 17,
  "density.presets": 1,
  "authoring.overrides": 1,
  "adapter.tileforge": 7,
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
 * 7: city-lane band mapping (behavior 57) — path-layer value 2 renders as
 * the package's heavier "road" band; wilderness trails (1) keep dirtpath.
 */
export const TILEFORGE_ADAPTER_VERSION = 7;
