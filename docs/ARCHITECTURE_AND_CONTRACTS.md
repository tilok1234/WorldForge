# WorldForge Architecture and Contracts

Status: **Draft architecture**

Implementation language: **TypeScript**, adopted in
`decisions/ADR-0001-typescript.md`.

## Architectural principle

WorldForge compiles a validated `WorldRecipe` into a fully explicit
`ResolvedWorldConfig`, then compiles that configuration into semantic world
data. Tile resolution is a final adapter stage.

An optional AI authoring layer may translate high-level intent into a draft
recipe. It remains outside the deterministic compiler and cannot bypass the
configuration, validation, or approval contracts.

The reusable core must not import `engine.js`, depend on TileForge repository
paths, or reproduce undocumented TileForge internals. Developers and agents may
inspect or download TileForge to understand provenance, but runtime and build
contracts remain package-based.

## Proposed component model

### 0. Optional intent authoring layer

Accepts natural-language direction and may:

- draft a structured `WorldRecipe`;
- explain settings and constraints;
- propose a recipe diff after validation or visual review;
- preserve the user's accepted seed and constraints unless explicitly changed.

This layer is a client of WorldForge, not part of generation. WorldForge must
remain fully usable through files, a command line, tests, or a future editor
without an AI service.

### 1. Recipe loader and compiler

The public loader validates and normalizes author-facing recipe fields:

- recipe format version;
- world seed;
- named presets;
- integer counts, biases, and budgets supported by the current recipe version.

The versioned recipe compiler then resolves presets, defaults, and rule packs
into `ResolvedWorldConfig`, containing:

- generator behavior version;
- explicit world and chunk dimensions;
- macro-field parameters;
- biome definitions and thresholds;
- route, settlement, and landmark budgets;
- enabled generation passes;
- pinned TileForge package identity for compatibility tests.

Invalid recipes fail before resolution regardless of whether a person or AI
authored them. `ResolvedWorldConfig` is derived data and cannot be supplied as
an independent user override in the normal generation path.

### 2. Coordinate and hash kernel

Provides:

- canonical world, region, and chunk coordinate conversions;
- floor division that behaves correctly for negative coordinates;
- explicitly sized integer hash primitives with defined overflow behavior;
- stable named hash channels;
- deterministic sampling;
- fixed-point field helpers or a pinned deterministic numeric implementation;
- cross-platform golden vectors for hashes, samples, and field thresholds;
- generator-version awareness.

No generation pass creates its own ad hoc random-number implementation.

The TypeScript implementation follows ADR-0001: fixed-width integer behavior is
explicit, `Math.random()` is forbidden for generation, unsafe integers are not
stored as `number`, and supported toolchain versions are pinned.

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
- engine-neutral resolved chunk data;
- compatibility and resolution diagnostics.

The adapter owns TileForge-specific interpretation. The core does not.

### 12. Artifact writer and game consumers

The artifact writer emits one canonical, engine-neutral world artifact.

Official consumer lanes are:

- **Godot adapter:** imports the artifact into Godot resources, streams chunks,
  and maps declared metadata to engine behavior.
- **TypeScript loader:** validates formats and dependencies, exposes typed world
  and chunk access, and supports TypeScript game build pipelines and runtimes.

Both consumers read the same base artifact. They may create engine-specific
caches or import products, but every derivative records the base artifact hash
and consumer-adapter version. A consumer cannot mutate the base artifact or
reinterpret its semantic IDs.

The TypeScript loader is a public consumer package. It must not depend on
private generator-pass modules merely because the compiler shares its language.
Build-time tooling may invoke the public compiler API or CLI; shipped runtime
generation remains a later, explicit capability.

### 13. Validator and visualizer

Runs structural checks and produces:

- world overview;
- elevation and drainage view;
- biome map;
- route graph;
- settlement/landmark map;
- chunk-boundary view;
- TileForge-resolved reference slice;
- machine-readable validation report.

The visualizer matures into an **interactive artifact viewer** once layers
stack (planned at W4): a single-file, no-build browser tool in the spirit of
TileForge's workbench delivery style that loads a world artifact plus its
validation report and provides pan/zoom, per-layer toggles for the views
listed above, and hover inspection of cells, regions, routes, and placements.

The viewer is **read-only by contract**. It MUST NOT write, edit, or repair
world data — the graphical world *editor* remains deferred, and hand-edited
worlds would break the recipe-is-truth contract. Static debug renders remain
the milestone evidence format before the viewer exists (W2–W3) and stay
available afterward for reports and diffs. Once the public TypeScript loader
exists (W8), the viewer SHOULD run on that loader, so opening a world also
exercises the consumer contract.

