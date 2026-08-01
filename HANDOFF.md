# WorldForge — session handoff (2026-08-01 later: walkable-woods PARKED unreleased — sl-0075 closed superseded; b77 remains the released truth)

> **RESUME HERE. THE WILDSHOT OVERWORLD REMAINS RELEASED AND INTAKEN
> AT wildshot-overworld-pack-dusk@b77** (delivery sl-0066 executed by
> the game as intake sl-0067; sourceCommit 1a20bd2, manifestSha
> 5166341a…, zipSha c9083012…, pack flood 46493, spawn [109,182]).
> Behavior is **77**; THE NUMBER 78 IS FREE — nothing new is
> released, and the generator output is BYTE-IDENTICAL to the b77
> commit (goldens diff-empty; canonical/eight-holds/wildshot
> galleries regenerated and hash-equal to their b77 renders; wildshot
> world flood back at 46391 both consumers).
>
> THE PARKED ROUND (this session): the designer's b77 walk escalated
> the pinch finding to region scale (sl-0072 diagnosis: 1,143
> on-flood prop pinches, ALL shortcut-denials; then sl-0075 WALKABLE
> WOODS — "whole tree bands are walls"). A full re-spacing pass was
> BUILT AND VALIDATED: 8-connected governed clusters ≤ 2, orthogonal
> pairs only, relocation-never-deletion with understory swaps,
> terrain-standing props exempt as barrier-class, authored work
> untouchable; per-species counts byte-equal, tree walls up to 1,005
> cells dissolved, game diag_pinch census 1143 → 258 on-flood (wild
> 811 → 169), floods +1.2-3.8k with pockets typed, TS=Godot, renders
> designer-APPROVED ("go")… and then PLANNING SUPERSEDED THE ROUND
> MINUTES LATER: **composition is art direction and ships as
> authored; the navigation fix moved game-side (art-matched prop
> collision, sl-0078). sl-0075 closed superseded — parked UNRELEASED
> on planning's instruction, no delivery line** (nothing was ever
> published: the only export was a scratch dev preview). The pass is
> ARCHIVED DORMANT at src/decoration/respace.ts — designer-opt-in
> art-tooling candidate, exercised by tests/walkableWoods.test.ts via
> direct invocation, deliberately NOT called from composeWorld;
> wiring it back is a designer decision, never a refactor. Kept
> plumbing (generation-inert): decorate's wildernessProps
> provenance mask + protectedCells/fordCells exports, pois/override
> mask clears. GENERATION_RULES records the art-direction ruling.
> 260 tests green.
>
> B77 CONTEXT THAT STILL BINDS: carpet/canopy/solid classes
> (sl-0063; four carpet conversions vs package flags — stump,
> fallen_log, bone_pile, loot_pile; five parity surfaces pinned by
> tests/propWalkability.test.ts); the game renders props-overhang
> ABOVE the player (verified at the sl-0067 intake); flood history
> canonical 33386 → 34387, eight-holds 182666 → 188355, wildshot
> 45063 → 46391 (pack 46493), every cell typed in the b77 commit.
>
> OPEN, in rough order: (1) NAVIGATION IS GAME-SIDE NOW — sl-0078
> art-matched prop collision (their lane; no WF work unless an ask
> routes); (2) world_filler re-pin (sl-0041 in flight); (3)
> route-hierarchy round for types 5-8 (designer-designed, when
> wanted); (4) tops+ramps contract ruling (designer clock); (5)
> plaza cobble keep/convert parks; (6) landmark-centerpiece guard
> (task chip); scenery loop resumable; farm-more levers recorded;
> sl-0065 dev map overlay is GAME-side only. NO sync-log append this
> session (park = no cross-repo event from WF; planning sweeps the
> sl-0075 closure and sl-0078 themselves). Viewer :8787 serves b77
> galleries — all three regenerated worlds verified hash-identical
> to the b77 release state.

> **ECOSYSTEM POINTER (2026-07-29, designer-accepted doc 16).** This
> repo is one of seven in the Wildshot project (it generates worlds the
> game and world_filler consume). The shared map — what each repo owns,
> its authority docs, and the hard cross-repo rules — lives at
> `Wildshot_adventure_final_planning/docs/16-ECOSYSTEM_MAP.md`.
> Read your repo's row before working here.

