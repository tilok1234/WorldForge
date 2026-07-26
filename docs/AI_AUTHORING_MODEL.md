# WorldForge AI Authoring Model

Status: **Normative draft**

## Purpose

WorldForge is a procedural world generator. AI is an optional authoring client
for that generator.

A person may describe a desired world in ordinary language. An AI assistant may
translate that intent into a structured `WorldRecipe`, explain tradeoffs,
propose revisions, and summarize validation results. The deterministic
WorldForge compiler still creates and validates the world.

WorldForge must also work when a person, editor, script, or test writes the same
recipe without using AI.

## Responsibility model

| Participant | Owns |
|---|---|
| User | Creative direction, constraints, review, and approval |
| AI authoring client | Drafting and revising structured settings |
| WorldRecipe | Accepted, portable intent and seed |
| RecipeCompiler | Deterministic resolution of intent into explicit parameters |
| ResolvedWorldConfig | Derived parameters consumed by generation passes |
| WorldForge | Deterministic generation, validation, and world artifacts |
| TileForge | Tile semantics, visual construction rules, and released packages |
| Game adapter | Loading, streaming, and presenting the generated artifact |

AI output is a proposal until it passes schema validation and any required user
approval. A conversation transcript is not the world specification.

## Authoring paths

WorldForge supports two equivalent paths:

```text
Human or tool writes recipe ────────────────┐
                                            ├─> validated WorldRecipe
Human describes intent -> AI drafts recipe ┘
                                                    ↓
                                         ResolvedWorldConfig
```

Both paths enter the same recipe loader, normalizer, deterministic recipe
compiler, validators, and generator. AI-authored recipes receive no hidden
capabilities and bypass no rules.

## Canonical workflow

```text
1. User intent
      ↓
2. Draft WorldRecipe
   (written manually or proposed by AI)
      ↓
3. Schema validation and normalization
      ↓
4. Deterministic compilation to ResolvedWorldConfig
      ↓
5. User review when the recipe or baseline requires approval
      ↓
6. Seeded deterministic generation
      ↓
7. Structural validation and debug views
      ↓
8. Optional AI explanation or recipe-diff proposal
      ↓
9. TileForge resolution and versioned game export
```

The AI revises the recipe, not the generated cells. Directly painting over a
failed generated artifact would hide the cause and break reproducibility.
Authored landmark stamps are an explicit exception because they are versioned
inputs with their own schema and validation.

## WorldRecipe

`WorldRecipe` is the only author-facing root generation document. It includes
the seed, describes bounded intent, and may later reference separately versioned
authored assets such as landmark stamps. The first schema is intentionally
small:

```json
{
  "recipeFormat": 1,
  "seed": 12345,
  "world": {
    "sizePreset": "small",
    "climatePreset": "cold_coastal"
  },
  "biases": {
    "northElevationPermille": 350,
    "temperaturePermille": -400,
    "moisturePermille": 200
  },
  "budgets": {
    "regionCount": 4,
    "settlementCount": 5,
    "primaryRouteCount": 2,
    "landmarkCount": 1
  }
}
```

Recipe fields describe semantic intent and measurable bounds. Biases use
normalized integers rather than unconstrained floating-point values. Recipes do
not contain atlas coordinates, TileForge source paths, arbitrary executable
code, resolved field parameters, or instructions to weaken validators.

## ResolvedWorldConfig

The versioned `RecipeCompiler` expands recipe presets and budgets through pinned
rule packs into explicit generator parameters such as dimensions, chunk size,
field thresholds, biome definitions, enabled passes, and placement budgets.

`ResolvedWorldConfig` is:

- deterministic from the normalized recipe and recipe-compiler version;
- recorded and hashed for diagnostics;
- readable in debug artifacts;
- not a second user-authored configuration file;
- rejected if its hash does not match a fresh resolution of the recipe.

## Staged vocabulary

Recipe vocabulary lands only with generator capability:

- **W0:** seed, named presets, integer counts, integer biases, budgets, and
  simple feature toggles.
- **W2–W4:** field, biome, hydrology, and route controls backed by implemented
  passes and validators.
- **W5+:** named entities and relational constraints backed by an actual
  placement or constraint solver.
- **W9:** polished natural-language drafting, explanations, and structured
  recipe-diff UX.

Unknown or milestone-premature fields fail validation. They are never stored as
promises for behavior that does not exist.

## Deterministic boundary

AI drafting may be nondeterministic. World generation may not be.

Reproducibility begins after a recipe has been:

1. schema-valid;
2. normalized;
3. saved;
4. compiled into `ResolvedWorldConfig`;
5. assigned its generation identity.

The reproducible identity includes the normalized recipe—including its seed—the
recipe-compiler version, WorldForge generator version, rule-pack versions, and
pinned dependency identities. The resolved-config hash is recorded as derived
verification. The original prose prompt may be stored as optional provenance,
but it is not a substitute for the accepted recipe.

WorldForge must be able to regenerate an accepted world offline without calling
an AI model.

## AI permissions

An AI authoring client may:

- translate a natural-language brief into a draft recipe;
- ask for a missing choice when it materially changes the result;
- propose bounded recipe changes;
- explain which setting caused a visible result;
- compare two recipes or validation reports;
- suggest a new seed while preserving the requested constraints;
- draft versioned landmark inputs;
- inspect the pinned TileForge package and its public documentation read-only;
- turn validator failures into a clear revision proposal.

## AI restraints

An AI authoring client must not:

- become part of the deterministic generation loop;
- place or rewrite generated cells as an undocumented repair;
- bypass schema, topology, budget, path-safety, or compatibility validation;
- silently change the seed or accepted constraints;
- invent TileForge semantic IDs, masks, atlas coordinates, or package behavior;
- edit TileForge or generate files inside a TileForge checkout;
- treat prose chat history as the only copy of world-defining information;
- execute arbitrary code embedded in a recipe;
- declare a generated world approved without the required evidence and review.

## Future W9 iteration model

A useful AI-assisted iteration is expressed as a recipe diff:

```text
Requested:
- Move the fortress farther north.
- Make the western village larger.
- Add a swamp between the village and fortress.

Proposed recipe changes:
- landmarks[fortress].regionBias: central -> north
- settlements[western_village].size: small -> medium
- geography.requiredBiomes: add wetland
- constraints.preservePrimaryRouteConnectivity: true
```

WorldForge then regenerates and reports whether the request is satisfiable. If
it fails, the validator should identify the conflicting constraints rather than
letting the AI conceal the failure.

## Roads while TileForge evolves

WorldForge stores road intent independently from road artwork:

- destination graph;
- route class;
- centerline or semantic corridor;
- required crossings;
- connectivity constraints.

These systems can be generated and validated while TileForge road rendering is
being repaired. Debug views may use simple placeholder colors. When a corrected
TileForge package is approved and pinned, WorldForge reruns only the adapter and
affected validation surfaces. The accepted recipe, seed, and route intent do
not need to change merely because the visuals changed.

## Acceptance requirements

An AI-assisted authoring workflow is acceptable only when:

- the resulting recipe is readable and editable without AI;
- the recipe passes the same validation as a manually written recipe;
- accepted recipes can regenerate offline;
- recipe changes are visible as structured diffs;
- generation failures remain honest and actionable;
- TileForge access remains package-based and read-only;
- the user retains approval over accepted baselines and dependency upgrades.
