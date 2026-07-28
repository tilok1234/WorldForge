# WorldForge — session handoff (2026-07-28, account switch #6, MERGED)

For a fresh AI session with no prior context. Read `AGENTS.md` and the
`README.md` reading list first; this file carries session state the
docs don't. File-based assistant memory at
`~/.claude/projects/C--Users-headc-Documents-WorldForge/memory/` is
machine-local and survives account switches; it cross-validates this
file. HANDOFF.md is the tiebreaker.

**The two-lane split is RESOLVED:** merge `ae924e3` brought the remote
session's settlement-style arc (behaviors 49–50, branch
`claude/worldforge-game-review-yzllne`, closed at `8f2e1bf`) into main
and the full §1a merge duty was executed on this machine: 221 tests
green, goldens drift-free, canonical verified 33893 on BOTH consumers,
the-eight-holds verified 182947 INCLUDING the Godot half the remote
container couldn't run, and the dusk pack re-exported under the v50
identity (flood unchanged 34556, audit 11, byte-stable double export).
The branch is fully absorbed; do not cherry-pick from it again.

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
- PC arcs (2026-07-28): DUSK RE-PIN (§3), behavior 47 "trails stay
  open" (§5 — three sever fixes + the loader reachability gate),
  behavior 48 zone settlement floors (§4), PACK LANE `a1304b9` Phase-A
  structures-solid stamp + `cbf11a9` moss-walks ruling (§5/§6 — pack
  walkability semantics; base artifact untouched).
- SETTLEMENT-STYLE arc (2026-07-28, remote session, merged `ae924e3`):
  behavior 49 settlement organics + variety — opt-in recipe
  `settlementStyle` = growthPermille (per-settlement size roll,
  squared; cities full / towns half / outposts never; lots + approach
  budgets scale), scatterPermille (dense core thinning to a scattered
  rim; the fabric footprint EXTENDS by the same fraction so the lot
  list redistributes outward), variety (purpose-flavored mixes; nine
  package structures newly rostered: windmill, watermill, sawmill,
  quarry, store, warehouse, guardhouse, fisher_hut, tent — all fully
  blocking, loader pass-cell parity untouched; `dock` DEFERRED:
  pass cells + waterline placement). Behavior 50 lived-in streets —
  `organicStreets`: civic specials keep solid cobble approaches,
  ordinary houses get worn packed-earth lane fragments (~450‰ of
  route cells, ~250‰ past depth 600, doorstep always marked), ~half
  the fringe houses (depth > 450) paint NO lane, yard gaps vary 1–2,
  street arms roll per-direction lengths 50–130%, deep fill houses
  humble into cottages. See §5 for the lane promise + two-tier
  entrance check this required.

Versions: behavior **55**, recipe compiler **33**, resolved-config
**27**, artifact format 8, TileForge adapter 6, packFormat 1.
**226 tests, all green on this machine** (19 in
tests/settlementStyle.test.ts). Everything pushed through the merge +
this handoff. Standing commit+push authorization (memory) — re-confirm
per policy; visual verdicts always user-gated.

## 2. The world library (fixtures/recipes/, galleries outputs/gallery/)

23 recipes, all generating clean through the behavior-47 reachability
gate. ALL APPROVED except one:

- **PENDING VERDICT (round 7): `the-eight-holds`** — now the
  settlement-style showcase (eight anchor territories, budget 8,
  settlementFloor 1 per zone, style growth 600 / scatter 450 /
  variety / organicStreets / narrowStreets): cobbled civic cores, worn barely-there
  lanes, roadless fringe houses, cottages at the edges. Flood history
  183218 (v48) → 182872 (v49) → 182947 (v50) → 182895 (v51
  narrow arms) → 182787 (v52 through-road necking) → 182916 (v53
  unpaved yards: NO building pad paints cobble — the pads were tiling
  cores into one slab; plaza stays the paved area; worn/none carves
  verify GROUND truth with ROCK closed — a route flank painted over a
  rock notch had sealed a doorstep. v54 trunk sharing: dijkstra
  discounts steps onto stamped road (roadReusePermille 600,
  style-gated) so spokes merge instead of braiding parallel lanes) →
  **182817** (v55 the street web: arms ONE-wide from the plaza edge,
  every connected house carves a SOLID one-wide lane chaining into a
  followable street tree; fringe houses still roll roadless; worn
  fragments remain the organicStreets-only look). Verified on this
  machine: 9/9 reachable, TS traverse 182817, Godot verify_world 0
  errors. KNOWN EMERGENT: dense-core lanes fuse into a paved town
  heart (houses 1-2 apart) — designer knob pending if unwanted. Round-6 sheet adds a 16px/cell city close-up
  — at map zoom dusk MUD reads like cobble; check the close-up before
  judging paving. Regenerated at
  outputs/gallery/the-eight-holds (viewer-ready); the remote session's
  verdict sheet used adaptive per-hold crops. AWAITING THE DESIGNER.
