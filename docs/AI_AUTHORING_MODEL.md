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
| WorldRecipe | Accepted, portable description of the requested world |
| WorldForge | Deterministic generation, validation, and world artifacts |
| TileForge | Tile semantics, visual construction rules, and released packages |
| Game adapter | Loading, streaming, and presenting the generated artifact |

AI output is a proposal until it passes schema validation and any required user
approval. A conversation transcript is not the world specification.

## Authoring paths

WorldForge supports two equivalent paths:

```text
Human or tool writes settings ──────────────┐
                                            ├─> validated WorldRecipe
Human describes intent -> AI drafts settings┘
```

Both paths enter the same configuration loader, normalizer, validators, and
generator. AI-authored recipes receive no hidden capabilities and bypass no
rules.

## Canonical workflow

```text
1. User intent
      ↓
2. Draft WorldRecipe
   (written manually or proposed by AI)
      ↓
3. Schema validation and normalization
      ↓
4. User review when the recipe or baseline requires approval
      ↓
5. Seeded deterministic generation
      ↓
6. Structural validation and debug views
      ↓
7. Optional AI explanation or recipe-diff proposal
      ↓
8. TileForge resolution and versioned game export
```

The AI revises the recipe, not the generated cells. Directly painting over a
failed generated artifact would hide the cause and break reproducibility.
Authored landmark stamps are an explicit exception because they are versioned
inputs with their own schema and validation.

## WorldRecipe

The exact schema will be versioned during Milestone W0. A conceptual example is:

```json
{
  "recipeFormat": 1,
  "seed": 12345,
  "world": {
    "size": "small",
    "climate": "cold_coastal"
  },
  "geography": {
    "mountainBias": "north",
    "requiredWatersheds": 1
  },
  "settlements": {
    "fishingVillages": 4,
    "towns": 1
  },
  "routes": {
    "requiredPrimaryRoutes": 2,
    "connectAllSettlements": true
  },
  "landmarks": [
    {
      "type": "ancient_fortress",
      "relation": "across_river_from_main_town"
    }
  ],
  "constraints": {
    "requireReachableLandmarks": true,
    "maximumDisconnectedRegions": 0
  }
}
```

Recipe fields describe semantic intent and measurable constraints. They do not
contain atlas coordinates, TileForge source paths, arbitrary executable code,
or instructions to weaken validators.

## Deterministic boundary

AI drafting may be nondeterministic. World generation may not be.

Reproducibility begins after a recipe has been:

1. schema-valid;
2. normalized;
3. saved;
4. assigned its generation identity.

The reproducible identity includes the normalized recipe, seed, WorldForge
generator version, rule-pack versions, and pinned dependency identities. The
original prose prompt may be stored as optional provenance, but it is not a
substitute for the accepted recipe.

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

## Iteration model

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
