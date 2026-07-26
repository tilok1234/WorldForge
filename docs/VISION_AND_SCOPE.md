# WorldForge Vision and Scope

Status: **Draft**

Implementation language: **TypeScript**, adopted in
`decisions/ADR-0001-typescript.md`.

## Concept identity

WorldForge is a deterministic, reusable world-planning and world-generation
compiler for top-down games.

It creates worlds with understandable geography and intentional relationships:
rivers flow through terrain, roads connect actual destinations, settlements
occupy plausible sites, landmarks have spatial purpose, and streamed chunks
remain consistent with the world around them.

WorldForge is not a replacement for authored design. It combines procedural
systems, constraints, and authored rules into a reproducible world plan that
can be inspected, tested, regenerated, and extended.

AI may provide a natural-language authoring interface, but it is not the world
generator. It proposes structured settings that enter the same validated,
deterministic pipeline as settings written by a person, editor, script, or test.

## The problem it solves

TileForge supplies a rich visual vocabulary, but a tileset does not decide:

- where biomes belong;
- how water crosses the world;
- why a road exists;
- where settlements are viable;
- how landmarks relate to travel;
- which areas are dense, sparse, safe, hazardous, or important;
- how an open world streams without visible chunk seams;
- how the same world can be regenerated from a seed.

WorldForge supplies that missing semantic and spatial layer.

## Full vision

The long-term system can produce:

- finite seeded overworlds;
- macro elevation, moisture, temperature, and corruption fields;
- biome regions with coherent borders and transition zones;
- watersheds, lakes, rivers, coastlines, wetlands, and crossings;
- route graphs connecting settlements, landmarks, resources, and exits;
- settlements assembled from districts and local constraints;
- authored landmark chunks blended into procedural surroundings;
- structure and prop placement with substrate and spacing rules;
- encounter, resource, navigation, and spawn metadata;
- minimap and debugging representations;
- chunk-streamable semantic data;
- deterministic rebuilds and generator-version migrations;
- official consumer adapters for Godot and TypeScript games;
- optional AI-assisted translation of creative briefs into validated recipes;
- structured recipe diffs and validation explanations for iterative design;
- compatibility with multiple visual packages through explicit adapters.

## Design pillars

### 1. Semantic first

World data describes meaning before appearance. A cell is grass, shallow water,
a road corridor, a settlement lot, or a structure anchor before it is an atlas
coordinate.

### 2. Deterministic by contract

The same world seed, generator version, configuration, and dependency versions
must produce the same world. Determinism is tested, not assumed.

### 3. Coherence over noise

Noise may shape terrain, but graphs and constraints create purpose. Rivers,
roads, settlements, and landmarks must have causes and destinations.

### 4. Inspectable generation

Every major pass produces data that can be visualized and validated. A failed
world should explain which constraint failed and where.

### 5. Streamable without seams

Chunking is a storage and runtime concern, not a license to generate isolated
mini-worlds. Every chunk must agree with the same global world plan.

### 6. External visual dependency

TileForge is consumed through a pinned package contract. WorldForge never
modifies TileForge and never depends on undocumented TileForge internals.

### 7. Reusable core, game-specific extensions

Terrain and settlement planning can be reused. Quests, enemy populations,
economy, faction control, and progression logic can attach through extension
interfaces owned by the game.

### 8. AI translates intent; WorldForge owns generation

AI is an optional authoring client. Its output is a draft until it becomes a
schema-valid, normalized `WorldRecipe`. The recipe includes the seed and compiles
deterministically into a fully explicit `ResolvedWorldConfig`. The accepted
recipe, recipe-compiler version, generator version, rules, and pinned
dependencies—not a chat transcript or separately edited configuration—define
the world. WorldForge must regenerate that world offline without an AI model.

### 9. One artifact, multiple games

WorldForge emits one engine-neutral, versioned artifact. Godot and TypeScript
games consume that artifact through separate public adapters. Sharing
TypeScript with one consumer does not permit that game to depend on private
generator modules. Game-specific recipes, authored content, and gameplay
systems remain outside the reusable core.

## Intended player-facing result