- Approved small archetypes (9): frontier-sparse, warm-vale,
  highland-fastness, sunburnt-reach, weeping-marsh, drowned-shore,
  the-old-war, the-long-winter, hearth-hollow. Tiny hollows (3):
  fen/frost/dust (frost-hollow is DESIGNED exploration-heavy).
  Organic 256² climates (3): dust-sea, drowned-fen, white-waste.
  Mediums (3) + larges (2): warm-vale/the-old-war/frontier-sparse
  -medium, warm-vale/the-old-war -large. Zone pilots: the-eight-lands
  (8 anchor zones, hard wandering seams), the-broken-isles
  (archipelago; NW island DELIBERATELY uninhabited — ferries DECIDED,
  see §6).
- Canonical `small-cold-coastal` (seed 103991): flood **33893** both
  consumers, re-verified post-merge (history: 33887 → 33890 ford
  guard → 34058 texture → 33845 ambient → 33893 behavior-47 placement
  rules; every step flagged, consumer equality never broken). FORMAL
  BASELINE recorded and STILL VALID: canonical has no zones and no
  settlementStyle, behaviors 48–50 left its normalized recipe
  byte-identical, and a settlementStyle test now PINS the recipeSha
  against the committed approval sidecar (80cff5eb…).

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
bump + the-old-war family re-verdict at that point). Recorded in
plan §6.1.

## 4. Zone vocabulary after behavior 48

`zones`: layout grid|anchors, seams blended|hard, per-entry
temperature/moisture/elevationPermille, anchors+weights, and
`settlementFloor` (0–8, default 0, OPT-IN — every pre-48 zone recipe
and deliberately wild zone generates unchanged; proven by invariant
floods on eight-lands 172389 / broken-isles 73077 / canonical 33893).
Floor phase runs right after the capital, BEFORE the geometric
reservations (authored intent outranks heuristics); the remote-quarter
reservation is room-capped (no-op for floor-free recipes). Territory =
PURE `zoneOwnerAt` (the seam wander is climate display, not identity).
Behaviors 49–50 add `settlementStyle` beside it — same opt-in
discipline (§5 identity rule).

## 5. Gotchas (this date — older ones in git history still bind)

- **Identity discipline for `settlementStyle` (LOAD-BEARING):** the
  normalized key exists ONLY when the recipe authors it — a
  style-free recipe keeps its exact pre-49 recipeSha256. A test pins
  the canonical baseline against its committed approval sidecar and
  the golden layer diff is empty against the pre-49 snapshot. Never
  "default" this key into normalization.
- **The W5 entrance check floods corridors only** — behavior 50 added
  the LANE PROMISE (BFS-verified routes recorded in laneCells; later
  structures refuse to stamp on them, farms keep fences/crops off,
  decoration keeps props off) and a second entrance-check tier: solid
  entrances must join the CORRIDOR network, worn/none entrances check
  against walkable GROUND (their lanes are deliberately gappy — a
  corridor-only flood reads them as islands; the first styled
  generation refused exactly three such doorsteps before the tier
  existed — no road never means no route).
- **Pack walkability is NO LONGER the raw loader grid** (plan §3.3):
  `buildWalkability` = loader ladder + moss-walks ruling + Phase-A
  structures-solid stamp. Naive slit sealing severs worlds — 1-wide
  UNPAVED gaps between buildings are sometimes real corridors (tiny
  lost half its map to one sealed village lane; canonical's mountain
  notches thread between mine buildings; the ruined city's streets
  are band art over bare ground, invisible to material checks).
  Hence: street/trail/pier/ford/moss guard + landmark-interior
  exemption + gate-type exemption + the connectivity reconciliation
  loop (seal → find orphans → pocket-seal building-hugging nooks ≤2
  cells out / reopen sole-corridor slits / refuse anything else).
  Pack parity = "loader grid + moss − stamp", proven by
  tests/gamepack.test.ts; base ladder and both consumer lanes
  untouched (canonical 33893 invariant).
- **Moss only grows on rock**, so it read as a wall while rendering as
  lawn. The pack's moss ruling keys on the ADAPTER's cliff
  quantization (resolved `elev`: level 0 = flat apron, no cliff face;
  ≥1 = behind terraces) — the artifact's elevation layer is the raw
  permille field and CANNOT make this distinction. buildWalkability
  therefore takes `mapData.elev`.
- **Behavior 47, three sever mechanics** (structures on trails that
  are the only corridor through a mountain notch; invisible to the
  compose gate): (1) plaza furniture never on pathLayer; (2)
  ruined-city walls BREACH where an old trail passes + stamps clear
  pathLayer under their structure cells; (3) POI furniture may cover
  a trail END but never a THROUGH-trail (≥2 footprint-boundary
  crossings refuse the spot; gates exempt via pass cells).
