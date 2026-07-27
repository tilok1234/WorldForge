# WorldForge — session handoff (2026-07-27, account switch #4)

For a fresh AI session with no prior context. Read `AGENTS.md` and the
`README.md` reading list first; this file carries session state the docs
don't. File-based assistant memory at
`~/.claude/projects/C--Users-headc-Documents-WorldForge/memory/` is
machine-local and survives account switches; it cross-validates this
file. HANDOFF.md is the tiebreaker.

## Where the project stands

W0–W9 complete. ALIVE-WORLDS ARC complete (behaviors 15–30). VARIETY
ARC COMPLETE AND VERDICT-CLOSED (behaviors 31–35). GAME INTEGRATION
PLAN merged to main (ratified; export-game-pack Phase 2 + authored
placement behavior 36) and extended by SETTLEMENT PINS (behavior 37,
2026-07-27 mobile session, rank design designer-ratified: pin order =
rank, first pin is the capital) + EXPLICIT RANKS (behavior 38, same
session, user-picked next: optional rank field, pin a village while
the capital stays free). TERRAIN TEXTURE ARC OPEN (behavior 39,
terrain.texture 1, user-picked direction "terrain texture"): interior
mottling (mud→grass tussocks, grass→parched patches, dry_grass→
gravel hardpan, snow→gravel scree; organic 1-5 cell patches) + edge
dithering between ground materials; after all structural passes,
before decoration; walkability-neutral swaps only (swamp widening
EXCLUDED v1 — swamp BLOCKS movement per loader contract); confetti
sweep enforces no one-cell regions. FIRST layer-visible change since
the variety arc: canonical flood 33890→34058 (prop rerolls, both
consumers equal, Godot 0 errors). **VERDICT OPEN: before/after
overviews of drowned-fen + white-waste sent 2026-07-27; visual
baseline re-record BLOCKED on that verdict.** Texture geography
verdict: "geography seems good... a little empty" → richened fen/waste
recipes (9/8 settlements, 6 landmarks, dense) — STILL "a little
empty" at 256² → user pivot: "start making the smaller maps first" →
THREE TINY CLIMATE HOLLOWS committed (fen-hollow 20033, frost-hollow
20113, dust-hollow 20093; hearth-hollow template, city+town gap ≥53,
both landmarks placed, dense tier; floods 3001/2818/3312, 0 errors;
overviews sent, VERDICT OPEN). Standing approach if ratified:
nail feel at 64² first, scale up via the structural axis. Richened
fen/waste recipes committed too but their 256² verdict is NOT
approved — revert or iterate on user word. Versions: behavior 39,
recipe compiler 23, artifact format 8, resolved-config 17,
terrain.texture 1. 191 tests, all green. Standing commit+push
authorization held this whole arc — re-confirm with the user per
policy.

**VARIETY ARC CLOSED 2026-07-27 (mobile session): all three climate
worlds approved** — dust-sea and white-waste liked outright,
drowned-fen "cool for now" (kept as-is; a moisture-bias exploration at
−80/−120 was shown and declined — recipe untouched). Parked idea, NOT
on the plan: fine-grained fen variety (mud mottling / wider swamp
margins) would need engine vocabulary; user deferred. FORMAL BASELINE
RECORDED 2026-07-27 ("run it"): approval file committed, flood-33890
canonical locked. Remaining user-gated items: windowed Godot
playthrough, taste-polish round (parked since the start).

### The canonical world (fixtures/recipes/small-cold-coastal.json, seed 103991)

Two cities (capital 240,125 + second city 94,128 via the remote-quarter
reservation) + 3 towns + 5 villages; EIGHT trail-served landmarks
(fortress, ruined city w/ keep + dungeon/temple/portal/crypt delves,
world tree, crystal spire, lighthouse, Winterlodge, two mountain
hamlets); ~103 story POIs / 24 kinds; roads + shortcut trails + graded
mountain trails + POI spurs; mountain relief (adapter-side elev inside
rock only, walkable cells stay level 0) with two-tile waterfall
cascades + rapids; character zones; thicket ambience. Verify chain last
green: Godot 0 errors, both consumers flood **33,890** (was 33,887
before the behavior-34 ford guard — 3 props that stood in crossings are
no longer placed; flagged and accepted; FORMAL BASELINE APPROVED
2026-07-27 — fixtures/recipes/small-cold-coastal.json.approval.json,
re-recorded per behavior version bump (37 then 38); layers
byte-identical each time, floods the invariant). Godot verifies for
behaviors 36–38 all ran green in this container (Godot 4.6.2
downloaded to ~/bin/godot; flood parity 33890/33890 every time).

### The recipe library (fixtures/recipes/, galleries in outputs/gallery/<name>/)

