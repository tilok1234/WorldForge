# WorldForge — handoff (2026-07-28, post-merge at PC)

## 0. DUSK RE-PIN executed 2026-07-28 (newest state)

Pinned package is now `dusk-ae1eecb-seed103991` (game plan §6.1;
designer: "use dusk for now, we can change later"). Forest fixture
stays committed — re-pin back = lock + test-literal change. Facts:
dusk is a NEWER upstream commit (ae1eecb): road bands 1/3 retired as
`roadTypesLegacy` (matches our corridor doctrine; dirtpath is the one
live band); semantic ids identical across themes, so ALL world content
is byte-identical — canonical flood 33845 invariant, §2/§4 acceptance
green against dusk's own reference, 202 tests green. Canonical
baseline RE-RECORDED under the dusk identity. Game-side Phase 4
validating importer is LIVE (validates the reference pack in 0.57 s,
independently reproduces flood 33845); contract-as-built
clarifications recorded in GAME_INTEGRATION_PLAN §3.3a. OPEN designer
ruling: ruined-city dead streets author the legacy ruined-road band
(renders fine under dusk; guide says never author new legacy runs —
bless as archaeology or re-express as materials+rubble). Galleries
regenerate in dusk on demand; overviews for verdicts unchanged in
workflow.

MERGE COMPLETE 2026-07-28: main fast-forwarded to the mobile branch
(d840a4e) and pushed; 202 tests green on the PC; update-golden a no-op;
canonical chain reproduced the container numbers exactly (flood 33845
both consumers, 0 errors); the-broken-isles regenerated locally and
verified (flood 73008) then APPROVED. Section 1 below is kept for the
record but is DONE. `AGENTS.md` and the `README.md` reading list still
apply. HANDOFF.md is the tiebreaker over machine-local assistant
memory.

## 1. Merge instructions (COMPLETED 2026-07-28 — kept for the record)

Everything from the mobile session lives on ONE branch, fully pushed:

    claude/world-forge-mobile-eiqrr3

`main` already contains the game-integration-plan merge (done early in
the session, explicitly authorized); the branch contains `main`, so the
merge is a clean fast-forward:

    git fetch origin
    git checkout main
    git merge --ff-only origin/claude/world-forge-mobile-eiqrr3
    git push origin main

Then, because `outputs/` is gitignored and this container's galleries
die with it:

    npm install && npm test          # expect 202 tests, 0 failures
    node dist/tools/update-golden.js # should be a no-op after merge
    # regenerate whatever galleries you want to view locally, e.g.:
    node dist/src/cli.js resolve-tileforge fixtures/recipes/small-cold-coastal.json --out outputs/gallery/small-cold-coastal
    node dist/tools/godot-consumer.js --world outputs/gallery/small-cold-coastal
    node consumers/typescript/traverse.mjs outputs/gallery/small-cold-coastal/world.json
    # canonical expectation: BOTH consumers flood 33845, Godot 0 errors

The full verify chain ran green in the container at every behavior
(Godot 4.6.2 official build was downloaded into the container for it),
but re-running the canonical chain on your machine is the honest
cross-check of the merge.

## 2. What the mobile session shipped (behaviors 37–46)

Ten behaviors, all tested, all verdict-ratified except where noted:

- **37 — settlement pins** (routes.graph 13): recipes gain a
  rank-ordered `settlements` array of `at`/`near` constraints; pin
  order = rank, first pin is the capital (designer-ratified). Named
  errors, never relocation.
- **38 — explicit ranks** (routes.graph 14): optional `rank` per entry
  claims any budget slot, so a village can be pinned while the capital
  stays free-competed. Rank permutation is identity for 37-style pins.
- **39 — terrain texture** (terrain.texture 1): interior mottling
  (mud→grass tussocks, grass→parched, dry→gravel hardpan, snow→scree)
  + edge dithering between ground materials. Runs after all structural
  passes, before decoration; walkability-neutral; confetti sweep.
  Swamp widening deliberately EXCLUDED (swamp blocks movement).
- **40 — size-scaled POI spacing** (decoration.pois 13): the flat
  14-cell spacing starved tiny worlds to ~6 POIs; tiny now 7.
- **41 — wilderness variety** (decoration.props 10, decoration.pois
  14): rare species accents in every biome table; two lone-building
  POI kinds append-only: `poi.abandoned_homestead` (grass/dry/mud),
  `poi.lone_cottage` (grass), cap 2 each, block fully like ruins.
