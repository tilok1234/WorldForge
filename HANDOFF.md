# WorldForge — session handoff (2026-07-26)

For a fresh AI session with no prior context (including a new account: the
previous assistant's local memory does NOT transfer — this file and the docs
are the complete truth). Read `AGENTS.md` and the `README.md` reading list
first; this file adds session state the docs don't carry.

## Where the project stands

Milestones **W0–W5 complete and visually approved as baselines. W6 complete
and approved at the data level** (commit `b605622` + this handoff commit).
112 tests, CI green on ubuntu/windows/macos (`.github/workflows/ci.yml`).
Behavior version 8, recipe compiler 8, artifact format 4, resolved-config
format 6. The pinned TileForge forest package
(`fixtures/tileforge-packages/forest-a5baf52-seed103991/`, lock at
`tileforge.lock.json`) drives all semantic mapping and joins generation
identity.

What exists, per milestone: deterministic kernel (integer-only, golden
vectors) → macro fields + biomes (percentile-tuned thresholds) → hydrology
(priority-flood, meandering rivers, basin-rule lakes, wetlands, coastal
moisture) → routes (band-free packed-road corridors, bridges/fords from the
two-tier river network, edge-penalty costs) → settlements (town+outposts,
geography purposes, atomic structures with entrance reachability + rollback,
fortress stamp with blend ring, relational recipe vocabulary + solver) →
TileForge adapter (emits the package's `map-data.json` raw-grid source
format; masks/atlas are consumer-derived per the package `FORMATS.md`; zero
unresolved keys on the canonical world).

## Next: W7 (Godot vertical slice) — DO NOT START UNSILENTLY

The user said: **come back to them before starting W7.** Get an explicit go.

W7 entry gate (two W6 exit criteria the user transferred; they must not
vanish):

1. Reference slice passes the TileForge acceptance procedure through the
   packaged Godot importer, compared per the guide's map-reference method
   (`GAME-GUIDE.md` §4: render `map.tmj` from stored gids vs
   `map-reference.png` at zero pixel diff, then re-derive masks per §2 and
   match the stored ones).
2. Chunk-border matching at **resolution level** — mask/underlay agreement
   across seams, not just raw-grid agreement.

Standing native-scale check: if the resolved town reads as a row of boxes,
**W5.1** is footprint variety (package pool: cottage, tavern, smithy, chapel,
manor, farmhouse, barn, stall…) and plaza legibility (fountain exists).

Recon already done: **Godot 4.6.2 is installed and on PATH.**
`tileforge_worldgen_example.gd` in the package is a complete §2 reference
implementation with a deliberately portable integer hash. Suggested order:
build the pure-TS mask/underlay verifier (entry gate 2) before any Godot
work, then a Godot project under `consumers/godot/` (copy the package folder
in per its `README.txt` quick start; run `tileforge_importer.gd` headless).

## Working agreements with the user

- **Milestone loop**: implement → tests + goldens → 3-OS CI green → send
  visual candidates (`SendUserFile`) → the user gives a verdict (approve as
  baseline, or an iteration brief) → iterate until approved. Structural
  success never implies visual approval (`AGENTS.md`).
- **Review artifacts**: contact sheet (16 seeds — judge the distribution,
  never one blessed seed), macro renders, and 3–4× crops for anything at
  gameplay scale (full-size renders hide line artifacts).
- **Tune by measurement**: never adjust thresholds by eye. Probe percentiles
  across ≥8 seeds (`tmp/` scripts pattern), set values from the data, re-run
  the contact sheet. Recipes need explicit budgets or no settlements/roads
  generate (defaults are 0).
- **Versioning discipline**: any behavior change bumps
  `GENERATOR_BEHAVIOR_VERSION` (+ compiler/rule packs as applicable) and
  regenerates goldens via `node dist/tools/update-golden.js` — never edit
  goldens by hand. Docs get the smallest amendment at milestone boundaries,
  no full-document passes.
- **Git**: the user pushes from other sessions — always `git fetch` +
  rebase before pushing; never force-push. The PREVIOUS session held standing
  commit/push authorization; **re-confirm it with the user** before assuming
  it. TileForge (`C:\Users\headc\Documents\Semantic tile generator design`)
  is read-only upstream — the machine-local guard denylist lives in
  `worldforge.local.json` (gitignored; recreate from the example file on a
  new machine).

## Commands

```
npm test                     # build + full suite (Node --test needs the glob)
node dist/tools/update-golden.js
node dist/src/cli.js smoke | generate | render-macro | contact-sheet |
                     resolve-tileforge <recipe> --out outputs/<dir> |
                     import-package | verify-package | validate-recipe | hash
tools/viewer.html            # read-only artifact viewer (file input or ?url=)
```

Canonical recipe: `fixtures/recipes/small-cold-coastal.json` (seed 103991,
north-elevation bias, fortress across the river from the town).
