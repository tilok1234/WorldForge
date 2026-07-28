# WorldForge — session handoff (2026-07-28, account switch #6)

For a fresh AI session with no prior context. Read `AGENTS.md` and the
`README.md` reading list first; this file carries session state the
docs don't. File-based assistant memory at
`~/.claude/projects/C--Users-headc-Documents-WorldForge/memory/` is
machine-local and survives account switches; it cross-validates this
file. HANDOFF.md is the tiebreaker.

**TWO LANES ARE LIVE (read §1a before touching anything):** `main`
carries the PC pack lane (this file); branch
`origin/claude/worldforge-game-review-yzllne` carries the OTHER
session's behaviors 49–50 + three designer decisions, UNMERGED, based
on `30319f7`. This handoff folds BOTH states in; nothing in either
lane may be discarded.

## 1. Where the project stands

Every planned arc is COMPLETE, in a verdict round, or gated on the user:

- W0–W9 (2026-07-26), ALIVE-WORLDS arc (behaviors 9–30, density
  doctrine), VARIETY arc (31–35: 15-world library, tiny→large size
  presets, 5-climate library).
- MOBILE arcs (36–46, merged 2026-07-28): game integration Phases 1–3
  (game-pack export, authored placement, pins/ranks), terrain texture,
  organic small maps + library refresh (ratified under 42), zone
  composition (zones vocabulary, hard wandering seams, anchor
  territories, zone elevation).
- PC arcs (2026-07-28, on main): DUSK RE-PIN (§3), behavior 47 "trails
  stay open" (§5 — three sever fixes + the loader reachability gate),
  behavior 48 zone settlement floors (§4), PACK LANE `a1304b9` Phase-A
  structures-solid stamp + `cbf11a9` moss-walks ruling (§5/§6 — pack
  walkability semantics; base artifact untouched).
- GAME-REVIEW arcs (2026-07-28, on the UNMERGED branch): behavior 49
  settlement organics + variety (opt-in `settlementStyle`:
  growthPermille / scatterPermille / variety; nine new package
  structures rostered, all fully blocking; dock deferred — needs
  pass-cells + waterline placement), behavior 50 lived-in streets
  (`organicStreets`: worn packed-earth lanes, roadless fringe houses,
  LANE PROMISE keep-outs, two-tier entrance check, humble edges).
  Style-free recipes are byte-identical AND keep their recipeSha256 —
  the canonical baseline sidecar stays valid across the merge.

Versions — main: behavior 48, recipe compiler 29, resolved-config 23,
artifact format 8, TileForge adapter 6, packFormat 1; **207 tests
green, verified on this machine** through `cbf11a9`. Branch: behavior
50, compiler 31, resolved-config 25, settlements.plans 13, + a
settlementStyle test suite (green per its commits; not run on this
machine — and the Godot half of its verify chain is still pending a
machine with the binary, which THIS machine has). Standing commit+push
authorization (memory) — re-confirm per policy; visual verdicts always
user-gated.

## 1a. Merge duty (whoever integrates the branch)

1. Merge `origin/claude/worldforge-game-review-yzllne` into main only
   AFTER the eight-holds round-3 verdict lands (it may add commits).
2. Conflicts: HANDOFF.md — take MAIN's copy (this file already folds
   the branch's prose; re-add anything newer than `ff98b3b` by hand).
   docs/GAME_INTEGRATION_PLAN.md — both lanes edited DIFFERENT
   sections (branch: §6.1 ruled-as-archaeology text; main: §3.3/§3.3a
   pack-walkability bullets); a clean auto-merge is expected, verify
   both survive.
3. After merge: `npm test` + update-golden; run the Godot half of the
   verify chain on the touched worlds (branch note: it could not);
   canonical floods must stay 33893 (style-free = byte-identical
   layers), eight-holds at its round-3 number.
