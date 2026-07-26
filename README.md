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
    -> validated WorldRecipe + seed
    -> deterministic WorldForge generation
    -> TileForge resolution
    -> versioned game artifact
```

The first visual integration target is TileForge, but the projects remain
strictly separate:

```text
TileForge package -> WorldForge semantic generation -> game runtime
```

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

See [Repository Boundaries](docs/REPOSITORY_BOUNDARIES.md) for the complete
policy.

## Project status

**Documentation and architecture foundation. TypeScript has been selected for
the engine-neutral compiler and command-line tools. Runtime implementation has
not started.**

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
| TileForge | Tile art, masks, atlases, semantic tile IDs, integration package |
| WorldForge | Recipe validation, world planning, deterministic generation, chunks, compatibility adapter |
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
- Game-specific content attaches through extensions instead of entering the
  reusable core.

## Planned first vertical slice

An 8×8-chunk demonstration world with four terrain identities, one watershed,
one town, one outpost, one connected road and crossing, one major landmark, a
debug map, deterministic rebuild proof, and a Godot traversal scene.