Fifteen worlds; viewer dropdown lists them all. Approval status:

APPROVED (small archetypes, 2026-07-27): frontier-sparse, warm-vale,
highland-fastness, sunburnt-reach (77% steppe via biases),
weeping-marsh, drowned-shore, the-old-war, the-long-winter (74.5% snow,
seed 87514), hearth-hollow (tiny 64², seed 1286006, dense, city+town).

APPROVED (medium 512², "lets do next"): warm-vale-medium (balanced, 15
settlements), the-old-war-medium (dense, 16), frontier-sparse-medium
(sparse, 11). APPROVED (large 1024², "ye seems cool"): warm-vale-large
(balanced, 24 settlements, flood 646918), the-old-war-large (dense, 28
settlements, 10 landmarks, flood 650230).

APPROVED (climate worlds, behavior 35, 2026-07-27 mobile): dust-sea
(arid_steppe, seed 15551, 76.8% dry steppe), drowned-fen (wet_lowland,
seed 24680, 74.9% wet — "cool for now", liked less than the other two),
white-waste (frozen_north, seed 12007, 77.6% snow). Floods 55404 /
48858 / 53656, all 0 errors.

### Recipe vocabulary after the arc

- sizePreset: tiny 64² | small 256² | medium 512² | large 1024² (chunk
  32 except tiny 16). Budget caps: settlements 32, routes 12,
  landmarks 12 (validate.ts follows BUDGET_RANGES — no stale literals).
- climatePreset: temperate | cold_coastal | arid_steppe (+220/−200, sea
  280, wetland 640) | wet_lowland (+70/+260, 350, 480) | frozen_north
  (−380/+60, 370, 560). Biases stay additive on top.
- densityPreset: sparse | balanced | dense (scales POIs, ambient,
  shortcut trails ONLY — settlements/landmarks are recipe budgets).

## Density doctrine (IMPORTANT — standing user verdicts)

