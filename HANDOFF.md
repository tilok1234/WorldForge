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

**W7 progress (2026-07-26, explicit user go, verifier-first):** entry gate 2
is DONE in pure TS — `src/adapters/tileforge/resolution.ts` implements the
full §2.4-2.8 derivation (blob47 + ladder, underlay incl. open-side rule,
corner16 sand field, net16 with river-mouth and wall-gate rules, overlays,
decals, cliffs/ramps); `verifyResolution.ts` proves it two ways:
forge-identical against the package's own `map.tmj` (every layer, all 3456
underlays; only unverifiable border sand excluded — the workbench map was
cropped from a larger canvas, so its border sand ring carries pre-crop data,
240 points / 16 divergent, reported not compared) and seam-clean (chunked
halo-2 resolution == global, zero mismatches over 2.2M comparisons on the
canonical 256x256 world at 16- and 32-cell chunks; window over-reads throw,
so the halo bound is proven too). CLI: `verify-resolution`. 125 tests.
**§4 acceptance now passes at both steps in pure TS**: step 1 — map.tmj
rendered from stored gids (painter's algorithm, shipped layer order, binary
alpha, frame 0, sand +16 offset) is pixel-identical to `map-reference.png`,
0/3538944 differing; step 2 — the §2-derived masks match the stored ones
(the truth test above). Zero-dep RGBA8 PNG decoder at
`src/render/pngDecode.ts` (node:zlib inflate).
**Entry gate 1 importer leg DONE — both W7 entry gates are now discharged.**
`consumers/godot/` + `node dist/tools/godot-consumer.js`: copies the pinned
package in (gitignored), runs `godot --headless --import`, executes the
PACKAGED `tileforge_importer.gd` headless, then verifies the built TileSet
in-engine — 22,029 frame-0 tiles across all 81 families, 0 errors
(semantic_id, per-tile walkable overrides, hazard/depth/swim/wade,
collision, animation counts, all blob47 peering bits vs manifest).
Godot 4.6 gotchas learned: the `-e -s` EditorScript entry point is GONE
(-s demands SceneTree/MainLoop even with -e) and EditorScript cannot
instantiate outside the editor, so `import_tileforge.gd` executes the
packaged importer's own source with ONLY `extends EditorScript` swapped to
RefCounted (its _run() touches no editor API). A GDScript error aborting
_init() leaves headless Godot idling forever — the driver enforces
per-step timeouts.

**Slice progress (9a8e6fe):** `emitTmj.ts` authors a §2.13 map.tmj for any
resolved world (tilesets block verbatim from the package; §2.4 selector v2
variants + tone field on channels tileforge.variant/tileforge.tone;
structures share the anchor variant; overhangs reuse the ground variant).
`resolve-tileforge` now also writes resolved-map.tmj + resolved-render.png
through the §4-proven compositor — every resolve yields a native-scale
visual candidate. **Adapter v2** (TILEFORGE_ADAPTER_VERSION 2, rule pack
adapter.tileforge 2, goldens = identity-only churn): the emitted river
layer carries the FULL two-tier network; before, fords sat on unrendered
crossing-tier cells (canonical world had a ford ON GRASS — package
substrate violation). Artifact river layer stays majors-only.
**Native-scale self-review verdicts:** fortress stamp + blend ring good,
corridor→cobble junctions good, stair-stepped streams + fords good after
the fix. **The STANDING W5.1 FLAG FIRED**: the town reads as one house
metatile repeated (no plaza/fountain, no footprint variety). Candidates
sent to the user (outputs/w7-slice/: overview-8x, town-core-crop,
fortress-crop, ford-crop + full resolved-render.png); W5.1 verdict and
visual approval PENDING. Remaining slice work: Godot streamed-chunk scene
consuming resolved-map.tmj, traversal on the §3 walkability ladder,
minimap (mappings.minimap), explicit deltas, headless integration check.
Known contract question: GAME-GUIDE §2.6 includes packed road in the
wet-bank list, FORMATS.md + the worldgen example omit it, the workbench map
never exercises it — we follow FORMATS; bridge approaches are where a wrong
reading would show (bank under water beside a road corridor).

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

## Alive-worlds direction (user verdict on the first candidates)

"Looks cool but very bare bones — utilize the tileset, detailed intricate
maps that feel alive." Standing creative direction, staged through the
decoration compiler. **Stage 1 SHIPPED (5957d52)**: behavior 9, compiler 9
(decoration.densityPermille, default 400), artifact format 5
(prop/moss/tallgrass/decal layers + key tables), adapter v3. Forests with
closed cores and open meadows (gate = patch−350; measured 4..160 trees per
16-block), biome species tables, overlays in patches, causal decals,
roadside milestones/signposts. Adapter v3 lesson: streams sever streets
(streets never paint over water), so any river cell on or between corridor
material gets a STREET FORD — canonical world: 2 route + 12 street fords.
Stage 2 = W5.1 settlement variety + plazas; stage 3 = coast/water dressing
(piers, sand, lakeside detail). All layers flow through the §2-proven
pipeline automatically (viewer, render, seams, Godot).

## Review loop (user-requested interface, ebd59c5)

The user reviews worlds in the browser and iterates through chat: start
`node dist/tools/serve-viewer.js` (or the `viewer` launch config), open
`http://127.0.0.1:8787/tools/viewer.html?dir=outputs/w7-slice` — pan/zoom
the native render, hover for per-cell inspection, destination markers,
chunk grid. The user prompts changes in chat; the agent regenerates the
SAME output directory (`resolve-tileforge ... --out outputs/w7-slice`);
the user presses refresh (R) and the view reloads in place. The viewer
stays read-only by contract — approvals and change requests flow through
chat, never through the tool.

**Playable slice (8489f81):** `world.gd`/`world.tscn` stream the resolved
world in 32-cell chunks through the packaged-importer TileSet — grid player
on the §3 ladder (importer tile metadata), M minimap (mappings.minimap), E
mark-deltas persisted in user:// over the deterministic base.
`verify_world.gd` (via `node dist/tools/godot-consumer.js --world
outputs/w7-slice`) proves headlessly: chunk re-entry byte-stable, walkable
flood 42,888 cells with ALL 6 destinations reachable (fortress included),
wall/deep-water block + ford walks, deltas round-trip. Play:
`godot --path consumers/godot`. Remaining W7 evidence: windowed visual
review (seams, minimap look) + the user's visual approval + W5.1 verdict.

## Commands

```
npm test                     # build + full suite (Node --test needs the glob)
node dist/tools/update-golden.js
node dist/src/cli.js smoke | generate | render-macro | contact-sheet |
                     resolve-tileforge <recipe> --out outputs/<dir> |
                     verify-resolution [<recipe>] |
                     import-package | verify-package | validate-recipe | hash
tools/viewer.html            # read-only artifact viewer (file input or ?url=)
```

Canonical recipe: `fixtures/recipes/small-cold-coastal.json` (seed 103991,
north-elevation bias, fortress across the river from the town).