> **SYNC-LOG HOOK (doc 18, ACCEPTED 2026-07-30).** At session end, with
> the handoff update, append a line to planning `tools/sync_log.json`
> for every cross-repo event this session caused (pack delivered or
> intaken, ask opened/resolved, incident, pin change). No event, no
> entry. Protocol: planning `docs/18-AGENT_SYNC_PROTOCOL.md`.

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
- PC arcs (2026-07-28/29): DUSK RE-PIN (§3), behavior 47 "trails stay
  open" (§5 — three sever fixes + the loader reachability gate),
  behavior 48 zone settlement floors (§4), PACK LANE — `a1304b9`
  Phase-A stamp + `cbf11a9` moss-walks ruling, both now folded into
  the 2026-07-29 WYSIWYG ruling `91d1fa9` (§2/§5/§6 — pack
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
- DOC 18 PUBLISH LANE (2026-07-30, planning ruling ratified same day):
  the §4 delivery duties are implemented. `src/gamepack/publish.ts` —
  the gate (`git status --porcelain` empty AND `git branch -r
  --contains HEAD` non-empty; any git failure refuses, never a silent
  pass), release identity (`<world>-pack-<theme>@b<NN>`, matching the
  sync-log artifact-id convention), notes with parseable
  sourceCommit/sha256 lines, and an idempotent NON-OVERWRITING gh
  publish (existing tag + identical manifestSha256 = verified-existing;
  existing tag + different bytes = hard refusal). `src/gamepack/zip.ts`
  — deterministic store-only zip (sorted entries, fixed 1980 DOS
  timestamps, canonical-bytes pin in tests). CLI: gate runs BEFORE any
  generation; `--allow-dirty` is a loud dev-only bypass that DISABLES
  the release; `--no-release` skips upload (tests pass BOTH so a clean
  tree never publishes from `npm test`). VERIFIED PREMISE (§4.2): the
  pack manifest embeds content hashes everywhere but deliberately NO
  sourceCommit (byte-stable re-export doctrine); the commit binds via
  the release tag target + notes instead — deviation reported honestly
  in sync-log sl-0015. Dirty-tree refusal exercised for real; gh
  keyring verified (tilok1234, repo scope). A clean-tree verification
  export then ran WITHOUT --no-release by mistake and published
  small-cold-coastal-pack-dusk@b65 — incident sl-0016, RESOLVED KEEP
  (designer 2026-07-30): blessed as the sl-0004 delivery transport
  (see pointer block).

Versions (2026-08-01 close): behavior **77** (prop walkability
classes), recipe compiler **35**, resolved-config **29**, artifact
format 8, TileForge adapter **9**, packFormat 1, routes.graph **19**,
settlements.plans **32**, decoration.pois 19, decoration.props **17**
(unused props still FOUR: abandonedwagon, leafpile, palm, rubblepile).
Path-layer vocabulary 0..3 (1 trail / 2 road / 3 street). Pinned
package dusk-9b8b2a2-seed103991 (roadTypes 1-8 + roadjoint; types 5-8
unused pending their round). **257 tests, all green on this machine.**
Everything pushed through the b76 handoff commit. Standing commit+push
authorization (memory) — re-confirm per policy; visual verdicts always
user-gated. THE SCENERY LOOP IS THE ACTIVE ARC: the pack assessment +
composition catalog live at docs/SCENERY_COMPOSITIONS.md (28 ideas,
per-composition placement doctrine recorded as each ships; batches 1
and 2 = behaviors 61-62 SHIPPED); the designer is doing a parallel
pass and merges into §3/§4. Batch 3 candidates: harbor row (boats/
bollards/crates at the b60 docks), chicken run / vineyard, logging
camp / battlefield-with-blood.

## 2. The world library (fixtures/recipes/, galleries outputs/gallery/)

23 recipes, all generating clean through the behavior-47 reachability
gate. ALL APPROVED except one:

- **PENDING VERDICT (round 11): `the-eight-holds`** — now the
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
  errors. v56 LINE ROADS (183065): the round-7 screenshot settled that the
  miss was the RENDERER — cobble blob-rendering reads 2-3 wide however
  few cells; the one-tile look is the PATH BAND. Under narrowStreets
  all in-settlement roads draw as band lines over natural ground
  (arms, ring, house lanes, in-bounds through-route via
  corridorCenterPrev); plaza stays paved; band cells ride pathLayer so
  every trail protection applies natively; dense-core fusion gone.
  A/B RULED: band lines ("ye these works better"), then the weight
  three-way RULED: the heavier "road" band. v57 city-lane band: path
  layer value 2 = in-settlement lane -> adapter renders the package
  road band (adapter.tileforge 7; scoped un-retirement, archaeology
  precedent); wilderness trails keep 1/dirtpath; all readers
  value-agnostic; styled parity case proves both ladders agree; flood
  183065 (art-only vs round 8); pack re-exported behavior 57/adapter
  7 flood 34556. UPSTREAM ASK ADDED: improved road-band art
  (designer-planned) -> plain re-pin when it ships. v58 URBAN BLOCKS
  (round-9 "suburbs not cities"): urbanBlocks style flag — city core
  (depth<=350) packs zero-gap attached rows, core cottages upgrade to
  houses; compiler corrected 32->34 (33 = the late b54 shape bump).
  Round 10 flood 182705. v59 CITY QUARTERS (round-10 clarification: "suburbs" = monotony, no
  "open spots and markets and churches and graveyards"): urbanBlocks
  REPURPOSED — b58 attached rows reverted; the flag reserves quarter
  squares (market + stall row + well; church close + gravestone yard,
  sequence chapel stands down; greens w/ birch + flower beds). Cities
  market+church+2 greens, towns market+church. Furniture verifies its
  lane (double budget) and rolls back; an unconnectable square
  UNCLAIMS (no dead patches). Round 11 flood 183185. v60 HARBOR DOCKS
  (round 12, commit `9d5e858`, the behavior-49 deferral un-deferred):
  harbor settlements place waterfront docks — 3x2 boathouse (dusk
  "dock" family, hoist on the roof), deck row over ANY water kind
  (shallow band is often one cell), shore row fronting a carved lane;
  cities budget 2, towns 1, manhattan >= 6 spacing, full rollback when
  the lane cannot connect. Placement runs BEFORE the quarters (squares
  must not claim the waterline) and the lane budget is
  max(approachBudget*2, radius*4) — the flat budget exhausted 40 cells
  short of the shore and placed ZERO docks on the first cut (the BFS
  pop cap maxLength*8 must cover the rim). structure.dock: pass cells
  [0,1,3,4,5] (top-right hoist post blocks), STRUCTURE_TYPES append,
  adapter name "dock", settlements.plans 22. Eight-holds round 12
  flood **183201**, two docks at (467,224)/(451,211), 9/9, Godot
  tileset 0 errors; canonical 33893 invariant (variety-free = no
  docks). OPEN LEVER: city WALLS + gates (package wall families; b47
  machinery ready).
- WYSIWYG WALKABILITY (2026-07-29, designer ruling,
  screenshot-confirmed; commit `91d1fa9` — SUPERSEDES the two-wide
  rule AND the slit-seal campaigns): every cell rendering as plain
  ground (grass, cobble, dirt, moss carpet, path bands) WALKS in the
  pack; every walkable cell renders as ground or a designed walkway.
  KEPT: the a1304b9 art-outline core — footprints stamp solid MINUS
  the type's pass cells (loader STRUCTURE_PASS_CELLS, now exported);
  houses have no pass cells so doors stay solid. REVERTED: slit +
  back-pocket seals, connectivity reconciliation, the two-wide rule
  and its audit (123 canonical seals reopened; sealed POI entrances —
  cave mouths, dens, crypts, mine shafts — have doors again). Cut-off
  ground pockets stay walkable-but-unreachable (islands, not seals).
  NEW hard gate: pack bits must equal the WYSIWYG recompute BOTH
  directions; deliberate deviations live in WYSIWYG_EXCEPTIONS (each
  entry a recorded designer ruling; ships EMPTY). Context: the sprite
  overdraw that motivated sealing is fixed game-side via y-sorted
  rendering — not our problem anymore. Dusk pack flood 34433 ->
  **34739**, spawn (240,125); 481 one-wide inter-house strips walk
  (474 reachable, 7 courtyard islands); game porosity audits
  RE-BASELINE (canonical: 36 walkable structure-layer cells, all
  pass openings, plus their 9 bridges + 2 breaches). Acceptance =
  the designer walks the screenshot grass strip between the two
  houses, straight down, no stops. ROUND 12 RULED "yep very nice"
  (docks ratified); the loop moved on to scenery compositions.
- LIVED-IN DRESSING (behavior 61, round 13, commit `db9e113`; batch 1
  of docs/SCENERY_COMPOSITIONS.md): nine furniture species roster in
  (lamp/barrels/bench/noticeboard/table_chairs/anvil/workbench/
  laundry_line/baskets, all blocking). Smithy + tavern YARDS dress
  their perimeters (clockwise ring from past the entrance, doorway
  kept clear; default-on), market quarters gain frame-corner extras
  (rides urbanBlocks), city-lane bands seat spaced LAMPS (CITY_LANE
  only — trails never lamp, style-free untouched; cities 10 / towns 4
  / outposts dark). All offsets deterministic, no new channels.
  Canonical 33893 -> 33795 (flagged, -98 furniture cells); eight-holds
  round 13 flood 182939, 9/9, Godot 0 errors, 66 lamps; dusk pack
  re-exported flood 34641. The dusk LOOK lands: glowing lamp rows in
  the snow. ROUND 13 RULED "looks better now".
- CITY WALLS (behavior 62, round 14, commit `4197571`; batch 2):
  opt-in settlementStyle.cityWalls (compiler 35, resolved-config 29,
  settlements.plans 23; eight-holds opts IN). Cities ring their
  street web with fortress_wall cells; NEW structure.city_gate (the
  package's pristine 3x2 gatehouse, arch pass [1,4], adapter name
  "gate") seats on N/S through-streets. Radius chosen to MAXIMIZE
  fittable gatehouses (>=3 sides street-crossed); every street
  crossing is an opening (b47 outranks); water/river/rock break the
  circuit; scatter houses outside = suburbs. E/W crossings stay
  plain openings — NO vertical gate art in the package (upstream ask
  recorded in the catalog). PLACEMENT LESSONS (4 iterations): extent
  ring = sealed wall with no doors; centered-only gates = zero in
  dense fabric; exact-column through-checks miss organic jogs (use a
  3-wide window); score radii BY fittable gates. Round 14 flood
  182844, 9/9, Godot 0; harbor city N+S gates, crossing city S gate.
  Regenerated at outputs/gallery/the-eight-holds (viewer-ready).
  ROUND 14 RULED "looks much better now!" — walls ratified; the
  crossing city's more fragmentary wall (lake breaks, house-plugged
  ring cells) passed without comment. NOTE: the eight-holds has now
  taken THREE consecutive positive verdicts (12/13/14) but no formal
  approve-recipe baseline — deliberate: the scenery loop keeps
  changing its recipeSha (b62 opted it into cityWalls). Record the
  baseline only when the designer calls the world DONE.
