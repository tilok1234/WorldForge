# WorldForge — session handoff (2026-07-26, account switch #2)

For a fresh AI session with no prior context. Read `AGENTS.md` and the
`README.md` reading list first; this file carries session state the docs
don't. Note: file-based assistant memory at
`~/.claude/projects/C--Users-headc-Documents-WorldForge/memory/` DID survive
the previous account switch (it is machine-local); if present, it
cross-validates this file. HANDOFF.md is the tiebreaker.

## Where the project stands

**The entire starter roadmap W0–W9 is implemented** with machine-verified
evidence, plus substantial post-roadmap work under the user's standing
"alive worlds" direction. 152 tests; CI green on ubuntu/windows/macos
through `968fa8b` (later commits pending CI at handoff time). Versions:
behavior 17, recipe compiler 9, artifact format 8, resolved-config 7,
TileForge adapter 3. Canonical recipe
`fixtures/recipes/small-cold-coastal.json` (seed 103991): 256×256, now 10
settlements / 3 primary routes / fortress across the river / 36 POIs.

What exists (beyond the W0–W6 base recorded in git history):

- **W7**: both entry gates proven (§2 resolution forge-identical vs the
  package's own map.tmj; chunked halo-2 == global over 2.2M comparisons);
  §4 acceptance zero-diff (0/3.5M px) via a zero-dep PNG decode+composite
  pipeline; packaged Godot importer runs headless (`consumers/godot/`,
  EditorScript source executed with base swapped — 4.6 removed `-e -s`);
  playable streamed slice (world.gd: 32-cell chunks, §3 ladder on tile
  metadata, minimap, user:// deltas) + headless integration check.
- **W8**: public TS loader `src/consumers/typescript/loader.ts` (ZERO
  imports, test-enforced; format+dependency validation; typed access;
  pass-cell walkability model rebuilt from structure/POI records; cache
  stamps). Cell-exact cross-consumer parity: loader == in-engine grid on
  all 65,536 canonical cells; identical BFS floods. Viewer runs on the
  loader (walkability overlay). Parity caught real bugs: artifact lacked
  network rivers (format 7 fixed), decal walk-granting ambiguity (below).
- **W9**: authoring CLI — validate-brief / explain-recipe / diff-recipes /
  compare-worlds / approve-recipe (sidecar with recipeSha256 drift check).
- **Alive-worlds passes** (user verdicts drove each): decoration
  (forests/overlays/decals/roadside), W5.1 town variety + fountain plazas,
  town scale-up (street arms, approachMaxLength 8 forces street-lining),
  farms/piers/waterline, sand beaches (corner16 live; margin machinery),
  POIs phase A (camps/stones/battlefields/graveyards/shrines/fishing) and
  phase B (mine/cave/stone circle/crypt/ruin/giant skeleton + loader
  pass-cell model), viewer discoveries overlay (orange diamonds).

## IN FLIGHT: the density pass (behavior 17, commit a0e137e)

User verdict: "map still waaaay too dead — 10% cool, 90% unused. Fill it
with more towns, bandit camps, smaller mountain peaks with dungeons."
Implemented and committed: rocky knolls (macro.biomes 3, pre-routes rock
blobs, 18/small), palisaded bandit camps (structure.camp_wall → package
palisade; camp clutter props), POI budget 36/12, canonical recipe 5→10
settlements (W9 diff flow). 152 tests green, goldens regenerated.

**REMAINING to finish the pass (user said complete it):**
1. **Bandit camps placed ZERO on canonical** — with 10 settlements the
   `settlementGap > 16` gate rarely coexists with the road band
   (`nearRoad(14) && !nearRoad(4)`) + 9×8 clearRegion. Loosen (gap > 12?,
   region 8×7?, widen band) and rerun until 2-3 place.
2. Re-run the verify chain on the dense world:
   `node dist/tools/godot-consumer.js --world outputs/w7-slice` (expect
   0 errors, note the flood number) and
   `node consumers/typescript/traverse.mjs outputs/w7-slice/world.json`
   (flood must EQUAL the Godot number).
3. Visual self-review then user refresh: knolls (do they read as small
   peaks? do cave mouths land on them?), a bandit camp crop, the denser
   macro overview. Send crops via SendUserFile + tell the user to refresh
   the viewer (see review loop below).
4. Watch CI (gh run watch) for a0e137e and later commits.

## Working agreements (unchanged, plus additions)

- **Milestone/iteration loop**: implement → tests + goldens
  (`node dist/tools/update-golden.js`, never hand-edit) → CI green →
  visual candidates → user verdict → iterate. Structural success never
  implies visual approval.
- **Review loop (primary)**: serve `node dist/tools/serve-viewer.js`
  (launch config `viewer`, port 8787); user watches
  `http://127.0.0.1:8787/tools/viewer.html?dir=outputs/w7-slice`.
  Regenerate INTO THE SAME DIR (`resolve-tileforge <recipe> --out
  outputs/w7-slice`); the user presses refresh. Prompt→regenerate→refresh
  is the iteration contract. Viewer is read-only by contract.
- **Versioning discipline**: any generation change bumps
  GENERATOR_BEHAVIOR_VERSION + the touched rule packs; adapter-only
  changes bump TILEFORGE_ADAPTER_VERSION + adapter.tileforge; artifact
  shape changes bump ARTIFACT_FORMAT_VERSION + loader SUPPORTED format +
  test literals (routes/settlements tests assert it).
- **Parity discipline**: every new blocking prop species goes in BOTH
  decorate.ts BLOCKING and loader BLOCKING_PROPS; every new structure
  with pass cells goes in loader STRUCTURE_PASS_CELLS (+ records carry
  footprints). The parity fixture catches misses; the full-grid oracle
  is tests/parity.test.ts's ladderWalkable + consumers/godot/
  dump_walkable.gd for in-engine truth.
- **Git**: fetch/rebase before push; never force. The PREVIOUS session
  held standing commit/push authorization — **re-confirm with the user**.
  TileForge (`C:\Users\headc\Documents\Semantic tile generator design`)
  is read-only upstream; guard denylist in gitignored
  `worldforge.local.json`.
- **User-gated, still open**: windowed Godot playthrough
  (`godot --path consumers/godot` after the driver run); FORMAL visual
  baseline (`approve-recipe fixtures/recipes/small-cold-coastal.json
  --baseline` when the user blesses it); end-of-plan taste-polish round.

## Upstream questions parked for the user (TileForge is theirs)

1. Guide §2.6 wet-bank list includes packed road; FORMATS.md + worldgen
   example omit it. We follow FORMATS. Shows at bridge-approach banks.
2. Guide PROSE limits walk-granting decals to stepping stones/frost/ford
   over water/river; the packaged reference is_walkable grants for ANY
   walkable-true decal over ANY blocked terrain. We follow prose AND keep
   cosmetic decals off blocked/stream cells (decoration v3).

## Gotchas that cost time (don't relearn)

- Godot 4.6: `-e -s` EditorScript entry REMOVED; EditorScript can't
  instantiate outside the editor → run its SOURCE with base swapped
  (consumers/godot/import_tileforge.gd). `--import` IS a real flag.
  A GDScript error aborting _init() leaves headless Godot idling forever
  → the driver enforces per-step timeouts. SceneTree._init add_child
  does NOT run _ready until the first process frame (connect
  process_frame ONE_SHOT). `:=` can't infer through Variant boundaries.
- The workbench map.tmj was cropped from a larger canvas: its border
  sand ring (16/240 dual points) is unverifiable from raw grids —
  excluded by design in the truth test.
- Sand: §2.7 margin (no sand row/col 0 — emitTmj THROWS), smoothing must
  not absorb INTO sand (barredTargets), beaches ≥2 cells, lone-sand
  revert runs AFTER settlement paving.
- Streams sever streets: streetFordCells computed once in composeWorld,
  honored by the entrance validator, rendered as fords by the adapter.
- STRUCTURE_TYPES / palette / DECOR / DECAL lists are APPEND-ONLY.

## Commands

```
npm test                          # build + 152 tests (~2s)
node dist/tools/update-golden.js
node dist/src/cli.js smoke | generate | render-macro | contact-sheet |
    resolve-tileforge <recipe> --out outputs/<dir> |   # + world.json, tmj,
                                                       #   8k render, slice
    verify-resolution [<recipe>] | import-package | verify-package |
    validate-recipe | hash | validate-brief | explain-recipe |
    diff-recipes <a> <b> | compare-worlds <a> <b> |
    approve-recipe <recipe> [--baseline]
node dist/tools/godot-consumer.js [--world outputs/w7-slice]  # headless Godot chain
node consumers/typescript/traverse.mjs [world.json]           # TS consumer demo
node dist/tools/serve-viewer.js                               # viewer on :8787
godot --path consumers/godot                                  # play the slice
```