- **42 — snowed-in homesteads** (decoration.pois 15): homestead
  accepts snow.
- **43 — zone composition, step 1** (macro.fields 7): recipes gain
  `zones` — per-zone climate character as ADDITIVE temp/moisture
  offsets; seam modes `blended` (12-cell box-blur gradient) and `hard`.
  Approach C of docs/ZONE_COMPOSITION_ASSESSMENT.md (ratified).
- **44 — wandering hard seams** (macro.fields 8): hard borders stay
  sharp but meander (two-octave fbm warp up to 10 cells + 2-cell
  settle blur). Verdict path: ruler-straight hard was "way too hard".
- **45 — anchor-shaped zones** (macro.fields 9): `layout: "anchors"` —
  per-zone anchor cell + territory weight, weighted-nearest-anchor
  territories instead of grid squares. Grid stays the default.
  Verdict: "last pic looks best, awesome".
- **46 — zone elevation** (macro.fields 10): zone entries gain
  `elevationPermille` — negative drowns a zone to sea (channels, bays,
  islands), positive raises highland. Sea level stays world-global;
  elevation ALWAYS blends at borders (coasts shelve); wander first so
  coastlines meander. **VERDICT OPEN on the-broken-isles.**

Plus, ratified along the way: hollows organic passes, the organic
256² climate worlds, and a full library refresh (all below).

## 3. Versions after the session

behavior 46 · recipe compiler 28 · resolvedConfigFormat 22 · artifact
format 8 · macro.fields 10 · routes.graph 14 · terrain.texture 1 ·
decoration.props 10 · decoration.pois 15 · adapter.tileforge 6.
202 tests, all green. Canonical baseline
(`fixtures/recipes/small-cold-coastal.json.approval.json`) re-recorded
at the behavior-46 identity; canonical layers are byte-identical since
behavior 42 (flood 33845 — zone behaviors change zone-free layers only
through version stamps).

## 4. The world library (all in fixtures/recipes/)

**Approved this session** (visual verdicts on the phone viewer):
- Three tiny climate hollows with organic passes: `fen-hollow` (20033,
  v3), `frost-hollow` (20113, v2 — DESIGN NOTE: intended as an
  exploration-heavy map; bias tuning toward discoveries there),
  `dust-hollow` (20093, v2).
- Organic 256² climate worlds: `dust-sea`, `drowned-fen`,
  `white-waste` (richened budgets + dense + cover 550).
- Library refresh: all 14 pre-existing worlds regenerated under the
  organic stack with RECIPES UNTOUCHED (archetype identity preserved
  per the density doctrine) — approved wholesale.
- `the-eight-lands` (medium, seed 80808): the zone-composition pilot,
  now 8 ANCHOR-SHAPED zones with hard wandering seams. Approved.

- `the-broken-isles` (medium, seed 90909): archipelago pilot — two sea
  zones carve a west channel + south bay, NW island wild/uninhabited,
  mainland + peninsula carry all 10 near-pinned settlements and 6
  near-pinned landmarks (flood 73008, generation clean). APPROVED
  2026-07-28 at the PC ("i think this works tbh") after the merge
  verification reproduced the container numbers exactly. Zone arc
  behaviors 43-46 are now fully verdict-ratified.

**Mobile viewer artifact** (pan/zoom, phone-friendly; hollows + Eight
Lands + Broken Isles):
https://claude.ai/code/artifact/7850ac94-e0e9-466a-8ffc-4bee23adeff3
Rebuild script: scratchpad `build-viewer.mjs` (container-local — it
inlines gallery renders as data URIs; recreate from any session).

## 5. Open decisions and next steps

**Zone arc (docs/ZONE_COMPOSITION_ASSESSMENT.md, ratified, open):**
- Zone-scoped settlement floors: guarantee each zone ≥1 settlement
  (generalize sector floors to zone territories).
- Zone-crop preview tooling for the per-zone verdict loop.
- **Multi-component routing — OPEN DECISION.** Routes and reachability
  validators assume ONE connected landmass. Island worlds currently
  require inhabited land to stay connected (peninsulas/isthmuses);
  true detached islands are safe only uninhabited. Inhabited islands
  need per-component route webs, causeways, or ferries — a designer
  decision before an engine behavior.
- Island authoring recipe (proven on broken-isles): generate BARE
  (no pins) first, eyeball the landmass render, then place near-pins
  on real land. Named errors catch every miss.