- HARBOR ROW (behavior 63, round 15, commit `68d66c7`; batch 3 —
  picked in-session over chicken run/vineyard/logging camp/
  battlefield): both eight-holds docks dressed (fishingboat moored
  beside each deck, bollards + crates/fishnets on the shore rows);
  the harbor city's 3-cell pier is stone jetty now. Round 15 flood
  **182839** (−5 = the new blocking shore clutter), 9/9, Godot 0.
  New test pins the seed-2 fixture (city dock dressed + wood AND
  jetty piers in one world). ROUND 15 RULED "it looks very good".
- CHICKEN RUN + VINEYARD (behavior 64, round 16, commit `7503b5a`;
  batch 4): farming settlements pen a 3x2 chicken run (coop + trough,
  gate faces the farm; strict fit — weeping-marsh's cramped farm goes
  without, by design); grapes join the crop roll at temperature
  offset >= +40 and ring in plain wood. Showcases: dust-sea farmstead
  (vineyard + run + pumpkin plot in one frame, full 32px render),
  warm-vale-large (8 runs, 79 grape cells, floods 646392 equal, Godot
  0). Canonical AND eight-holds byte-invariant (no farming
  settlements — see the RESUME note). ROUND 16 RULED "very good".
- MANOR GARDENS (behavior 65, round 17, commit `719d167`; batch 5,
  proceeded on "lets do next"): city greens hedge-wall themselves
  (fence.hedge, FENCE_TYPES 4) and dress formal — topiary corners,
  center sundial, beds where hedge stands behind them, urns flanking
  a carved gate (farms records gates in FarmResult.gardens, like
  pens). Streets break the ring (b47 outranks); the b59 birch green
  retires. Eight-holds round 17 flood 182737 (−102: four walled
  gardens across its two cities), 9/9, Godot 0; canonical 33795
  invariant; pack 34641 byte-stable. The dusk hedge art is BRIGHT
  teal — pops against both grass tints; round 17 passed it without
  comment. ROUND 17 RULED "looks good". NOTE: the eight-holds now
  carries SIX consecutive positive verdicts (12-17) and still no
  formal approve-recipe baseline — deliberate: the scenery loop
  keeps changing its recipeSha. Record the baseline only when the
  designer calls the world DONE.
