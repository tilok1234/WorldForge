# WorldForge Architecture and Contracts

Status: **Draft architecture**

## Architectural principle

WorldForge compiles high-level intent into semantic world data. Tile resolution
is a final adapter stage.

The reusable core must not import `engine.js`, depend on TileForge repository
paths, or reproduce undocumented TileForge internals. Developers and agents may
inspect or download TileForge to understand provenance, but runtime and build
contracts remain package-based.

## Proposed component model

### 1. Configuration loader

Loads and validates:

- world seed;
- generator version;
- world dimensions;
- chunk dimensions;
- macro-field parameters;
- biome definitions;
- route and settlement budgets;
- enabled generation passes;
- pinned TileForge package identity for compatibility tests.

Invalid configuration fails before generation.

### 2. Coordinate and hash kernel

Provides:

- canonical world, region, and chunk coordinate conversions;
- floor division that behaves correctly for negative coordinates;
- stable named hash channels;
- deterministic sampling;
- generator-version awareness.

No generation pass creates its own ad hoc random-number implementation.

### 3. Global world planner

Creates the world-scale plan:

- world bounds;
- region graph;
- major elevation structure;
- major water outlets and basins;
- settlement candidates;
- landmark slots;
- major route goals;
- optional progression or difficulty bands.

This pass establishes global coherence before chunk compilation.

### 4. Macro field compiler

Produces inspectable fields such as:

- elevation;
- moisture;
- temperature;
- drainage;
- fertility;
- corruption or other game-defined pressure;
- biome suitability;
- traversal cost.

Fields are inputs to region classification, not the complete world design.

### 5. Hydrology compiler

Resolves:

- coast or world-edge drainage;
- lakes and basins;
- river sources and paths;
- wetlands;
- crossings and invalid water topology.

Rivers should follow a coherent drainage model. Purely decorative water can be
a separate pass.

### 6. Region and biome compiler

Converts fields and authored constraints into named regions and transition
zones. It must avoid one-cell biome confetti and hard accidental rectangles.

### 7. Infrastructure planner

Builds graph-backed:

- roads;
- paths;
- bridges and fords;
- settlement connections;
- district routes;
- world exits and landmark approaches.

Routes exist because they connect destinations. Decorative tracks are a
separate, lower-priority layer.

### 8. Settlement and landmark planner

Places atomic plans with:

- anchor coordinate;
- footprint;
- orientation;
- substrate requirements;
- access requirements;
- reserved approach space;
- tags and ownership;
- optional authored semantic stamp.

### 9. Chunk semantic compiler

Compiles the global plan into chunk-local layers with a halo. The chunk is not
allowed to invent incompatible macro geography.

### 10. Decoration compiler

Places vegetation, props, decals, resources, and ambient features from named,
independent deterministic channels.

Decoration occurs after traversal-critical structure and never blocks required
routes without an explicit rule.

### 11. TileForge adapter

Consumes:

- semantic WorldForge layers;
- a pinned TileForge manifest and integration contract.

Produces:

- TileForge material and typed-layer codes;
- masks and underlays;
- stable semantic tile IDs;
- optional TMJ or Godot-ready chunk data;
- compatibility and resolution diagnostics.

The adapter owns TileForge-specific interpretation. The core does not.

### 12. Validator and visualizer

Runs structural checks and produces:

- world overview;
- elevation and drainage view;
- biome map;
- route graph;
- settlement/landmark map;
- chunk-boundary view;
- TileForge-resolved reference slice;
- machine-readable validation report.

## Suggested repository structure

```text
worldforge/
  AGENTS.md
  README.md
  docs/
    VISION_AND_SCOPE.md
    REPOSITORY_BOUNDARIES.md
    ARCHITECTURE_AND_CONTRACTS.md
    GENERATION_RULES.md
    ROADMAP.md
  src/
    core/
    fields/
    hydrology/
    regions/
    routes/
    settlements/
    chunks/
    decoration/
    validation/
    adapters/
      tileforge/
      godot/
  schemas/
  fixtures/
    worlds/
    tileforge-contract/
  tools/
  tests/
  outputs/              # generated, ignored by default
```