4. RE-EXPORT the dusk game pack (behavior bump changes world.json
   identity bytes → baseArtifactSha256 shifts even though layers and
   floods don't; the §6 pack numbers below are pre-merge).

## 2. The world library (fixtures/recipes/, galleries outputs/gallery/)

23 recipes, all generating clean through the behavior-47 reachability
gate. ALL APPROVED except one:

- **PENDING VERDICT (round 3): `the-eight-holds`** — behavior-48 demo
  (eight anchor territories, budget 8, settlementFloor 1 per zone →
  exactly one settlement per land, spread 1/1/1/1/1/1/1/1). Flood
  history: 183218 (v48, main's recipe) → 182872 (v49 restyle) →
  **182947** (v50 full style, 9/9 reachable, identity v50). The v50
  restyled recipe + regenerated demo live ON THE BRANCH; verdict
  sheet republished there with adaptive per-hold crops.
- Approved small archetypes (9): frontier-sparse, warm-vale,
  highland-fastness, sunburnt-reach, weeping-marsh, drowned-shore,
  the-old-war, the-long-winter, hearth-hollow. Tiny hollows (3):
  fen/frost/dust (frost-hollow is DESIGNED exploration-heavy).
  Organic 256² climates (3): dust-sea, drowned-fen, white-waste.
  Mediums (3) + larges (2): warm-vale/the-old-war/frontier-sparse
  -medium, warm-vale/the-old-war -large. Zone pilots: the-eight-lands
  (8 anchor zones, hard wandering seams), the-broken-isles
  (archipelago; NW island DELIBERATELY uninhabited — ferries now
  DECIDED, see §6).
- Canonical `small-cold-coastal` (seed 103991): flood **33893** both
  consumers (history: 33887 → 33890 ford guard → 34058 texture →
  33845 ambient → 33893 behavior-47 placement rules; every step
  flagged, consumer equality never broken). FORMAL BASELINE recorded
  (approval sidecar keyed on recipeSha — still valid on BOTH lanes:
  canonical has no zones and no settlementStyle, so behaviors 48–50
  left its normalized recipe untouched).

## 3. Dusk re-pin (executed 2026-07-28)

Pinned package: `dusk-ae1eecb-seed103991` (user: "use dusk for now, we
can change later"). Forest fixture stays committed — re-pin back = lock
+ test-literal change. Dusk is a NEWER upstream commit: road bands 1/3
retired as `roadTypesLegacy` (matches our corridor doctrine; dirtpath
is the one live band). Semantic ids are THEME-IDENTICAL, so world
content is byte-identical across themes. §2/§4 acceptance green against
dusk's own reference. **RULED 2026-07-28: blessed as archaeology,
with an upstream upgrade path.** Ruined-city dead streets keep the
legacy ruined-road band (renders fine; thematically relics). Doctrine
unchanged: never author NEW legacy runs elsewhere. Upgrade path: the
designer may add a dedicated live ruined-road band in TileForge
(their forge, their side of the boundary); when a package ships it,
re-pin and switch the ruined-city stamp to the new band (behavior
bump + the-old-war family re-verdict at that point). (Ruling recorded
in the branch's plan §6.1 edit — lands with the merge.)

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
identity). Behaviors 49–50 (branch) add `settlementStyle` beside it —
opt-in, style-free recipes byte-identical.

## 5. Gotchas (this date — older ones in git history still bind)

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
- **Pack walkability is NO LONGER the raw loader grid** (main,
  plan §3.3): `buildWalkability` = loader ladder + moss-walks ruling +
  Phase-A structures-solid stamp. Naive slit sealing severs worlds —
  1-wide UNPAVED gaps between buildings are sometimes real corridors
  (tiny lost half its map to one sealed village lane; canonical's
  mountain notches thread between mine buildings; the ruined city's
  streets are band art over bare ground, invisible to material
  checks). Hence: street/trail/pier/ford/moss guard +
  landmark-interior exemption + gate-type exemption + the connectivity
  reconciliation loop (seal → find orphans → pocket-seal
  building-hugging nooks ≤2 cells out / reopen sole-corridor slits /
  refuse anything else). Pack parity = "loader grid + moss − stamp",
  proven by tests/gamepack.test.ts; the base ladder and both consumer
  lanes are untouched (canonical 33893 invariant).
- **Moss only grows on rock**, so it read as a wall while rendering as
  lawn. The pack's moss ruling keys on the ADAPTER's cliff
  quantization (resolved `elev`: level 0 = flat apron, no cliff face;
  ≥1 = behind terraces) — the artifact's elevation layer is the raw
  permille field and CANNOT make this distinction. buildWalkability
  therefore takes `mapData.elev`.
- **The W5 entrance check floods corridors only** — behavior 50
  (branch) added the LANE PROMISE (verified routes recorded in
  laneCells; later structures refuse to stamp on them, farms keep
  fences/crops off, decoration keeps props off) and a second
  entrance-check tier: solid entrances must join the CORRIDOR network,
  worn/none entrances check against walkable GROUND (their lanes are
  deliberately gappy — a corridor-only flood reads them as islands;
  the first styled generation refused exactly three such doorsteps
  before the tier existed — no road never means no route).
- **Reservation phases must be room-capped** — any new selection phase
  that adds settlements must cap by remaining budget or later phases
  overshoot (behavior 48 lesson).
- Temporary debug instrumentation (env-guarded stderr prints) is fine
  for hunting — REMOVE before commit (behavior 47 hunt pattern).
- Bump rule packs SEQUENTIALLY and check the changelog comment matches
  the table — mis-skipped twice on 2026-07-28.
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
- the-eight-holds verdict: **round-3 RE-VERDICT PENDING** (branch).
  Behavior 50 (lived-in streets) SHIPPED and the demo regenerated with
  the full style (growth 600 / scatter 450 / variety / organicStreets):
  cobbled civic cores, worn barely-there lanes, roadless fringe houses
  on natural ground, cottages at the edges. Flood **182947**, 9/9
  reachable, identity v50. Behavior 49 SHIPPED (settlement organics +
  variety, opt-in `settlementStyle`); under it the crossing city
  rolled radius 60 with 154 buildings, harbor city 47/105, towns
  31–39, spread still 1/1/1/1/1/1/1/1, flood 182872 (9/9 reachable
  through the public loader; Godot half of that verify chain still
  pending — run it on this machine post-merge). Verdict sheet
  republished with adaptive per-hold crops.
- **Slit-seal vs flat-green readability COLLISION** (main, needs a
  designer ruling): the annotated inter-house gaps in the start town
  (region 208-248 x 126-148) contain ZERO moss — they are the 13
  grass-like slit cells the Phase-A stamp sealed, i.e. the
  porous-collision fix and "flat green must walk" want opposite
  things on those exact cells. Options: keep seals (sprite-overlap
  protection, current state) / reopen flat-green slits (one-line
  keep-open change, sprite bug returns) / ask TileForge for
  blocked-ground dressing art (fixes both, upstream task).
- **TileForge upstream asks (user-side, per AGENTS.md), recorded:**
  chapel (2×3) is the only church-type art — a larger temple/church
  needs a new package structure; roof-ridge/chimney occlusion needs a
  per-cell overhang-row template field (plan §3.3a); optional live
  ruined-road band (§3 upgrade path); dock structure with pass-cells
  (behavior-49 deferral).
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
  pack in 0.57 s, independently reproduces the flood; contract-as-built
  clarifications in plan §3.3a). Rendering half deferred post-Gate-1.
- Dusk game pack at `outputs/game-packs/small-cold-coastal-pack-dusk/`
  RE-EXPORTED 2026-07-28 with the Phase-A stamp + moss ruling
  (plan §3.3): footprints seal doors-too, unpaved slits/pockets close,
  level-0 moss carpet walks (626 cells: 478 join the main region, 148
  enclaves; aprons also reconnect 366 previously-unreachable
  wilderness cells). Pack flood **34556** (base 33893 − 181 stamped +
  moss additions; the pack flood may exceed the base loader flood).
  Byte-stable double export; game porosity audits read 11 walkable
  structure tiles, not 0 (9 bridges + 2 ruined-city breaches —
  legitimate, plan §3.3a). RE-EXPORT AFTER THE 49/50 MERGE (§1a:
  identity bytes shift).
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
  (23 on main; 25 on the branch — the branch literal wins post-merge).
- APPEND-ONLY: WORLD_PALETTE, STRUCTURE_TYPES, DECOR_TYPES,
  DECAL_TYPES, POI_TYPES. Parity: decorate BLOCKING == loader
  BLOCKING_PROPS; loader STRUCTURE_PASS_CELLS mirrors package manifest;
  package walkable flags are truth.
- TileForge upstream (`C:\Users\headc\Documents\Semantic tile
  generator design`) read-only; guard denylist in gitignored
  worldforge.local.json. Theme exports live in its exports/ (dusk
  consumed from there; autumn/winter/reference available).
- Viewer: `http://127.0.0.1:8787` (launch.json "viewer"); an
  UNCOMMITTED launch.json entry "viewer-b" (:8788) belongs to another
  session — preserve it, do NOT restart a server another session may
  own; regenerate into the same dir and refresh — the header dropdown
  lists all worlds.

## 8. Commands

```
npm test                          # build + tests (207 on main)
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
