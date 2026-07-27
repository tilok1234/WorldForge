# WorldForge — session handoff (2026-07-27, account switch #3)

For a fresh AI session with no prior context. Read `AGENTS.md` and the
`README.md` reading list first; this file carries session state the docs
don't. File-based assistant memory at
`~/.claude/projects/C--Users-headc-Documents-WorldForge/memory/` is
machine-local and survives account switches; it cross-validates this
file. HANDOFF.md is the tiebreaker.

## Where the project stands

W0–W9 complete, ALIVE-WORLDS ARC complete (behaviors 15–30), VARIETY ARC
underway (behaviors 31–32). Versions: behavior 32, recipe compiler 16,
artifact format 8, resolved-config 11 (NOT bumped for behavior 32: the
medium preset added no fields, and the doctrine says format bumps track
shape changes — the earlier prediction of a bump was wrong), TileForge
adapter 6. 153 tests. Standing commit+push authorization held this whole
arc — re-confirm with the user per policy.

### The canonical world (fixtures/recipes/small-cold-coastal.json, seed 103991)

Two cities (capital 240,125 + second city 94,128 via the remote-quarter
reservation) + 3 towns + 5 villages; EIGHT trail-served landmarks
(fortress, ruined city w/ keep + dungeon/temple/portal/crypt delves,
world tree, crystal spire, lighthouse, Winterlodge, two mountain
hamlets); 103 story POIs / 24 kinds; roads + shortcut trails + graded
mountain trails + POI spurs; mountain relief (adapter-side elev inside
rock only, walkable cells stay level 0) with two-tile waterfall cascades
+ rapids; character zones; thicket ambience. Verify chain last green:
Godot 0 errors, both consumers flood 33,887.

### The recipe library (VARIETY ARC — user: "more archetypes i think")

All in fixtures/recipes/, all generate clean (0 route errors, 0
unreachable), galleries in outputs/gallery/<name>/. First seven visually
approved (user 2026-07-27: "they look great" on the final four); the two
warm-up worlds below them are PENDING verdicts:

- frontier-sparse — temperate sparse, 4 settlements, lodge in the corner.
- warm-vale — wet warm temperate balanced; world tree, lighthouse, ruined city.
- highland-fastness — northElevation 520 cold; fortress + 2 hamlets +
  spire on a massive north wall.
- sunburnt-reach — seed-hunted 77% dry steppe (moisture −240, temp
  +260); oasis lakes, ruined city, spire, lodge. GORGEOUS, distinct.
- weeping-marsh — 48% mud/swamp lowlands (moisture +300, northElev −120).
- drowned-shore — 39% water (northElev −150); twin lighthouses + lodge.
- the-old-war — dense war-north: TWO fortresses + ruined city + hamlet.
- the-long-winter — seed-hunted 74.5% snow (cold_coastal, temp −420,
  northElev +240): fully frozen (0% grass), dark lakes, mossy NE rock
  massif, fortress/spire/lighthouse/Winterlodge/hamlet. APPROVED
  2026-07-27 ("the winter world looks good").
- hearth-hollow — FIRST tiny (64x64) gallery world, ITERATED once per
  user ("more abandoned houses... and small settlement"): now seed
  1286006, densityPreset dense, settlementCount 2 (city + town, edge-gap
  14). Ruined farmstead + abandoned caravan + bandit camp + mine + 3
  trapper camps + 2 caves; world tree + Winterlodge; snowy north fringe,
  lush south. PENDING verdict on the revision.

Seed-hunt method (works, reuse): loop candidate seeds → composeWorld →
count target material %, pick winner (script pattern in session log;
composeWorld ~1-2s per small world).

**NEXT on the variety arc**: ALL NINE archetypes approved 2026-07-27
("these seem great" covered the hearth-hollow revision). MEDIUM SIZE
PRESET SHIPPED (behavior 32): 512×512 in 16×16 chunks, octaves shifted
one level (largest still spans half the map), sublinear scaling on
river thresholds (800/2000), spacing (44), settlement geometry
(cityLots 84, townCount 4), POI base 150 — per-cell POI density FALLS
vs small, honoring density doctrine. Three medium worlds built +
verified (floods equal, 0 errors): warm-vale-medium (balanced),
the-old-war-medium (dense), frontier-sparse-medium (sparse) — one per
density preset. Overviews sent 2026-07-27; verdicts PENDING. Note:
warm-vale-medium's coastal lighthouse sat on a lake shore (map has no
sea at seed 424242) — acceptable fallback, flag to user. On verdicts:
`large` preset next; new climates last.

## Density doctrine (IMPORTANT — two standing user verdicts)

