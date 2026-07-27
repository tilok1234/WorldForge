# WorldForge — session handoff (2026-07-27, account switch #3)

For a fresh AI session with no prior context. Read `AGENTS.md` and the
`README.md` reading list first; this file carries session state the docs
don't. File-based assistant memory at
`~/.claude/projects/C--Users-headc-Documents-WorldForge/memory/` is
machine-local and survives account switches; it cross-validates this
file. HANDOFF.md is the tiebreaker.

## Where the project stands

W0–W9 complete, ALIVE-WORLDS ARC complete (behaviors 15–30), VARIETY ARC
underway (behavior 31). Versions: behavior 31, recipe compiler 15,
artifact format 8, resolved-config 11, TileForge adapter 6. 152 tests;
CI green through `a9cd3b8` (all pushed). Standing commit+push
authorization held this whole arc — re-confirm with the user per policy.

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
unreachable), galleries in outputs/gallery/<name>/. ALL SEVEN visually
approved (user 2026-07-27: "they look great" on the final four):

- frontier-sparse — temperate sparse, 4 settlements, lodge in the corner.
- warm-vale — wet warm temperate balanced; world tree, lighthouse, ruined city.
- highland-fastness — northElevation 520 cold; fortress + 2 hamlets +
  spire on a massive north wall.
- sunburnt-reach — seed-hunted 77% dry steppe (moisture −240, temp
  +260); oasis lakes, ruined city, spire, lodge. GORGEOUS, distinct.
- weeping-marsh — 48% mud/swamp lowlands (moisture +300, northElev −120).
- drowned-shore — 39% water (northElev −150); twin lighthouses + lodge.
- the-old-war — dense war-north: TWO fortresses + ruined city + hamlet.

Seed-hunt method (works, reuse): loop candidate seeds → composeWorld →
count target material %, pick winner (script pattern in session log;
composeWorld ~1-2s per small world).

**NEXT on the variety arc**: verdicts are IN (all four approved
2026-07-27, no iteration wanted). Recommendation given to user, awaiting
pick: (1) warm-up — extreme-snow + tiny pocket-world archetypes, pure
recipes, zero engine risk (`tiny` 64x64 already exists in schema +
SIZE_RULES; only an old fixture uses it); then (2) milestone — `medium`
size preset (fill the seven SizePreset-keyed tables in compile.ts +
schema enum + tests; stress-tests POI budget/far-reach/route scaling);
`large` only after medium verdicts. (3) new climates stays last (most
cross-cutting).

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