## Suggested repository structure

```text
worldforge/
  AGENTS.md
  README.md
  docs/
    decisions/
      ADR-0001-typescript.md
    VISION_AND_SCOPE.md
    REPOSITORY_BOUNDARIES.md
    ARCHITECTURE_AND_CONTRACTS.md
    AI_AUTHORING_MODEL.md
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
    consumers/
      godot/
      typescript/
  schemas/
  fixtures/
    worlds/
    tileforge-packages/
      <package-id>/       # approved complete package, committed
  tools/
  tests/
  outputs/              # generated, ignored by default
```

## AI authoring contract

The interface between an AI authoring client and WorldForge is structured data,
not hidden prompt behavior.

```text
IntentBrief
    -> draft WorldRecipe
    -> schema validation
    -> normalized WorldRecipe
    -> versioned RecipeCompiler
    -> ResolvedWorldConfig
```

- `IntentBrief` may contain prose and optional provenance.
- A draft recipe is editable, reviewable, and allowed to fail validation.
- A normalized recipe is the canonical authored input and contains the seed.
- `ResolvedWorldConfig` is the fully explicit, deterministic compiler output.
- A future W9 authoring client expresses suggestions after generation as recipe
  diffs.
- AI never directly repairs generated chunks or resolved TileForge layers.
- The same normalized recipe must resolve and generate identically without AI
  access.

See `AI_AUTHORING_MODEL.md` for the complete responsibility and restraint model.

## Recipe and resolved configuration contract

WorldForge deliberately uses two layers with one source of truth:

| Layer | Purpose | Authored? |
|---|---|---|
| `WorldRecipe` | Portable creative intent, seed, presets, counts, integer biases, budgets | Yes |
| `ResolvedWorldConfig` | Concrete dimensions, thresholds, field parameters, enabled passes, dependency selection | No; deterministically derived |

The recipe compiler is versioned. It rejects vocabulary that its behavior
version does not implement. In particular, W0 recipes use presets, counts,
integer biases, budgets, and simple feature toggles. Relational constraints such
as “across the river from the main town” are invalid until W5 or a later
milestone introduces their schema and solver.

The normalized recipe and its compiler version are sufficient to derive the
resolved configuration. WorldForge records `recipeSha256` and
`resolvedConfigSha256` so drift can be diagnosed, but the resolved config never
becomes an independently edited authority.

## World artifact contract

A readable first format might contain:

```json
{
  "formatVersion": 1,
  "generator": {
    "name": "worldforge",
    "version": "0.1.0",
    "seed": 103991,
    "recipeCompilerVersion": 1,
    "recipeSha256": "<sha256>",
    "resolvedConfigSha256": "<sha256>"
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
- Keep the base artifact independent of Godot, browser, Node.js, and
  framework-specific object models.
- Require every consumer-specific derivative to record the base artifact hash
  and adapter version.

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
normalized WorldRecipe, including world seed
+ recipe compiler version
+ WorldForge generator version
+ rule-pack versions
+ pinned dependency identities
```

`resolvedConfigSha256` is recorded as a derived verification value. It is not a
second independent identity input.

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

AI model identity and prose wording are not part of deterministic generation.
Optional authoring provenance may record them, but the saved normalized recipe
is the reproducible input.

### Numeric determinism

Byte-for-byte reproduction is a cross-platform target, not merely a promise
about repeated runs on one machine.

- Coordinate hashing uses fixed-width integer operations with documented
  wrapping, signedness, and byte order.
- Generation does not use process-global randomness or language-default hash
  functions.
- Classification thresholds should consume integer or fixed-point values.
- If continuous noise requires floating point, WorldForge vendors or pins one
  implementation and quantizes its output before it changes semantic state.
- Platform math functions such as trigonometric or exponential functions are
  not used as implicit random or classification primitives.
- Canonical artifact serialization defines key ordering, number formatting,
  newline behavior, and text encoding.
- Golden vectors cover the hash kernel, field samples, threshold boundaries,
  normalized recipe hash, and complete small-world artifact.

If a platform cannot reproduce those vectors, it is incompatible with that
generator behavior version and must fail instead of emitting a subtly different
world.

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
- game-consumer adapter version;
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
- each implemented game consumer rejects incompatible artifacts;
- Godot and TypeScript consumers agree on the base fixture's chunk coordinates,
  semantic IDs, walkability, and artifact hash.
