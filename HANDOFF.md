# WorldForge — session handoff (2026-07-28, remote session close / switch #6)

For a fresh AI session with no prior context. Read `AGENTS.md` and the
`README.md` reading list first; this file carries session state the
docs don't. NOTE: this session ran in a REMOTE cloud container (no
Godot binary, no access to the machine-local assistant memory at
`~/.claude/projects/C--Users-headc-Documents-WorldForge/memory/`).
That memory cross-validates this file for PC sessions; HANDOFF.md is
the tiebreaker.

## 0. BRANCH — read this first

Everything from this session lives on
**`claude/worldforge-game-review-yzllne`** (pushed), NOT main. Session
commits, in order: `8fe0aec` ferries decision, `9eb1566` ruined-road
ruling, `4be6757` rework directive #1, `9852aab` behavior 49,
`82d1d39` eight-holds restyle, `461bc91` rework directive #2,
`9bd1cf3` behavior 50, `1190a4d` lane promises + two-tier entrance
check, `ff98b3b` eight-holds regen, plus this handoff. A PC session
should merge (or PR) this branch into main before continuing
engineering; nothing on main moved.

## 1. Where the project stands

- All arcs through the ZONE arc: COMPLETE and ratified (W0–W9,
  ALIVE-WORLDS 9–30, VARIETY 31–35, MOBILE 36–46, PC arcs: dusk
  re-pin, 47 trails-stay-open, 48 zone settlement floors).
- **NEW: SETTLEMENT-STYLE arc (this session, behaviors 49–50)** —
  born from the eight-holds verdict loop, two designer rework rounds:
  - **49 — settlement organics + variety**: opt-in recipe
    `settlementStyle` = `growthPermille` (per-settlement size roll,
    squared; cities full / towns half / outposts never; lots +
    approach budgets scale), `scatterPermille` (dense core thinning
    to scattered rim; the fabric footprint EXTENDS by the same
    fraction so the lot list redistributes outward), `variety`
    (purpose-flavored mixes). Nine package structures newly rostered:
    windmill, watermill, sawmill, quarry, store, warehouse,
    guardhouse, fisher_hut, tent (all fully blocking → loader
    pass-cell parity untouched). `dock` DEFERRED (pass cells +
    waterline placement).
  - **50 — lived-in streets**: `settlementStyle.organicStreets` —
    civic specials keep solid cobble approaches; ordinary houses get
    worn packed-earth lane fragments (~450‰ of route cells, ~250‰
    past depth 600, doorstep always marked); ~half the fringe houses
    (depth > 450) paint NO lane; yard gaps vary 1–2; street arms roll
    per-direction lengths 50–130%; deep fill houses humble into
    cottages. See §5 for the lane-promise contract this required.

Versions: behavior **50**, recipe compiler **31**, resolved-config
**25**, artifact format 8, TileForge adapter 6, packFormat 1.
**221 tests, all green** (14 in the new tests/settlementStyle.test.ts).

Identity discipline (load-bearing, new): the normalized
`settlementStyle` key exists ONLY when the recipe authors it — a
style-free recipe keeps its exact pre-49 recipeSha256. A test pins
the canonical baseline against its committed approval sidecar
(80cff5eb…), and the golden layer diff is empty against the pre-49
snapshot. Never "default" this key into normalization.

## 2. Decisions recorded this session (all designer-ratified in chat)

- **Island routing = FERRIES** ("for now"): piers on facing shores +
  a water route the public loader treats as a legal crossing. Chosen
  over causeways and per-island webs. Implementation queued
  (engine-ready, §6); broken-isles NW island is the pilot.
- **Ruined-road band = BLESSED as archaeology**, with an upstream
  upgrade path: if a future TileForge release ships a dedicated LIVE
  ruined-road band, re-pin and switch the ruined-city stamp
  (behavior bump + the-old-war family re-verdict then). No-new-
  legacy-runs doctrine holds elsewhere. Recorded in
  docs/GAME_INTEGRATION_PLAN.md §6.1 too.
- **TileForge upstream ask on record (user-side task):** chapel (2×3)
  is the only church-type art in the package; a larger temple/church
  needs a new package structure. Smallest ask, per AGENTS.md.

## 3. The world library (fixtures/recipes/, galleries outputs/gallery/)

23 recipes. 22 APPROVED and byte-untouched by this session's work
(style is opt-in; invariance proven in-suite). ONE pending:

- **PENDING VERDICT (round 3): `the-eight-holds`** — the behavior-48
  demo, now also the settlement-style demo. Recipe carries the full
  style: growth 600 / scatter 450 / variety / organicStreets. Current
  numbers: flood **182947** through the public loader, 9/9
  destinations reachable, spread 1/1/1/1/1/1/1/1 (one hold per
  anchor territory), identity v50. History: 183218 (48) → 182872
  (49) → 182947 (50), every step designer-driven. The crossing city
  rolled radius 60 / 154 buildings; harbor city 47/105; towns 31–39;
  waypoint outpost 15/10. Godot half of the verify chain NOT run
  (no binary in the container) — run it at the PC with the windowed
  playthrough.
- Verdict sheet (adaptive per-hold crops + overview) published at:
  https://claude.ai/code/artifact/82bb6579-05cc-4998-9cd9-55c5da917aa8
  — regenerate via the scratchpad pattern in §5 if the link is dead.
- Canonical `small-cold-coastal`: flood 33893, FORMAL BASELINE,
  sidecar valid and now test-pinned (§1).

## 4. settlementStyle authoring quick-reference

```json
"settlementStyle": {
  "growthPermille": 600,   // 0-1000; max extra radius, squared roll
  "scatterPermille": 450,  // 0-900; rim thinning + footprint extension
  "variety": true,         // purpose-flavored building mixes
  "organicStreets": true   // worn lanes, roadless fringe, cottages
}
```

