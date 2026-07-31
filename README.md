# WorldForge

WorldForge is a deterministic semantic world generator for top-down games.

It plans what exists in a world—regions, terrain, elevation, hydrology, routes,
settlements, landmarks, structures, and decoration—then emits versioned semantic
world data that a game can stream and render.

WorldForge's core is procedural, not generative AI. AI is an optional authoring
layer that can translate a user's natural-language intent into a structured,
validated world recipe. The same recipe can be written manually and must
generate without an AI connection.

```text
User intent
    -> manual settings or optional AI-authored settings
    -> validated WorldRecipe containing the seed
    -> deterministic ResolvedWorldConfig
    -> deterministic WorldForge generation
    -> TileForge resolution
    -> versioned game artifact
```

The first visual integration target is TileForge, but the projects remain
strictly separate:

```text
TileForge package -> WorldForge semantic generation -> game runtime
```

## Official game consumer lanes

WorldForge is intended to support multiple games rather than one permanent game
project. Its engine-neutral artifact is the shared boundary:

```text
                               ┌─> Godot adapter -> Godot game
WorldForge versioned artifact ─┤
                               └─> TypeScript loader -> TypeScript game
```

- **Godot** is the first playable integration target. A thin importer and
  runtime adapter load chunks, TileForge-resolved layers, and metadata.
- **TypeScript games** are the second official consumer lane. A typed loader
  validates and exposes the same artifact without requiring a Godot bridge.
- Both consumers use the same base artifact and semantic identities.
- TypeScript games do not bypass the artifact contract merely because the
  WorldForge compiler is also written in TypeScript.
- Production recipes, authored landmarks, quests, enemies, and other
  game-specific content belong to the consuming game or its versioned content
  pack by default.

Initial generation remains an offline or build-time step. In-process runtime
generation can be considered later without changing the artifact contract.

## Absolute TileForge boundary

WorldForge agents may browse, inspect, clone, or download TileForge as read-only
reference material. They must never edit TileForge source, generate output into
a TileForge checkout, commit or push TileForge changes, or treat TileForge
internals as the WorldForge runtime contract.

WorldForge implements against a pinned exported TileForge package:

- `tileforge-manifest.json`
- `GAME-GUIDE.md`
- `FORMATS.md`
- the packaged importers and reference artifacts

The first approved complete package is committed under
`fixtures/tileforge-packages/<package-id>/` so a clean WorldForge clone can
reproduce compatibility tests without access to TileForge source. Source
checkouts remain external, ignored, and read-only.

See [Repository Boundaries](docs/REPOSITORY_BOUNDARIES.md) for the complete
policy.

## Project status

**All planned milestones (W0–W9) are complete and the generator is in
production for the Wildshot game: the seed-2008 wildshot overworld ships as
versioned game-pack releases through a gated publish lane (doc 18) and the
game intakes them by tag + hash verification. Current state (2026-07-31):
behavior 76, TileForge adapter 9, pinned package dusk-9b8b2a2-seed103991
(roadTypes 1–8 + hand-authored road-joint transitions), path-layer
vocabulary 0..3 (trail / road / street bands), the standing no-diagonal-
roads rule (sl-0059), designer-approved settlement street webs, farming
towns, and eleven ratified scenery compositions. Both consumer lanes (Godot
+ TypeScript loader) verify cell-exact walkability parity on every release.
`HANDOFF.md` carries live session state — its top pointer is the resume
authority.**

The intended first release is a small finite seeded world that:

- regenerates byte-for-byte from the same inputs;
- contains coherent terrain, water, routes, and settlements;
- streams in chunks without border seams;
- emits semantic data rather than atlas coordinates;
- resolves a reference slice through a pinned TileForge package;
- passes deterministic, topology, overlap, and integration checks.

## Required reading

Developers and AI agents should read:

1. [AGENTS.md](AGENTS.md)
2. [Vision and Scope](docs/VISION_AND_SCOPE.md)
3. [Repository Boundaries](docs/REPOSITORY_BOUNDARIES.md)
4. [Architecture and Contracts](docs/ARCHITECTURE_AND_CONTRACTS.md)
5. [AI Authoring Model](docs/AI_AUTHORING_MODEL.md)
6. [Generation Rules](docs/GENERATION_RULES.md)
7. [Starter Roadmap](docs/ROADMAP.md)
8. [ADR-0001: TypeScript](docs/decisions/ADR-0001-typescript.md)

Boundary and agent rules override convenience and implementation shortcuts.

## System ownership

| System | Responsibility |
|---|---|
| User | Creative intent, constraints, review, and approval |
| AI authoring client | Optional translation of intent into draft WorldRecipes |
| WorldRecipe | Accepted authoring intent, including the world seed |
| ResolvedWorldConfig | Deterministically derived generator parameters |
| TileForge | Tile art, masks, atlases, semantic tile IDs, integration package |
| WorldForge | Recipe validation, world planning, deterministic generation, chunks, compatibility adapter |
| Godot adapter | Imports and streams the public artifact in Godot |
| TypeScript loader | Validates and exposes the public artifact to TypeScript games |
| Game | Runtime streaming, gameplay, combat, quests, persistence |

## Initial design principles

- Semantic meaning comes before visual tile resolution.
- The same inputs must reproduce the same world.
- Noise shapes terrain; graphs and constraints create purpose.
- Chunks consume one global plan rather than becoming isolated worlds.
- Every major pass must be inspectable and testable.
- TileForge is a pinned external dependency, never an editable subproject.
- AI-authored and manually authored settings use the same schema and validators.
- Accepted worlds regenerate offline without requiring an AI model.
- Godot and TypeScript games consume the same engine-neutral artifact.
- Game-specific content attaches through extensions instead of entering the
  reusable core.

## Planned first vertical slice

An 8×8-chunk demonstration world with four terrain identities, one watershed,
one town, one outpost, one connected road and crossing, one major landmark, a
debug map, deterministic rebuild proof, and a Godot traversal scene.