"We shouldn't overdo it" + "not all maps should be this populated" →
NEVER raise the dense-tier ambient/POI numbers without a fresh verdict.
BUT: the medium verdict ("very empty... more settlements and roads
connecting the whole map") established that STRUCTURAL density on big
maps is a separate axis — settlement counts, road webs, and sector
floors grow with map size; props/POIs per cell FALL as maps grow.

## Working agreements

- Loop: implement → `npm test` + `node dist/tools/update-golden.js` →
  verify chain → overviews/crops → SendUserFile → user refreshes viewer
  → verdict → iterate.
- Viewer: `http://127.0.0.1:8787` (launch.json "viewer"; server may
  belong to another session — do NOT restart; regenerate into the same
  dir and refresh). Header world picker: serve-viewer's read-only
  `/api/worlds` lists outputs/ dirs; old-format relics (demo-a/b,
  w4-demo) auto-hidden; native check accepts resolved-render.png OR
  resolved-preview.png.
- Renders: ≤8192px worlds get the full render; >8192px also get a
  box-averaged resolved-preview.png (browser decode cap); >16384px
  (large) SKIP the full render entirely — a 32768px rgba buffer is
  exactly 2^32 bytes — and band-compose the preview (one-cell band
  margin absorbs the sand 16px offset). Native-scale crops for large
  come from re-rendering a slice, not the full PNG.
- Overviews for verdicts: scratchpad downscale-png.mjs pattern (box
  average, factor to ~1024px), Read to eyeball, then SendUserFile.
- Verify chain on EVERY generation change, canonical + touched worlds:
  `node dist/tools/godot-consumer.js --world <dir>` (0 errors) +
  `node consumers/typescript/traverse.mjs <dir>/world.json` — floods
  must be EQUAL between consumers.
- Versioning: behavior bump + touched rule packs (bump SEQUENTIALLY and
  check the changelog comment matches the table — this session
  mis-skipped twice); adapter-only → TILEFORGE_ADAPTER_VERSION +
  adapter.tileforge; RouteRules/SettlementRules/decoration SHAPE →
  resolvedConfigFormat + compiler + literal in tests/compile.test.ts
  (currently 13).
- APPEND-ONLY: WORLD_PALETTE, STRUCTURE_TYPES, DECOR_TYPES, DECAL_TYPES,
  POI_TYPES. Parity: decorate BLOCKING == loader BLOCKING_PROPS; loader
  STRUCTURE_PASS_CELLS mirrors package manifest pass arrays; package
  walkable flags are truth. Decals never on rock/swamp EXCEPT
  decal.steam_vent (spec substrate).
- Seed-hunt method (proven repeatedly): loop candidate seeds →
  compose (import dist modules from a scratchpad .mjs via file:// URLs)
  → count target material %, pick winner. ~1.5s per small world; the
  climate hunt scored 16 seeds × 3 climates in ~90s.
- TileForge upstream (`C:\Users\headc\Documents\Semantic tile generator
  design`) is read-only; guard denylist in gitignored worldforge.local.json.

## Gotchas earned across the arcs (do not relearn)

- Landmark stamps carry ONLY walls/materials/road-marks; multi-cell
  furniture (keep, delves, tree, spire...) goes through the POI pass as
  poi.city_ruin records (cityStamp helper in pois.ts) — adapter/loader
  consume POI structure records. Landmark rects are "districts" in
  validateArtifact (poi structures may sit inside).
- Landmark trails are built by ROUTES before stamps; entrance validation
  runs BEFORE the POI pass → gate cells must be corridor at landmark
  time (placeLandmarks paints pathLayer through the gateway).
- Roads soft-avoid future landmark stamp footprints (dijkstra avoid set,
  +600 cost) — without it a road crosses the site and the stamp honestly
  refuses (warm-vale exposed it).
- §2.7 sand margin: TWO cells off ALL FOUR edges (highland-fastness
  exposed the far-edge + 1-cell cases; emitTmj throws on violation).
- Ford rule bridges runs of ≤2 stream cells; the loader DUPLICATES the
  rule (zero-imports contract) — change both or parity fails.
- BLOCKING PROPS never on ford/crossing cells (behavior 34,
  decoration.props 9): composeWorld's streetFordCells is the single
  source of truth, passed into decorateWorld; rowboat/buoy direct
  writes have their own guard. The first 1024 map caught this — a
  scattered tree severed a street at a ford. Refusing a placement does
  NOT relocate it (per-cell rolls), so fixes like this shift approved
  worlds by single cells — measure and flag, never assume identical.
- Settlement selection phases (routes.graph v11): capital → remote
  quarter (crowns second city) → SECTOR FLOORS (sectorGrid×sectorGrid,
  each ≥ sectorMin; 1×1/0 disables on tiny+small, 2×2×2 medium, 4×4×1
  large) → open competition. Score competition alone clusters into
  bands — frontier-sparse-medium's west half had ZERO settlements
  before floors. Sectors fill in reading order; medium's 2×2 grid is
  byte-identical to the old quadrant floors (regen floods matched).
- POI budget = budget + cityCount (landmark furniture exempt); far-reach
  quota 30%; rare kinds need their own channel lane or variant windows —
  the general stream starves latecomers.
- elev derivation lives in the ADAPTER (rock quartiles capped by
  distance-from-open-land, relaxed to ≤1 steps; artifact untouched).
  Waterfalls = lip + plunge cells where a stream drops a level.
- Settlement structures must not stamp on pathLayer (trails are
  corridors) — footprintFits checks it.
- gradeRockCell: trail cells over rock become gravel; LONE interruptions
  adopt a walkable neighbor material (one-cell-region confetti guard).
- Lone-cobble cleanup must treat street-ford neighbors as corridor
  continuation or it deletes ford landings (parity mismatch).
- TINY FUSION: with THREE settlements on 64x64 the outpost always fuses
  the band. CITY+TOWN ALONE SEPARATE FINE on ~40% of seeds (measured
  16/37 with gap up to 24) — hunt seeds on gap, don't cap at 1.
- verify_world.gd walkability ladder: rungs apply only to cell types
  the world CONTAINS (wall-less worlds exist — hearth-hollow); absent
  types print a named skip instead of failing.
- warm-vale-medium's "coastal" lighthouse sits on a lake shore (seed
  424242 has no sea) — accepted fallback, on record.
- Chrome refuses giant image decodes and its decode service can wedge
  after repeated ~GB attempts — a browser restart clears it; the
  preview system exists so this never matters in normal use.

## User-gated, still open

- Windowed Godot playthrough: `godot --path consumers/godot`.
- End-of-plan taste-polish round.
- Phase 4 of docs/GAME_INTEGRATION_PLAN.md (game-repo importer addon):
  post-Gate-1, needs the user to separately scope the game repo.

## Commands

```
npm test                          # build + 155 tests (~3s)
node dist/tools/update-golden.js
node dist/src/cli.js resolve-tileforge fixtures/recipes/<name>.json --out outputs/gallery/<name>
node --max-old-space-size=8192 dist/src/cli.js resolve-tileforge fixtures/recipes/<large>.json --out outputs/gallery/<large>
node dist/tools/godot-consumer.js --world outputs/w7-slice
node consumers/typescript/traverse.mjs outputs/<dir>/world.json
node dist/tools/serve-viewer.js   # viewer :8787 (if not already up)
godot --path consumers/godot
```