"We shouldn't overdo it" + "not all maps should be this populated" →
`world.densityPreset` sparse|balanced|dense (density.presets v1, default
balanced, canonical pins dense). NEVER raise the dense-tier numbers
without a fresh verdict. If "feels empty" returns: gameplay-zoom review
(Godot), material variety, or naming/labels — not more props.

## Working agreements

- Loop: implement → `npm test` + `node dist/tools/update-golden.js` →
  CI → crops (decode/encode PNG scripts in scratchpad against
  outputs/w7-slice/resolved-render.png, 32px/cell) → SendUserFile →
  user refreshes viewer → verdict → iterate.
- Viewer: `http://127.0.0.1:8787/tools/viewer.html?dir=outputs/w7-slice`
  (server may belong to another session — do NOT restart; regenerate
  into the same dir; `?dir=outputs/gallery/<name>` browses archetypes).
  Header world picker (2026-07-27): serve-viewer's read-only
  `/api/worlds` lists outputs/ dirs; the dropdown hides artifacts whose
  formatVersion the public loader rejects, so pre-corridor-roads relics
  (demo-a, demo-b, w4-demo) stay invisible. Renders past 8192px on a
  side (medium 512-cell worlds render at 16384px) exceed what browsers
  will decode: the CLI emits a box-averaged `resolved-preview.png`
  alongside, and the viewer picks it by map size up front.
- Verify chain on EVERY generation change:
  `node dist/tools/godot-consumer.js --world outputs/w7-slice` (0 errors)
  + `node consumers/typescript/traverse.mjs outputs/w7-slice/world.json`
  — floods must be EQUAL.
- Versioning: behavior bump + touched rule packs; adapter-only →
  TILEFORGE_ADAPTER_VERSION + adapter.tileforge; RouteRules/
  SettlementRules/decoration shape → resolvedConfigFormat + compiler +
  literal in tests/compile.test.ts (currently 11).
- APPEND-ONLY: WORLD_PALETTE, STRUCTURE_TYPES, DECOR_TYPES, DECAL_TYPES,
  POI_TYPES. Parity: decorate BLOCKING == loader BLOCKING_PROPS; loader
  STRUCTURE_PASS_CELLS mirrors package manifest pass arrays; package
  walkable flags are truth. Decals never on rock/swamp EXCEPT
  decal.steam_vent (spec substrate).
- TileForge upstream (`C:\Users\headc\Documents\Semantic tile generator
  design`) is read-only; guard denylist in gitignored worldforge.local.json.

## Gotchas earned this arc (do not relearn)

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
- POI budget = budget + cityCount (landmark furniture exempt); far-reach
  quota 30%; rare kinds need their own channel lane (caves, pass
  memorials) or variant windows — the general stream starves latecomers.
- elev derivation lives in the ADAPTER (rock quartiles capped by
  distance-from-open-land, relaxed to ≤1 steps; artifact untouched).
  Waterfalls = lip + plunge cells where a stream drops a level.
- Settlement structures must not stamp on pathLayer (trails are
  corridors) — footprintFits checks it.
- gradeRockCell: trail cells over rock become gravel; LONE interruptions
  adopt a walkable neighbor material (one-cell-region confetti guard).
- Lone-cobble cleanup must treat street-ford neighbors as corridor
  continuation or it deletes ford landings (parity mismatch).
- TINY FUSION (corrected 2026-07-27): with THREE settlements on 64x64
  the outpost always fuses the band (every count-3 seed negative
  edge-gap). CITY+TOWN ALONE SEPARATE FINE on ~40% of seeds (measured
  16/37 with gap up to 24) — hunt seeds on gap, don't cap at 1.
- verify_world.gd walkability ladder: rungs apply only to cell types
  the world CONTAINS (wall-less worlds exist now — hearth-hollow);
  absent types print a named skip instead of failing.

## User-gated, still open

- Pick of next variety-arc step (recommendation above).
- Windowed Godot playthrough: `godot --path consumers/godot`.
- FORMAL baseline: `node dist/src/cli.js approve-recipe
  fixtures/recipes/small-cold-coastal.json --baseline`.
- End-of-plan taste-polish round.

## Commands

```
npm test                          # build + 152 tests (~3s)
node dist/tools/update-golden.js
node dist/src/cli.js resolve-tileforge fixtures/recipes/<name>.json --out outputs/gallery/<name>
node dist/tools/godot-consumer.js --world outputs/w7-slice
node consumers/typescript/traverse.mjs outputs/<dir>/world.json
node dist/tools/serve-viewer.js   # viewer :8787 (if not already up)
godot --path consumers/godot
```