All fields optional, all default off; absent block = pre-49 fabric
byte-for-byte. Tune by number and re-verdict — the demo loop is
cheap. Purpose flavors: harbor→warehouse/fisher_hut/store,
crossing→watermill, farming→windmill, mining→quarry,
waypoint→guardhouse/tent (outposts swap kit slots; all swap indices
stay below tiny's 6 lots — keep it that way).

## 5. Gotchas (new this session — older ones in git history still bind)

- **The lane promise (behavior 50, the big one).** The W5 entrance
  check floods CORRIDOR cells only (cobble/packed/trails/crossings/
  fords). Worn lanes are deliberately gappy — their doorsteps read as
  corridor islands, and the first styled generation was refused with
  three "entrance unreachable" errors (the gate doing its job; ASCII
  neighborhood dumps found it). The contract now: every carveApproach
  route in worn/none mode is recorded in `laneCells` and becomes a
  promise — later structures refuse to stamp on it (footprintFits,
  like pathLayer), farms keep fences/crops off it, decoration keeps
  all props off it — and the entrance check runs two tiers:
  solid-lane entrances against the corridor flood (byte-identical to
  pre-50), worn/none entrances against walkable GROUND. `laneMode` is
  internal to plans, never serialized. If you add ANY new pass that
  stamps or blocks cells, honor laneCells.
- **Scatter must extend the footprint.** Thinning acceptance inside a
  fixed radius LOSES the lot tail on small radii (first test run
  caught it: mean distance went down, not up). scatter extends the
  scan bound by its fraction; plan.radius carries the extended reach
  so farms/POIs ring outside the fringe.
- **Normalized-key discipline.** `settlementStyle` is conditionally
  PRESENT in the normalized recipe (never null) — canonicalJson
  serializes nulls, so a null field would move every recipeSha and
  invalidate every approval sidecar. The sidecar-pin test enforces
  this; keep the pattern for all future vocabulary.
- **Structure roster ≠ package roster.** The dusk package ships 52
  structures; the roster now claims 49 of them. Before assuming art
  doesn't exist, list `mappings.structures` in the pinned manifest.
  New types: append-only + STRUCTURE_NAME entry + footprint from the
  manifest (the settlementStyle suite has a drift test).
- **Verdict-sheet scratchpad pattern** (recreate freely): decode the
  8192 preview once (PNG scanline unfilter), box-average factor-8
  overview at 1024, per-hold crops sized `max(80, radius*2+16)` cells
  with factor 2 or 4 keeping output ≤ ~1088px, embed as data URIs in
  a themed HTML artifact. Scripts lived at the session scratchpad
  (`overview.mjs`, `verdict-sheet.mjs`, `debug-seal.mjs` for ASCII
  seal-hunting).
- Remote containers have no `godot` binary — the TS lane + compose
  gate + resolve gate still verify fully; record "Godot half pending
  PC" honestly per AGENTS.md evidence rules.

## 6. Open items

**User-gated:**
- **the-eight-holds round-3 verdict** (the only open visual). Knobs
  are numbers; iterate freely.
- Windowed Godot playthrough (+ run godot-consumer on the new demo);
  taste-polish round; fen swamp-margin widening (walkability care).

**Engine-ready when wanted:**
- **Ferry routing** (decision §2): new behavior — piers on facing
  shores + water route + loader/consumer parity; unblocks inhabited
  detached islands (broken-isles NW pilot).
- Zone-crop preview tooling as a committed tool (the scratchpad
  verdict sheet in §5 does this ad hoc; productize if the per-zone
  verdict loop continues).
- Extending settlementStyle to more library worlds (designer taste
  call + re-verdicts; all opt-in per recipe).

**Game integration (docs/GAME_INTEGRATION_PLAN.md):**
- Phase 4 importer LIVE game-side; rendering half post-Gate-1.
- Committed dusk game pack is STALE (exported at flood 33845; canon
  moved to 33893 pre-session) — regenerate before any handover.
- **Game-side ledger #15 flag (upstream ask TO us):** north
  roof-ridge rows bake into the solid structures layer; the exit is a
  pack rev moving roofs to props-overhang. Not yet scheduled.
- Phase 5 slice-zone drafting: fully unblocked, awaiting the
  designer's creative direction — likely the next big arc, and the
  settlement-style vocabulary was built to serve it.

## 7. Working agreements (unchanged core)

- Loop: implement → `npm test` + `node dist/tools/update-golden.js`
  → verify chain (TS traverse + godot-consumer where possible,
  floods EQUAL) on canonical + touched worlds → overviews →
  SendUserFile/artifact → verdict. One approved decision = one
  commit, pushed immediately.
- Density doctrine, APPEND-ONLY lists, parity rules, TileForge
  read-only boundary, viewer etiquette: all as before (see git
  history of this file).
- Designer style: informal, values momentum + honest pushback +
  concrete recommendations; visual verdicts always theirs.

## 8. Commands

```
npm test                          # build + 221 tests
node dist/tools/update-golden.js
node --max-old-space-size=8192 dist/src/cli.js resolve-tileforge fixtures/recipes/the-eight-holds.json --out outputs/gallery/the-eight-holds
node dist/tools/godot-consumer.js --world outputs/gallery/<name>   # PC only
node consumers/typescript/traverse.mjs outputs/gallery/<name>/world.json
node dist/src/cli.js export-game-pack fixtures/recipes/<name>.json --out <dir>
node dist/src/cli.js approve-recipe fixtures/recipes/<name>.json [--baseline]
node dist/tools/serve-viewer.js   # viewer :8787 (PC)
```