- GATE GUARD POSTS (behavior 66, round 18, commit `1dc16a2`; batch 6,
  pick delegated to the session): every b62 gatehouse dresses its
  garrison — brazier pair just inside flanking the through-street,
  ONE banner over the approach (west tower first, east fallback),
  archery target in the tower nook. All seats pathLayer-checked +
  yard-guarded (lanes/entrance halos ride protectedCells); occupied
  spots SKIPPED, never hunted. Eight-holds round 18 flood **182730**
  (−7 = 3+3+1 seated: harbor gates full trio minus one refused
  brazier each, the crossing gate banner-only inside its dense street
  web — verified cell-by-cell, every refusal a guard), 9/9, Godot 0;
  canonical 33795 INVARIANT (rides city_gate existence; style-free
  untouched by construction). New test pins small seed-24 (two gates,
  full trio on both). No pack re-export — pack content untouched; the
  b65 release stays the blessed delivery. OPEN LEVERS: bridge-end
  posts, the seated guardhouse structure. ROUND 18 RULED positive
  2026-07-30 ("and yeah this is starting to get good! approved") —
  the SEVENTH straight positive round. Same exchange set a standing
  communication habit: every session report ends with a brief TL;DR
  (recorded in assistant memory).
- ORCHARDS (behavior 67, round 19, commit `72c5ef0`; batch 7,
  settlements.plans 27): the farm-extension lane again — one fenced
  six-tree stand per lane-accessible farming settlement (fence.wood
  ring, two-cell gate facing the farm, beehive + baskets; farms plans
  via OrchardPlan, decoration seats — the pen pattern). TWO
  MACHINERY LESSONS, both built in as guarantees: (1) ACCESS — the
  gate apron must touch the lane/path network (cheb <= 1); the first
  cut seated a stand in a woods hole and ambient forest sealed it
  (27 walkable interior cells, 0 reachable — found by probing
  reachability per stand, not by any gate: interiors are not
  destinations). (2) PROTECTED GROUND — the envelope + apron join
  protectedCells like quarters; character zones OVERRIDE ambient
  outright (decorate.ts ~line 900) and chewed four planted trees on
  the first cut. Roll-free placement (no channel draws) so all
  pre-67 rolls byte-identical; laneless synthetic in the b64 test
  keeps wood vineyard-exclusive there. Showcases: dust-sea farm
  context (pen + plots + vineyard + orchard one frame), warm-vale
  16px. Every placed stand probe-verified complete/stray-free/
  reachable across four farm worlds. Floods above in the pointer.
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

