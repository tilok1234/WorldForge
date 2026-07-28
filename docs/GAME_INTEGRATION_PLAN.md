# WorldForge Game Integration Plan

Status: **Ratified by the designer 2026-07-27** ("ye go with your
recommendations on all 4") — the §6 decision points are decided as
recommended; the contract shapes in §3–§4 are the approved implementation
targets [P] (details may still evolve during implementation under normal
review). Nothing in this document *executes* a pinned-package change or
artifact-format change — the dusk re-pin (§6.1) remains a designer-scoped
TileForge-side export task at Phase 2 start, per `AGENTS.md`.

Companion document on the game side:
`Wildshot_adventures_pmanning/docs/15-WORLDFORGE_INTEGRATION_PLAN.md`.

## 1. Problem statement

WorldForge generates approved, deterministic worlds, and two consumer lanes
prove the artifact is readable (Godot W7 demo, TypeScript W8 loader). But no
*game* consumes a WorldForge world yet. The first intended production use is
drafting the consuming game's slice zone (recorded in the game's planning
repo, Decision Register, Tooling contracts).

The consuming game ingests every external asset source through one pattern:
a frozen, validated pack dropped into `assets/`, a validating importer addon,
and a manifest contract that never changes shape after v1 (TileForge theme
packages, the Sprite Forge pack, the approved assembler game-pack spec).
WorldForge has no equivalent export. This plan adds one, plus the authoring
depth the handcrafted-rule contract needs.

## 2. Goals and non-goals

Goals:

1. A deterministic, validated **game-pack export**: one command that packs an
   approved world into a frozen folder layout a game importer can trust.
2. **Authored placement depth** in the recipe vocabulary: pinned placements,
   per-recipe stamps, and sparse cell overrides — so progression-critical
   placement is hand-decided *inside* the reproducible pipeline, never by
   editing generated output.
3. Keep every existing contract intact: one engine-neutral artifact, two
   consumer lanes, determinism, TileForge read-only.

Non-goals (unchanged from `docs/ROADMAP.md` deferrals):

- in-process runtime generation inside the shipped game;
- multiple *simultaneous* TileForge packages at generation time;
- gameplay systems (spawn tables, quests, combat) inside WorldForge;
- a graphical editor.

## 3. Game-pack contract (draft)

### 3.1 Folder layout

```text
<world-name>-pack/
  manifest.json
  world.json                    # engine-neutral artifact (current format)
  normalized-recipe.json        # regeneration provenance
  validation-report.json
  resolved/
    resolved-map.tmj
    tileforge-map-data.json
    tileforge-slice.json
  walkability.json              # precomputed grid, §3.3
  minimap.png
```

The pack adds *derived conveniences* (walkability, minimap) on top of the
existing outputs; `world.json` remains the semantic source of truth. Nothing
in the pack duplicates semantic data — settlements, routes, POIs, landmarks
are read from `world.json`.

### 3.2 manifest.json (proposed shape)

```json
{
  "pack": "worldforge-game-pack",
  "packFormat": 1,
  "world": "<recipe name>",
  "artifactFormat": 8,
  "baseArtifactSha256": "<sha256 of world.json>",
  "adapter": { "tileforge": 6 },
  "generator": {
    "behaviorVersion": 35,
    "recipeCompilerVersion": 19,
    "seed": 0,
    "recipeSha256": "<sha256>",
    "generationIdentitySha256": "<sha256>"
  },
  "tileforge": {
    "packageId": "<id>",
    "theme": "<theme>",
    "packageSha256": "<sha256>",
    "manifestSha256": "<sha256>"
  },
  "dimensions": { "width": 0, "height": 0, "chunkWidth": 32, "chunkHeight": 32 },
  "walkability": { "format": 1, "floodCount": 0, "spawnCell": [0, 0] },
  "files": { "<relative path>": "<sha256>" }
}
```

Rules the consumer relies on (mirroring the assembler-pack spec discipline):