Although WorldForge is a developer tool, its quality is measured in play:

- The player can understand where they are.
- Roads and rivers guide travel naturally.
- Regions have recognizable spatial identities.
- Settlements feel connected to terrain and resources.
- Landmarks create orientation and reasons to explore.
- Re-entering a chunk never changes its unexplained visual identity.
- Procedural space does not feel like endless undirected texture.

## Core generation loop

```text
User intent
    -> manual recipe or optional AI-authored draft
    -> validated and normalized WorldRecipe
    -> deterministic recipe compiler
    -> ResolvedWorldConfig
    -> generator version + pinned dependencies
    -> global world graph
    -> macro fields and regions
    -> hydrology
    -> routes and crossings
    -> settlement and landmark plans
    -> semantic chunk grids
    -> structures and decoration
    -> validation
    -> TileForge-compatible resolution
    -> versioned world artifact
```

## Goals

- Generate a coherent finite world before pursuing infinite generation.
- Keep output engine-neutral until the adapter layer.
- Make the complete world reproducible from a small configuration.
- Support deterministic chunk streaming.
- Make integration safe for AI-assisted game development.
- Let AI help express and revise intent without becoming a runtime dependency.
- Make accepted recipes readable and editable without AI.
- Preserve authored landmark and override lanes.
- Provide automated evidence for topology and visual-integration correctness.
- Allow future games to reuse the generator without inheriting one game's lore.
- Prove the same artifact can be consumed by Godot and TypeScript games without
  changing its semantic meaning.

## Non-goals

WorldForge does not:

- create, recolor, repair, or regenerate TileForge art;
- edit the TileForge repository;
- copy TileForge engine source into WorldForge;
- own player movement, combat, quests, dialogue, inventory, or saving;
- decide final game balance;
- generate actors, animations, weapons, or interface art;
- use raw atlas coordinates as its world model;
- promise every generated world is automatically fun without review;
- begin with planet-scale simulation, multiplayer authority, or infinite terrain;
- hide invalid output behind best-effort silent correction.
- require an AI model to generate, load, or replay an accepted world;
- treat a prose prompt or conversation transcript as the canonical world file;
- allow AI-generated settings to bypass normal validation.
- make a consuming game depend on private WorldForge compiler internals;
- place one game's quests, enemies, progression, or lore in the reusable core.

## Product boundaries

| Concern | Owner |
|---|---|
| Creative direction and acceptance | User |
| Natural-language-to-recipe drafting | Optional AI authoring client |
| Accepted world intent and seed | Versioned WorldRecipe |
| Explicit generator parameters | Derived ResolvedWorldConfig |
| Tile art, masks, atlases, semantic tile IDs | TileForge |
| World regions, terrain meaning, routes, settlements | WorldForge |
| Semantic-to-TileForge resolution | WorldForge adapter using the public package |
| Godot artifact loading and streaming | Godot consumer adapter |
| TypeScript artifact loading and typed access | TypeScript consumer loader |
| Streaming and runtime rendering | Consuming game |
| Combat, quests, enemies, loot, progression | Game |
| Actor and equipment art | Separate sprite systems |

## Strongest first playable slice

The first meaningful demonstration should be one small finite world containing:

- four connected biome or terrain identities;
- one watershed with a lake or coast and one river;
- one town and one smaller outpost;
- one main road with a bridge or ford;
- one dungeon or major landmark;
- streamed chunks;
- a minimap/debug view;
- a deterministic rebuild test;
- a Godot scene in which the player can traverse the generated route.

## Biggest design risks

1. Generating attractive noise without meaningful geography.
2. Mixing TileForge rendering rules into the world-planning core.
3. Letting chunk boundaries become generation boundaries.
4. Allowing new passes to reshuffle unrelated existing content.
5. Expanding into quests, simulation, or an editor before the core world
   compiler is stable.
6. Confusing an AI-authored prompt with the reproducible world specification.

## Draft decisions still open

- Canonical world and chunk dimensions.
- World artifact encoding: readable JSON first, compact binary later.
- Exact extension interface for game-specific content.
- Whether authored landmarks use raw semantic stamps, scenes, or both.