## World artifact contract

A readable first format might contain:

```json
{
  "formatVersion": 1,
  "generator": {
    "name": "worldforge",
    "version": "0.1.0",
    "seed": 103991
  },
  "dimensions": {
    "width": 256,
    "height": 256,
    "chunkWidth": 32,
    "chunkHeight": 32
  },
  "dependencies": {
    "tileforge": {
      "packageSha256": "<sha256>",
      "manifestFormat": 1
    }
  },
  "regions": [],
  "settlements": [],
  "landmarks": [],
  "routes": [],
  "chunks": [
    {
      "coord": [0, 0],
      "layers": {
        "material": [],
        "elevation": [],
        "road": [],
        "river": [],
        "structure": [],
        "prop": [],
        "decal": []
      }
    }
  ]
}
```

The exact encoding is draft. The principles are not:

- Version every artifact.
- Record dependency identities.
- Keep semantic meaning separate from resolved atlas positions.
- Make array dimensions and coordinate origin explicit.
- Preserve enough source data to regenerate derived output.

## Semantic identity

Internally, prefer stable readable keys:

```text
terrain.grass
terrain.shallow_water
route.road
route.dirt_path
structure.town_hall
prop.oak
decal.frost
```

The TileForge adapter maps these to IDs declared by the pinned package. Do not
copy the package's numeric tables into WorldForge source.

Unknown semantic keys must be reported. They must not silently become soil,
empty cells, or atlas tile zero.

## Determinism contract

Generation identity is:

```text
world seed
+ WorldForge generator version
+ normalized configuration
+ rule-pack versions
+ pinned dependency identities
```

Every pass uses a named channel, for example:

```text
macro.elevation
macro.moisture
hydrology.river_sources
routes.primary
settlement.candidates
decor.oak
decor.rocks
encounter.slots
```

Adding `decor.flowers` must not reshuffle roads, settlements, rocks, or other
decoration channels.

## Chunk contract

- Chunk coordinates use one documented origin and axis convention.
- Semantic generation reads the global world plan.
- Mask-producing layers compile with at least a one-cell halo.
- The halo is discarded only after masks and neighbor-derived values resolve.
- Chunk results must be independent of generation order.
- Loading chunk A before B must produce the same A and B as loading B before A.
- Borders are validated against adjacent chunks before release.

## TileForge integration contract

WorldForge must read, not guess:

- `manifest.formatVersion`;
- `manifest.mappings`;
- family semantic IDs;
- selector and tone rules;
- material transition mappings;
- typed network mappings;
- structure footprints and pass cells;
- animation and walkability metadata.

WorldForge must honor the packaged `GAME-GUIDE.md` and `FORMATS.md` for the
pinned release.

WorldForge must not:

- hard-code atlas coordinates;
- stamp region interiors across boundaries;
- replace semantic IDs with positional tile IDs in the core world model;
- use Godot terrain painting as a substitute for cross-material rules;
- treat a TileForge source checkout as a runtime dependency.

## Versioning and migrations

WorldForge should distinguish:

- world artifact format version;
- generator behavior version;
- rule-pack version;
- adapter version;
- TileForge dependency version.

A generator behavior change does not silently rewrite an existing world.
Existing saves remain pinned or go through an explicit migration/rebuild
decision.

## Required validation surfaces

Before a generated world is accepted:

- identical inputs reproduce identical output;
- all chunks cover the world exactly once;
- adjacent chunk borders agree;
- regions meet minimum-area constraints;
- water topology has no unexplained uphill river segments;
- every required settlement connects to the route graph;
- required routes do not terminate without a destination;
- atomic footprints do not overlap;
- substrate requirements hold;
- required traversal remains possible;
- every semantic key resolves through the pinned TileForge adapter;
- a reference slice passes the TileForge rendering acceptance test.