**Game integration plan (docs/GAME_INTEGRATION_PLAN.md):**
- Phase 4 (worldforge_importer addon in the game repo): post-Gate-1,
  needs the game repo explicitly scoped writable.
- Dusk package export from TileForge (designer-side) → theme re-pin.
- Phase 5 slice-zone drafting: now effectively superseded-and-expanded
  by the zone arc; reconcile the plan text when Phase 4 starts.

**Parked (user-gated):** windowed Godot playthrough; taste-polish
round; fen swamp-margin widening (needs walkability care).

## 6. Standing doctrine (unchanged, still binding)

- **Density doctrine:** never raise dense-tier ambient/POI numbers
  without a fresh verdict. Structural density (settlements, roads,
  floors) scales with map size; per-cell props/POIs fall as maps grow.
- **Loop:** implement → `npm test` + update-golden → verify chain →
  overviews → verdict → iterate. Verify chain on EVERY generation
  change: godot-consumer (0 errors) + TS traverse, floods EQUAL.
- **Versioning:** behavior bump + touched rule packs, sequential;
  config-shape changes bump resolvedConfigFormat + compiler + the
  literal in tests/compile.test.ts (currently 22).
- **APPEND-ONLY:** WORLD_PALETTE, STRUCTURE_TYPES, DECOR_TYPES,
  DECAL_TYPES, POI_TYPES. Parity contracts as before.
- TileForge upstream stays read-only.

## 7. Gotchas earned (new this session — old ones still apply)

- **Swamp BLOCKS movement** (loader contract): any pass that could
  write swamp changes walkability — texture pass forbids it.
- **Sand law:** every sand cell must touch standing water; texture
  never writes sand (steppe mottle uses gravel).
- **Confetti law is 4-connected:** any texture/zone change must leave
  no one-cell regions — texture ends with a revert sweep for both its
  own specks and enclosed originals.
- **Tiny fusion dodge:** 3 free settlements on 64² always fuse; a
  rank-2 near-pin places the third safely (fen/frost/dust hollows).
- **POI spacing is size-scaled now** (tiny 7); the flat constant was
  why tiny maps felt like "4 spots on a map".
- **Zone elevation + connectivity:** see §5 — pins keep civilization
  off wild islands; generation fails loudly (named errors) when a pin
  misses land or a settlement strands.
- **Landmark/settlement near-pins on unseen terrain:** expect 1-2
  iterations; the bare-world render first saves most of them.
- **Approval file recipeSha shifts with vocabulary versions** (the
  normalized recipe gained `zones`/`rank` fields), not only when the
  recipe file changes — re-record the baseline after behavior bumps
  once floods are confirmed invariant.
- Container trick, if ever needed again: the official Godot 4.6.2
  Linux build downloads and runs headless fine (`~/bin/godot`), so the
  full Godot verify chain works from a phone session.

## 8. The canonical world (unchanged content since behavior 42)

`fixtures/recipes/small-cold-coastal.json`, seed 103991. Two cities
(capital 240,125; second city 94,128) + 3 towns + 5 villages; eight
trail-served landmarks; ~100+ story POIs (kinds grew with behavior 41);
roads + shortcut trails + graded mountain trails + POI spurs; mountain
relief with two-tile cascades + rapids; character zones; thicket
ambience; terrain texture since 39. Both consumers flood **33845**,
Godot 0 errors. History of the number: 33887 → 33890 (behavior-34 ford
guard) → 34058 (behavior-39 texture prop rerolls) → 33845 (behavior-41
ambient rerolls); every step flagged and accepted, consumer equality
never broken.

## 9. Commands

    npm test                          # build + 202 tests
    node dist/tools/update-golden.js
    node dist/src/cli.js resolve-tileforge fixtures/recipes/<name>.json --out outputs/gallery/<name>
    node --max-old-space-size=8192 dist/src/cli.js resolve-tileforge fixtures/recipes/<medium-or-large>.json --out outputs/gallery/<name>
    node dist/tools/godot-consumer.js --world outputs/gallery/<name>
    node consumers/typescript/traverse.mjs outputs/gallery/<name>/world.json
    node dist/src/cli.js export-game-pack fixtures/recipes/<name>.json --out <dir>
    node dist/src/cli.js approve-recipe fixtures/recipes/<name>.json --baseline
    node dist/tools/serve-viewer.js   # local viewer :8787
    godot --path consumers/godot