[HISTORICAL — the pin has since moved twice through the same
deliberate-adoption lane: dusk-e2699cc (b75, street band) then
`dusk-9b8b2a2-seed103991` (b76, road joints — CURRENT; the lock is the
authority). This section records the FIRST dusk adoption.]

Pinned package then: `dusk-ae1eecb-seed103991` (user: "use dusk for now, we
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
- **Pack walkability is NO LONGER the raw loader grid** (plan §3.3,
  WYSIWYG era): `buildWalkability` = loader ladder + moss-walks
  ruling + art-outline stamp (footprints minus pass cells), and
  NOTHING else — the slit/pocket/thread seal machinery and its
  connectivity reconciliation are GONE (2026-07-29 ruling; the
  history of why sealing kept severing worlds lives in git and plan
  §3.3). The WYSIWYG gate refuses any export where pack bits diverge
  from that recompute in either direction; add a deliberate deviation
  ONLY as a WYSIWYG_EXCEPTIONS entry carrying its designer ruling.
  Do NOT reintroduce seal campaigns — that whole arc ended with
  "what you see is where you can walk."
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
- **Fences block like they render (b68):** fence stamps never land on
  path cells (a pre-existing trail crossing a planned ring IS its
  gate), and the b21 spur carver treats fenceLayer as blocked — a
  spur leaves a fenced yard through the gate or not at all. The
  round-19 flagged enclosure was a graveyard whose spur predated
  both rules and pierced the iron ring.
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

[THE POINTER AT THE TOP IS THE CURRENT OPEN LIST — this section keeps
the older per-arc detail; where they disagree, the pointer wins.]

**User-gated:**
- **SCENERY LOOP (paused at ELEVEN ratified compositions, rounds
  12-22)** — resumable any time. Remaining catalog leaders
  (docs/SCENERY_COMPOSITIONS.md §3): battlefield blood decal (tone
  question §4), boardwalk / seawall / windmill hill / processional
  way; levers: bridge-end posts, fenced-POI spur budget. Unused props
  down to FOUR (abandonedwagon, leafpile, palm, rubblepile).

- ~~Slit-seal vs flat-green readability collision~~ **RESOLVED by the
  WYSIWYG ruling (2026-07-29, §2):** the designer ruled for flat-green
  — every ground-rendering cell reopened; the sprite-overdraw bug the
  seals worked around is fixed game-side by y-sorted rendering.
- **TileForge upstream asks (user-side, per AGENTS.md), recorded:**
  chapel (2×3) is the only church-type art — larger temple/church
  needs a new package structure; roof-ridge/chimney occlusion needs a
  per-cell overhang-row template field (plan §3.3a); optional live
  ruined-road band (§3 upgrade path); improved road-band art
  (designer-planned; plain re-pin when it ships); OPTIONAL open-plank
  pier variant for the dock (behavior 60 ships the boathouse art —
  reads fine, but the designer may want a walk-out pier later).
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
  RE-EXPORTED 2026-07-29 under the behavior-63 identity (flood 34641
  unchanged; canonical's city-harbor pier renders stone jetty now,
  art-only) — READY FOR HANDOVER to `assets/worldforge-packs/`.
  (Doc 18 update 2026-07-30: the staging manifest on disk says
  behaviorVersion 65, not 63 — the round-16/17 byte-stable
  re-verifications refreshed the identity; the "b63" labels here and
  in sync-log sl-0004 are stale. RULED KEEP, sl-0016 resolved: the
  release small-cold-coastal-pack-dusk@b65 — byte-identical to this
  staging dir — is the BLESSED transport for this delivery; the game
  intakes by tag + hash-verify against the release notes rather than
  directory copy.) WYSIWYG semantics
  (plan §3.3): art-outline stamp (footprints minus pass cells; house
  doors solid), level-0 moss carpet walks, NOTHING else seals — slits,
  pockets, and the two-wide seals all reopened. Pack flood **34641**
  (base 33795 at b61; the WYSIWYG-only flood was 34739 before the
  lived-in furniture claimed 98 ground cells; spawn (240,125));
  porosity audits re-baseline per plan §3.3a (canonical: 36 walkable
  structure-layer cells = pass-cell openings; bridges/breaches under
  their own classification). The game re-runs its intake battery;
  acceptance = the designer walks the screenshot grass strip between
  the two houses.
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
  DECAL_TYPES, POI_TYPES. Parity (behavior 77): decorate
  PROP_WALKABILITY is the truth table — loader BLOCKING_PROPS = its
  non-carpet classes, the Godot world.gd CARPET_PROPS override and the
  parity-test ladder mirror the four carpet conversions
  (tests/propWalkability.test.ts pins all of it); loader
  STRUCTURE_PASS_CELLS mirrors the package manifest; package walkable
  flags are truth EXCEPT the pinned sl-0063 carpet conversions (stump,
  fallen_log, bone_pile, loot_pile — extending that list is a new
  designer ruling, never a refactor). Placement guards stay frozen at
  the b76 roster (PLACEMENT_GUARDED in decorate).
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
npm test                          # build + 257 tests
node dist/tools/update-golden.js
node dist/src/cli.js resolve-tileforge fixtures/recipes/<name>.json --out outputs/gallery/<name>
node --max-old-space-size=8192 dist/src/cli.js resolve-tileforge fixtures/recipes/<medium-or-large>.json --out outputs/gallery/<name>
node dist/tools/godot-consumer.js --world outputs/gallery/<name>
node consumers/typescript/traverse.mjs outputs/gallery/<name>/world.json
node dist/src/cli.js export-game-pack fixtures/recipes/<name>.json --out <dir>
                                  # doc 18 publish-gated: clean PUSHED tree required, then
                                  # auto-publishes the GitHub release (dev: --allow-dirty --no-release)
node dist/src/cli.js approve-recipe fixtures/recipes/<name>.json --baseline
node dist/tools/serve-viewer.js   # viewer :8787 (if not already up)
godot --path consumers/godot
```