- **Byte-stable**: identical inputs produce identical packs. No timestamps;
  identity comes from the hashes (which is why `generated:` date fields are
  deliberately absent).
- **Every consumer-specific derivative records the base artifact hash and
  adapter version** (existing multi-game rule, now enforced by the manifest).
- ids and file names freeze at packFormat 1; later additions append fields,
  never repurpose them.

### 3.3 walkability.json (proposed)

The consuming game runs a pure simulation core over a collision bitgrid; it
must not re-derive walkability from tile art. Proposed encoding:

```json
{
  "walkabilityFormat": 1,
  "width": 0,
  "height": 0,
  "encoding": "base64-bitpacked-row-major-lsb-first",
  "grid": "<base64>",
  "floodCount": 0,
  "spawnCell": [0, 0]
}
```

- The grid is computed by the **same ladder the TypeScript loader exposes**
  (the public world-model contract), so it is parity-tested by construction.
- `floodCount` is the connected-walkable count from `spawnCell` — the same
  number both consumer lanes already report — so an importer can verify the
  grid in one flood fill before trusting it.
- **Phase-A structures-solid stamp (2026-07-28, porous-collision fix):** on
  top of the loader ladder, the pack grid seals every settlement and POI
  structure footprint (doors and pass cells included — the game has no
  interiors, and a 0.7-tile player brushing a facade slides into the
  sprite), plus unpaved one-cell slits and back pockets bounded by those
  footprints. Kept walkable by design: paved streets and trails (the
  planner's own corridors — sealing them severs worlds), bridges and fords,
  gate structures (`ruined_gate`/`fortress_gate` — behavior 47's "gates
  exempt"), and landmark-compound interiors (curated open-air space). A
  deterministic connectivity reconciliation reopens any slit seal that
  turns out to be a sole corridor (mountain notches between mine
  buildings) and refuses to export if stamping would orphan any region.
  The BASE artifact and both consumer lanes are untouched — `floodCount`
  in the pack is the stamped grid's flood and therefore smaller than the
  loader flood on `world.json` (canonical: 33712 packed vs 33893 base).
- **Moss-walks ruling (2026-07-28, designer-verified in play):** flat
  foliage that blocks is an unreadable promise, so bare moss carpet on
  LEVEL-0 rock (the adapter's cliff quantization: the flat apron where a
  rock mass meets open land, no rendered cliff face) is walkable in the
  pack grid. Moss stays solid up the terraced peaks (level >= 1, behind
  cliff faces — re-checkable later), under blocking props (trees,
  boulders), under structure tiles (the porosity audit's 11-cell count
  is unchanged), and on stream water. Moss also joins the keep-open set
  so the slit pass never re-seals a carpet. Canonical: 626 carpet cells
  walk (478 join the main region, 148 stay enclave pockets inside rock
  rings), and the aprons also reconnect 366 previously-unreachable
  walkable wilderness cells — pack flood 33712 -> 34556 (base 33893
  unchanged; the pack flood may now EXCEED the base loader flood).

### 3.3a Contract as built (clarifications recorded 2026-07-28, from the
Phase-4 importer's independent validation)

- The artifact's own format field is `formatVersion`; the manifest mirrors
  it as `artifactFormat`. The importer's cross-check
  `world.formatVersion == manifest.artifactFormat` is correct and blessed.
- `manifest.files` lists the 8 payload files; `manifest.json` itself is
  deliberately absent (it cannot contain its own hash).
- `baseArtifactSha256` equals `files["world.json"]` by construction; the
  importer's self-consistency check on that equality is blessed.
- `validation-report.json` shape is `{status, errors, warnings}`; a pack
  exports only when status is `pass`, and warnings are legal content (a
  dense world reports hundreds — e.g. decoration-density notices).
- Under the Phase-A stamp (§3.3), a game-side "no walkable cell carries a
  structures tile" audit reads 11 legitimate cells on canonical, not 0:
  9 bridge cells (route crossings render bridge structures and MUST walk)
  and 2 ruined-city wall breaches (behavior 47 trail entries). An importer
  auditing for porosity should exempt crossing cells and landmark rects.
- Roof-ridge/chimney rows CANNOT move to `props-overhang` WorldForge-side:
  structure layer placement is the pinned package's template contract, and
  the §4 acceptance proves pixel-identity against the package's own
  map-reference. Occluding players behind rooflines needs an upstream
  TileForge template field (per-cell overhang rows) — a designer-scoped
  TileForge task, recorded here per the compatibility procedure.

### 3.4 export-game-pack CLI (proposed)

```text
node dist/src/cli.js export-game-pack <recipe.json> --out <dir>
```

Refuses to export when (all hard failures, no partial packs):

1. the validation report is not `pass`;
2. the TypeScript-loader flood count differs from the packed grid's;
3. any manifest-listed file is missing or its hash mismatches;
4. the output root fails the existing path guard.

Publish-after-validation and temp-directory staging follow the existing safe
write rules.

## 4. Authored placement extension (draft)

Deepens the recipe vocabulary so specific, hand-decided placement lives in
the same schema, validators, and determinism contract as everything else.
Three additions, all optional, all normalized into the recipe identity hash:

### 4.1 Pinned placements

```json
"landmarks": [
  { "type": "lighthouse", "at": [240, 125] },
  { "type": "ruined_city", "near": { "cell": [90, 40], "radius": 12 } },
  { "type": "world_tree", "relation": "far_from_town" }
]
```

- `at` demands the exact anchor cell; `near` constrains the search;
  `relation` keeps today's behavior. Settlements gain the same fields.
- An impossible pin (substrate/slope/margin violation, overlap) **fails
  validation with the named constraint** — no silent relocation, matching
  the "no best-effort silent correction" non-goal.

### 4.2 Per-recipe stamps

```json
"authoredStamps": [
  { "name": "portal-glade", "stamp": { "stampFormat": 1, "...": "..." } }
]
```

Inline (or recipe-adjacent file) stamps using the existing `stampFormat 1`
shape, namespaced `recipe.<name>` so shared fixture types stay distinct.
This is the lane for one-off authored set-pieces without polluting the
shared stamp library.

### 4.3 Cell overrides

```json
"cellOverrides": [
  { "cell": [102, 88], "clearProp": true },
  { "cell": [77, 30], "material": "terrain.gravel" }
]
```

- Applied at one defined pipeline stage (after decoration, before
  validation and resolution) so results are deterministic, diffable, and
  still subject to every validator (sand margin, ford rules, parity).
- Intended for spot decisions ("delete that tree", "harden this shore"),
  not bulk editing — a soft cap with a named warning keeps the lane honest.

### 4.4 Versioning consequences

- Optional new fields → recipe schema revision + **recipe compiler bump**;
  normalization must canonicalize the new sections.
- Placement behavior changes → **behavior version bump** per the standing
  sequential-bump rule.
- Existing recipes remain valid unchanged; golden fixtures extend, not
  mutate.

## 5. Phases

| Phase | Work | Where | Status |
|---|---|---|---|
| 1 | Ratify this contract (designer review of §3–§4) | this doc | ✅ ratified 2026-07-27 |
| 2 | `export-game-pack` CLI + tests | WorldForge | ✅ **implemented 2026-07-27** (behavior-neutral; `src/gamepack/`, `tests/gamepack.test.ts`) |
| 3 | Authored placement extension | WorldForge | ✅ **implemented 2026-07-27** (behavior 36; landmark `at`/`near`, `authoredStamps`, `cellOverrides`; `tests/authoredPlacement.test.ts`) |
| 4 | `addons/worldforge_importer/` in the game repo | game repo (separately scoped task) | validating half **live 2026-07-28** (reference pack validates in 0.57 s; independent flood fill reproduces 33845); rendering/consumption deferred post-Gate-1 |
| 5 | Slice-zone drafting: generate candidates, curate via §4, export | both | unblocked: dusk pin executed 2026-07-28 |

Implementation notes (2026-07-27):

- **Settlement pins: implemented 2026-07-27 (behavior 37, routes.graph 13)**
  after the rank-interaction design was ratified by the designer (mobile
  session): recipes gain a rank-ordered `settlements` array of `at`/`near`
  entries — **entry order IS rank order**, so the first entry authors the
  capital, the second the second city, and so on down the tier ladder.
  Pins select before every competitive phase and later phases treat them
  as real settlements (the capital phase stands down when rank 0 is
  pinned, the remote quarter measures from a pinned capital and stands
  down when rank 1 is also pinned, sector floors count pins toward their
  sector, open competition spaces around them). An unsettleable or
  crowded pin is a named generation error, never a relocation.
  **Behavior 38 (same day) appended the optional `rank` field**: an entry
  may claim any budget slot explicitly (effective rank = rank ?? entry
  index, unique, inside the budget), so a village can be pinned while the
  capital stays free-competed; competitive phases fill the unclaimed
  ranks and a final permutation seats every pick (identity permutation
  for contiguous-prefix pins — behavior-37 recipes unchanged).
  `tests/settlementPins.test.ts`; end-to-end CLI proofs: pinning rank 0
  on the free solver's town cell flips the crown, and pinning only
  rank 1 leaves the capital to competition.
- Landmark pins select before free competition; a failed pin is a named
  generation error, never a relocation.
- The Godot half of the verify chain (godot-consumer + verify_world.gd) for
  the behavior-36 commit: **VERIFIED 2026-07-27, post-merge to main** —
  Godot 4.6.2 stable (official build) installed into the container;
  verify_world.gd 0 errors on canonical small-cold-coastal, all 18
  destinations reachable, walkability ladder green, Godot flood 33890 ==
  TS traverse flood 33890. 170 tests green on the merge commit.

Phases 2 and 3 are ordinary WorldForge milestones (tests, golden fixtures,
verify chain, version bumps). Phase 4 must be separately scoped by the user
per `AGENTS.md` ("do not write to a game repository unless the user
separately scopes that repository and task").

## 6. Decision points — DECIDED 2026-07-27 (designer approved all
recommendations)

1. **Theme pin → (b), re-pin to dusk — EXECUTED 2026-07-28.** The
   designer-supplied `tileforge-dusk-complete.zip` imported as
   `fixtures/tileforge-packages/dusk-ae1eecb-seed103991/` (a NEWER
   upstream commit than forest's a5baf52 — its guide retires road bands
   1/3 as `roadTypesLegacy`, matching WorldForge's corridor doctrine);
   §2/§4 acceptance passed against the dusk package's own reference;
   semantic ids identical across themes so all world content is
   byte-identical (canonical flood 33845 invariant); lock swapped with
   designer approval ("use dusk for now, we can change later"); the
   forest fixture stays committed, so re-pinning back is a lock change.
   OPEN designer ruling: ruined-city dead streets are authored with the
   legacy ruined-road band (renders fine; the new guide says never
   author new legacy-band runs — bless as archaeology or re-express).
2. **Resolution ownership → WorldForge [P].** Packs ship
   WorldForge-resolved layers (§3.1); blob47/mask logic lives in the
   adapter, once. The game never re-derives resolution from semantics.
3. **Walkability encoding → JSON+base64 for packFormat 1 [P].** A binary
   sidecar is a permitted later append, never a replacement within
   packFormat 1.
4. **Cell-override cap → warn-only [P]** (§4.3): a named validation
   warning above the soft cap, no hard refusal.

(The game-side importer timing — post-Gate-1 — is recorded in the
companion doc, where that schedule lives.)

## 7. What this plan does not touch

- The three open user-gated items (climate verdicts, formal baseline,
  windowed playthrough, taste polish) — owned by the live desktop session.
- The artifact format: packFormat wraps the artifact; it does not change it.
- TileForge: read-only, as always. A dusk package export, if chosen in §6.1,
  is a user-scoped TileForge-side task exactly like the `sourceCommit`
  precedent.
