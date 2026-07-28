# WorldForge — session handoff (2026-07-28, account switch #5)

For a fresh AI session with no prior context. Read `AGENTS.md` and the
`README.md` reading list first; this file carries session state the
docs don't. File-based assistant memory at
`~/.claude/projects/C--Users-headc-Documents-WorldForge/memory/` is
machine-local and survives account switches; it cross-validates this
file. HANDOFF.md is the tiebreaker.

## 1. Where the project stands

Every planned arc is COMPLETE or gated on the user:

- W0–W9 (2026-07-26), ALIVE-WORLDS arc (behaviors 9–30, density
  doctrine), VARIETY arc (31–35: 15-world library, tiny→large size
  presets, 5-climate library).
- MOBILE arcs (36–46, merged 2026-07-28): game integration Phases 1–3
  (game-pack export, authored placement, pins/ranks), terrain texture,
  organic small maps + library refresh (ratified under 42), zone
  composition (zones vocabulary, hard wandering seams, anchor
  territories, zone elevation).
- PC arcs (2026-07-28): DUSK RE-PIN (§3), behavior 47 "trails stay
  open" (§5 gotchas — three sever fixes + the loader reachability
  gate), behavior 48 zone settlement floors (§4).

Versions: behavior 48, recipe compiler 29, resolved-config 23,
artifact format 8, TileForge adapter 6, packFormat 1. **207 tests, all
green.** Everything pushed through `0c35d7d` (+ this handoff commit).
Standing commit+push authorization (memory) — re-confirm per policy;
visual verdicts always user-gated.

## 2. The world library (fixtures/recipes/, galleries outputs/gallery/)

23 recipes, all generating clean through the behavior-47 reachability
gate. ALL APPROVED except one:

- **PENDING VERDICT: `the-eight-holds`** — behavior-48 demo (eight
  anchor territories, budget 8, settlementFloor 1 per zone → exactly
  one settlement per land, spread 1/1/1/1/1/1/1/1, flood 183218).
  Overview sent 2026-07-28.
- Approved small archetypes (9): frontier-sparse, warm-vale,
  highland-fastness, sunburnt-reach, weeping-marsh, drowned-shore,
  the-old-war, the-long-winter, hearth-hollow. Tiny hollows (3):
  fen/frost/dust (frost-hollow is DESIGNED exploration-heavy).
  Organic 256² climates (3): dust-sea, drowned-fen, white-waste.
  Mediums (3) + larges (2): warm-vale/the-old-war/frontier-sparse
  -medium, warm-vale/the-old-war -large. Zone pilots: the-eight-lands
  (8 anchor zones, hard wandering seams), the-broken-isles
  (archipelago; NW island DELIBERATELY uninhabited — see §6 routing
  decision).
- Canonical `small-cold-coastal` (seed 103991): flood **33893** both
  consumers (history: 33887 → 33890 ford guard → 34058 texture →
  33845 ambient → 33893 behavior-47 placement rules; every step
  flagged, consumer equality never broken). FORMAL BASELINE recorded
  (approval sidecar keyed on recipeSha — still valid: canonical has no
  zones, so behavior 48's vocabulary left its normalized recipe
  untouched).

## 3. Dusk re-pin (executed 2026-07-28)

