# WorldForge Game Integration Plan

Status: **Draft for designer review** (2026-07-27). Direction approved by the
designer ("planning pass" go-ahead); every contract detail below is proposed,
not settled. Nothing here changes the artifact format, the pinned package, or
any settled contract — those changes stay behind the decision points in §6,
which are user-authority per `AGENTS.md`.

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

| Phase | Work | Where | Depends on |
|---|---|---|---|
| 1 | Ratify this contract (designer review of §3–§4) | this doc | §6 decisions |
| 2 | `export-game-pack` CLI + tests | WorldForge | Phase 1 |
| 3 | Authored placement extension | WorldForge | Phase 1 (independent of 2) |
| 4 | `addons/worldforge_importer/` in the game repo | game repo (separately scoped task) | Phase 2; game's Gate 1 timing |
| 5 | Slice-zone drafting: generate candidates, curate via §4, export | both | Phases 2–4 |

Phases 2 and 3 are ordinary WorldForge milestones (tests, golden fixtures,
verify chain, version bumps). Phase 4 must be separately scoped by the user
per `AGENTS.md` ("do not write to a game repository unless the user
separately scopes that repository and task").

## 6. Decision points (designer authority, undecided)

1. **Theme pin.** The game's lab runs the *dusk* theme; WorldForge pins the
   *forest* package. Options: (a) slice drafts ship in forest; (b) upgrade
   the pin to a dusk package export (pinned-package change = user
   authority); (c) add a second pinned package fixture for game exports
   (partially lifts a roadmap deferral). Recommendation: **(b)** at Phase 2
   start, since the game's world consumption will be dusk-first and the
   lock already keys on manifest `sourceCommit`.
2. **Resolution ownership.** Pack ships WorldForge-resolved layers (§3.1,
   recommended — blob47/mask logic stays in one place) vs. the game
   resolving semantics itself (rejected by default: duplicates adapter
   logic the game repo explicitly deferred "to WorldForge integration").
3. **Walkability encoding** (§3.3 JSON+base64 vs. a binary sidecar).
   JSON+base64 recommended for packFormat 1; binary is a later append.
4. **Cell-override cap** (§4.3): warn-only vs. hard cap.

## 7. What this plan does not touch

- The three open user-gated items (climate verdicts, formal baseline,
  windowed playthrough, taste polish) — owned by the live desktop session.
- The artifact format: packFormat wraps the artifact; it does not change it.
- TileForge: read-only, as always. A dusk package export, if chosen in §6.1,
  is a user-scoped TileForge-side task exactly like the `sourceCommit`
  precedent.