- **The approach carver** joins only trail segments that provably
  reach a corridor — the segment flood HOPS FORD-WIDTH stream gaps
  (≤2 river cells) — with an any-trail fallback pass. Own-stamp
  footprint cells are excluded as targets.
- **resolve-tileforge and export-game-pack GATE on destination
  reachability through the PUBLIC loader** (nudge≤8 + flood). A
  severed world cannot ship silently. Debug with ASCII walkability
  maps + a cut-finder; beware: two floods larger than the map means
  they're the same component.
- **Reservation phases must be room-capped** (behavior 48 lesson).
- Temporary debug instrumentation is fine for hunting — REMOVE before
  commit. Bump rule packs SEQUENTIALLY and check the changelog
  comment matches the table (mis-skipped twice on 2026-07-28).
- Viewer/render ladder: ≤8192px full render; >8192 adds banded
  resolved-preview.png; >16384 (large) preview-only. serve-viewer
  /api/worlds hides loader-rejected relics; native check accepts
  render OR preview.
- Overviews for verdicts: box-average downscale to ~1024; crops via
  rect extraction. Session-scratchpad tools — recreate freely.

## 6. Open items

**User-gated:**
- **the-eight-holds round-3 verdict** (§2) — the settlement-style
  showcase is regenerated, verified on both consumers, and
  viewer-ready. The one open visual.
- **Slit-seal vs flat-green readability COLLISION** (needs a designer
  ruling): the annotated inter-house gaps in the start town (region
  208-248 x 126-148) contain ZERO moss — they are the 13 grass-like
  slit cells the Phase-A stamp sealed, i.e. the porous-collision fix
  and "flat green must walk" want opposite things on those exact
  cells. Options: keep seals (current state) / reopen flat-green
  slits (one-line keep-open change, sprite bug returns) / TileForge
  blocked-ground dressing art (fixes both, upstream task).
- **TileForge upstream asks (user-side, per AGENTS.md), recorded:**
  chapel (2×3) is the only church-type art — larger temple/church
  needs a new package structure; roof-ridge/chimney occlusion needs a
  per-cell overhang-row template field (plan §3.3a); optional live
  ruined-road band (§3 upgrade path); dock structure with pass cells
  (behavior-49 deferral).
- Windowed Godot playthrough; taste-polish round; fen swamp-margin
  widening (walkability care needed).

**Engine-ready when wanted:**
- **Ferry routing (DECIDED 2026-07-28: ferries, "for now")** — piers
  on facing shores joined by a water route the loader treats as a
  legal crossing; unblocks inhabited detached islands (broken-isles
  NW island is the pilot). Causeways/per-island webs rejected; "for
  now" = revisit allowed after Phase 5 shows game needs. New behavior
  + loader/consumer parity work when scheduled.
- Zone-crop preview tooling (per-zone verdict loop QoL) — last
  unbuilt zone-arc line item.

**Game integration (docs/GAME_INTEGRATION_PLAN.md):**
- Phase 4 validating importer LIVE game-side (validates the reference
  pack in 0.57 s, independently reproduces the flood; contract-as-built
  clarifications in plan §3.3a). Rendering half deferred post-Gate-1.
- Dusk game pack at `outputs/game-packs/small-cold-coastal-pack-dusk/`
  RE-EXPORTED post-merge under the v50 identity — READY FOR HANDOVER
  to `assets/worldforge-packs/`. Phase-A stamp + moss ruling
  (plan §3.3): footprints seal doors-too, unpaved slits/pockets
  close, level-0 moss carpet walks (626 cells; 148 enclaves; +366
  reconnected wilderness cells). Pack flood **34556** (base 33893);
  porosity audits read 11 walkable structure tiles, not 0 (9 bridges
  + 2 ruined-city breaches — legitimate, plan §3.3a); byte-stable
  double export re-proven post-merge.
- Phase 5 slice-zone drafting: fully unblocked; needs the user's
  creative direction.

## 7. Working agreements (unchanged core)

- Loop: implement → `npm test` + `node dist/tools/update-golden.js` →
  verify chain (godot-consumer 0 errors + TS traverse, floods EQUAL)
  on canonical + touched worlds → overviews → SendUserFile → verdict.
- Density doctrine: never raise dense-tier ambient/POI numbers without
  a fresh verdict; structural density scales with map size, per-cell
  props/POIs fall.
- Versioning: behavior bump + touched packs; config-shape changes bump
  resolvedConfigFormat + compiler + literal in tests/compile.test.ts
  (currently 27).
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
  own; regenerate into the same dir and refresh.

## 8. Commands

```
npm test                          # build + 226 tests
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