Pinned package: `dusk-ae1eecb-seed103991` (user: "use dusk for now, we
can change later"). Forest fixture stays committed — re-pin back = lock
+ test-literal change. Dusk is a NEWER upstream commit: road bands 1/3
retired as `roadTypesLegacy` (matches our corridor doctrine; dirtpath
is the one live band). Semantic ids are THEME-IDENTICAL, so world
content is byte-identical across themes. §2/§4 acceptance green against
dusk's own reference. **OPEN designer ruling:** ruined-city dead
streets are authored with the legacy ruined-road band (renders fine;
new guide says never author new legacy runs) — bless as archaeology or
re-express as materials+rubble later.

## 4. Zone vocabulary after behavior 48

`zones`: layout grid|anchors, seams blended|hard, per-entry
temperature/moisture/elevationPermille, anchors+weights, and NEW
`settlementFloor` (0–8, default 0, OPT-IN — every pre-48 zone recipe
and deliberately wild zone generates unchanged; proven by invariant
floods on eight-lands 172389 / broken-isles 73077 / canonical 33893).
Floor phase runs right after the capital, BEFORE the geometric
reservations (authored intent outranks heuristics); the remote-quarter
reservation is room-capped (no-op for floor-free recipes — without it,
floors + quarter overshot budget 12>8). Territory = PURE `zoneOwnerAt`
(exported from macroFields; the seam wander is climate display, not
identity).

## 5. Gotchas (new this session — older ones in git history still bind)

- **Behavior 47, three sever mechanics** (all: structures on trails
  that are the only corridor through a mountain notch; all invisible to
  the compose gate, which walks corridors without structure
  knowledge): (1) plaza furniture (fountain/well) never on pathLayer;
  (2) ruined-city walls BREACH where an old trail passes + stamps
  clear pathLayer under their structure cells (a trail doesn't run
  through a building; the gateway repaint restores the gate line);
  (3) POI furniture may cover a trail END (the norm — spurs lead TO
  monuments) but never a THROUGH-trail (≥2 footprint-boundary
  crossings refuse the spot; gates exempt via pass cells; the lodge
  has alternate spots).
- **The approach carver** joins only trail segments that provably
  reach a corridor — the segment flood HOPS FORD-WIDTH stream gaps
  (≤2 river cells; wet worlds' trails continue across fords and broke
  without this) — with an any-trail fallback pass so a gate is never
  stranded that pre-47 would have joined. Own-stamp footprint cells
  are excluded as targets (an enclosed courtyard's cobble otherwise
  counts as "the network").
- **resolve-tileforge and export-game-pack GATE on destination
  reachability through the PUBLIC loader** (the consumers' own nudge≤8
  + flood rule). A severed world cannot ship silently. When the gate
  fires, debug with ASCII walkability maps + a cut-finder (pattern in
  session log; beware: two floods larger than the map means they're
  the same component).
- **Reservation phases must be room-capped** — any new selection phase
  that adds settlements must cap by remaining budget or later phases
  overshoot (behavior 48 lesson).
- Temporary debug instrumentation (env-guarded stderr prints) is fine
  for hunting — REMOVE before commit (behavior 47 hunt pattern).
- Bump rule packs SEQUENTIALLY and check the changelog comment matches
  the table — this session's author mis-skipped twice.
- Viewer/render ladder: ≤8192px full render; >8192 adds banded
  resolved-preview.png; >16384 (large) preview-only (32768² rgba is
  exactly 2^32 bytes). serve-viewer /api/worlds picker hides
  loader-rejected relics; native check accepts render OR preview.
- Overviews for verdicts: box-average downscale to ~1024 (scratchpad
  script pattern: decode PNG scanline-filtered, factor-N average);
  crops via rect extraction. Both are session-scratchpad tools —
  recreate freely.

## 6. Open items

**User-gated:**
- the-eight-holds verdict (last open visual).
- Ruined-road-band ruling (§3).
- Windowed Godot playthrough; taste-polish round; fen swamp-margin
  widening (walkability care needed).

**Engine-ready when wanted:**
- **Ferry routing (DECIDED 2026-07-28: ferries, "for now")** — piers
  on facing shores joined by a water route the loader treats as a
  legal crossing; unblocks inhabited detached islands (broken-isles
  NW island is the pilot case). Causeways/per-island webs rejected;
  "for now" = revisit allowed after Phase 5 shows game needs. New
  behavior + loader/consumer parity work when scheduled.
- Zone-crop preview tooling (per-zone verdict loop QoL) — last
  unbuilt zone-arc line item.

**Game integration (docs/GAME_INTEGRATION_PLAN.md):**
- Phase 4 validating importer LIVE game-side (validates the reference
  pack in 0.57 s, independently reproduces flood; contract-as-built
  clarifications recorded in plan §3.3a). Rendering half deferred
  post-Gate-1 (game side).
- Dusk game pack exported at
  `outputs/game-packs/small-cold-coastal-pack-dusk/` (flood 33845 at
  export time — REGENERATE the pack before handing it over again:
  behavior 47/48 moved canonical to 33893, so the committed pack
  numbers are stale).
- Phase 5 slice-zone drafting: fully unblocked (dusk pinned, importer
  live, gate protecting exports); needs the user's creative direction.

## 7. Working agreements (unchanged core)

- Loop: implement → `npm test` + `node dist/tools/update-golden.js` →
  verify chain (godot-consumer 0 errors + TS traverse, floods EQUAL)
  on canonical + touched worlds → overviews → SendUserFile → verdict.
- Density doctrine: never raise dense-tier ambient/POI numbers without
  a fresh verdict; structural density scales with map size, per-cell
  props/POIs fall.
- Versioning: behavior bump + touched packs; config-shape changes bump
  resolvedConfigFormat + compiler + literal in tests/compile.test.ts
  (currently 23).
- APPEND-ONLY: WORLD_PALETTE, STRUCTURE_TYPES, DECOR_TYPES,
  DECAL_TYPES, POI_TYPES. Parity: decorate BLOCKING == loader
  BLOCKING_PROPS; loader STRUCTURE_PASS_CELLS mirrors package manifest;
  package walkable flags are truth.
- TileForge upstream (`C:\Users\headc\Documents\Semantic tile
  generator design`) read-only; guard denylist in gitignored
  worldforge.local.json. Theme exports live in its exports/ (dusk
  consumed from there; autumn/winter/reference available).
- Viewer: `http://127.0.0.1:8787` (launch.json "viewer"; do NOT
  restart a server another session may own; regenerate into the same
  dir and refresh — the header dropdown lists all worlds).

## 8. Commands

```
npm test                          # build + 207 tests
node dist/tools/update-golden.js
node dist/src/cli.js resolve-tileforge fixtures/recipes/<name>.json --out outputs/gallery/<name>
node --max-old-space-size=8192 dist/src/cli.js resolve-tileforge fixtures/recipes/<medium-or-large>.json --out outputs/gallery/<name>
node dist/tools/godot-consumer.js --world outputs/gallery/<name>
node consumers/typescript/traverse.mjs outputs/gallery/<name>/world.json
node dist/src/cli.js export-game-pack fixtures/recipes/<name>.json --out <dir>
node dist/src/cli.js approve-recipe fixtures/recipes/<name>.json --baseline
node dist/tools/serve-viewer.js   # viewer :8787 (if not already up)
godot --path consumers/godot
```
