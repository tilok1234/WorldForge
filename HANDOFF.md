# WorldForge — session handoff (2026-07-27)

For a fresh AI session with no prior context. Read `AGENTS.md` and the
`README.md` reading list first; this file carries session state the docs
don't. File-based assistant memory at
`~/.claude/projects/C--Users-headc-Documents-WorldForge/memory/`
cross-validates this file; HANDOFF.md is the tiebreaker.

## Where the project stands

W0–W9 complete (see git history) plus the ALIVE-WORLDS ARC, behaviors
15–29, all user-verdict-driven. Versions: behavior 29, recipe compiler
14, artifact format 8, resolved-config 10, TileForge adapter 6. 152
tests; CI green through `1055d02`. Canonical recipe
`fixtures/recipes/small-cold-coastal.json` (seed 103991), 256×256.

The canonical world now holds:

- **Two cities** (capital 240,125 harbor; second city 94,128 crossing —
  the remote-quarter reservation, routes.graph v7 + settlements.plans
  v7 cityCount), 3 towns, 5 villages; settlement hierarchy from
  behavior 18 (city/town/outpost tiers, ring roads, street arms).
- **Eight landmarks**, every one trail-served and walk-reachable:
  ancient fortress, ruined city (keep + FOUR delves: dungeon, temple,
  portal, crypt), world tree (canopy pass cell), crystal spire,
  lighthouse (coastal relation), Winterlodge (remote_corner relation,
  Manhattan corner pick), two mountain hamlets (high bowls).
- **103 POIs across 24 kinds** — story vignettes (behavior 20: every
  discoverable tells a story), far-reach quota (30%) so rock/snow kinds
  can't starve, dedicated pre-pass lanes for caves and pass memorials.
- **Roads**: MST streets/highways + shortcut trails + landmark trails
  (graded over rock: rock→gravel, lone cells adopt neighbor material) +
  POI spur paths. Trails are corridors: settlement structures must not
  stamp on pathLayer (footprintFits), gateways join the trail at carve
  time.
- **Mountain relief** (adapter v4-6): quantized elev levels inside rock
  only — walkable cells all stay level 0 so cliffs never cross
  traversal; §2.8 renders terraces; two-tile waterfall cascades + rapids
  on highland streams (adapter-derived).
- **Character zones** (decoration.props v6-8): flower meadows, blighted
  groves, shroom glens, burned woods, boulder fields, cactus flats —
  blobs that OVERRIDE ambient; rock has its own scatter table
  (impassable ⇒ blocking free).

## Where the density stands (IMPORTANT)

User verdicts after behavior 29: **"we shouldn't overdo it"** and **"not
all maps should be this populated"** — the density plateau is reached
AND population is now an authoring choice (behavior 30):
`world.densityPreset` = sparse | balanced | dense (density.presets v1)
scales the POI budget, ambient decoration, and shortcut trails. Default
balanced; the canonical recipe pins dense (byte-stable through the
change). Do NOT dial the dense numbers further without a fresh verdict;
sparse/balanced exist for calmer maps. Next levers if "empty" returns:
gameplay-zoom review (Godot), material variety, or naming/labels — not
more props.

## Working agreements (stable)

- Loop: implement → tests + goldens (`node dist/tools/update-golden.js`)
  → CI green → visual candidates (crops via scratchpad decodePng/encodePng
  on outputs/w7-slice/resolved-render.png) → SendUserFile + user refresh
  → verdict → iterate.
- Viewer: user watches `http://127.0.0.1:8787/tools/viewer.html?dir=outputs/w7-slice`
  (server usually already running; possibly owned by another session —
  do NOT restart, just regenerate into the same dir).
- Verify chain every generation change:
  `node dist/tools/godot-consumer.js --world outputs/w7-slice` (0 errors)
  and `node consumers/typescript/traverse.mjs outputs/w7-slice/world.json`
  — floods must be EQUAL (last: 33,887).
- Versioning discipline: behavior bump + touched rule packs; adapter-only
  → TILEFORGE_ADAPTER_VERSION + adapter.tileforge; RouteRules/
  SettlementRules shape → resolvedConfigFormat + compiler + test literal
  in tests/compile.test.ts.
- APPEND-ONLY: WORLD_PALETTE, STRUCTURE_TYPES, DECOR_TYPES, DECAL_TYPES,
  POI_TYPES. Parity: BLOCKING (decorate) == BLOCKING_PROPS (loader);
  structure pass cells in loader STRUCTURE_PASS_CELLS mirror the
  package manifest (`pass` arrays); package walkable flags are truth.
- Decals never on rock/swamp EXCEPT decal.steam_vent (spec substrate).
- Commit+push authorized (standing, re-confirmed through this arc);
  visual approvals stay user-gated.

## Gotchas added this arc

- Landmark furniture (multi-cell structures inside landmark stamps) goes
  through the POI pass as poi.city_ruin records (cityStamp helper) — the
  loader/adapter consume POI structure records; stamps carry only walls,
  materials, road marks. Landmark rects are districts in the artifact
  validator (poi structures may sit inside).
- Landmark trails are built by routes BEFORE stamps: entrance validation
  runs pre-POIs, so gate cells must be corridor at landmark time (the
  gateway pathLayer paint in placeLandmarks).
- Ford rule bridges runs of ≤2 stream cells (matches street-arm skip);
  loader duplicates the rule (zero-imports contract).
- The POI budget math: budget + cityCount (landmark furniture is
  budget-exempt); far quota = 30%; rare kinds may need their own channel
  lane (caves, pass memorials) or variant windows — the general stream
  starves latecomers.
- elev derivation lives in the ADAPTER (visual): rock quartiles capped by
  distance-from-open-land, relaxed to ≤1 steps. Artifact untouched.

## User-gated, still open

- Windowed Godot playthrough: `godot --path consumers/godot`.
- FORMAL visual baseline: `node dist/src/cli.js approve-recipe
  fixtures/recipes/small-cold-coastal.json --baseline`.
- End-of-plan taste-polish round.

## Commands

```
npm test                          # build + 152 tests
node dist/tools/update-golden.js
node dist/src/cli.js resolve-tileforge fixtures/recipes/small-cold-coastal.json --out outputs/w7-slice
node dist/tools/godot-consumer.js --world outputs/w7-slice
node consumers/typescript/traverse.mjs outputs/w7-slice/world.json
node dist/tools/serve-viewer.js   # viewer on :8787 (if not already up)
godot --path consumers/godot      # play the slice
```
