# WorldForge Starter Roadmap

Status: **Draft**

This roadmap deliberately begins with a small, testable compiler. Later systems
remain gated until the foundation proves deterministic and integrable.

## Adopted implementation direction

TypeScript is the adopted language for the engine-neutral compiler and CLI. See
`decisions/ADR-0001-typescript.md`.

Status 2026-07-26 (late session): W0–W6 complete and approved; W7 and W8
functionally complete with machine-verified evidence (entry gates, §4
acceptance, playable streamed Godot slice, public TS loader with cell-exact
walkability parity, viewer on the loader); the current look is a PROVISIONAL
baseline — formal visual approval deferred to the end-of-plan polish round.
W9 tooling is implemented (brief validation, recipe explanation, structured
diffs, candidate comparison, recorded approval states). Remaining before the
plan closes: the user's windowed Godot playthrough, the end-of-plan polish
round, and formal visual baseline approval. Earlier per-milestone status: Two W6 exit criteria transfer to
the W7 entry gate and must not quietly vanish: (1) the reference slice passing
the TileForge acceptance procedure through the packaged Godot importer per the
guide map-reference method; (2) chunk-border matching at resolution level —
mask/underlay agreement across seams, not just raw grids. Standing W7
native-scale check: if the resolved town reads as a row of boxes, W5.1 is
footprint variety (package cottage/tavern/smithy/chapel/manor pool) and plaza
legibility. Flat elevation is accepted, flagged future work.

## Milestone W0 — Repository and contracts

Deliverables:

### W0A — Authoring and toolchain foundation

- independent WorldForge repository;
- repository-local `AGENTS.md`;
- adopted vision, boundary, architecture, and generation documents;
- TypeScript project, test, and CLI skeleton using a pinned toolchain;
- source, test, fixture, schema, and output directories;
- canonical W0 `WorldRecipe` schema limited to seed, named presets, integer
  counts, integer biases, budgets, and supported toggles;
- one canonical recipe example usable through manual or AI authoring;
- versioned recipe compiler and `ResolvedWorldConfig` schema;
- documented AI authoring boundary;
- normalized recipe and resolved-config identity;
- no-write path guard for TileForge and external repositories;
- walking-skeleton pipeline: one trivial recipe flows recipe →
  `ResolvedWorldConfig` → generation → artifact → validation end to end using
  stub passes;
- cross-platform continuous integration (Windows, Linux, macOS) running build,
  tests, and golden fixtures on the pinned toolchain;
- minimal command-line entry point.

### W0B — Real package grounding

- dependency-lock schema;
- explicit import of one real user-selected TileForge release package into
  `fixtures/tileforge-packages/<package-id>/`;
- dependency lock generated from that real package;
- approved complete package committed for clean-clone reproducibility;
- package preflight for validation, unexpected secrets, source-control metadata,
  and host file-size limits.

Exit criteria:

- a smoke command runs;
- invalid output roots are rejected;
- a TileForge repository path cannot be used as an output;
- recipe normalization and resolved-config compilation are deterministic;
- the same recipe normalizes identically regardless of authoring client;
- normalized recipe plus compiler version produces byte-identical
  `ResolvedWorldConfig`;
- an accepted recipe can validate and resolve without any AI connection;
- unsupported fields, including premature relational constraints, fail
  validation;
- the walking-skeleton artifact regenerates byte-identically on every CI
  platform;
- the real package manifest and required guides can be read without relying on
  TileForge source internals;
- the dependency lock detects a changed package or manifest;
- a clean clone contains the complete pinned compatibility package;
- repository ownership rules are documented.

## Milestone W1 — Deterministic kernel

Deliverables:

- coordinate conventions;
- fixed-width integer hash primitives and documented wrapping behavior;
- fixed-point or explicitly pinned numeric field policy;
- named hash channels;
- deterministic sampling utilities;
- canonical artifact serialization;
- generator identity calculation;
- world and chunk coordinate conversions;
- cross-platform golden vectors;
- fixture snapshot framework.

Exit criteria:

- repeated runs are byte-identical;
- every supported platform reproduces the kernel and small-world golden vectors;
- generation order does not alter channel results;
- threshold classifications do not drift from floating-point differences;
- negative-coordinate tests pass if negative coordinates are supported;
- adding a new test channel does not change existing channels.

## Milestone W2 — Finite macro world

Deliverables:

- finite world bounds;
- elevation, moisture, and temperature fields;
- initial region/biome classifier;
- macro debug render;
- seed-sweep contact-sheet tool rendering many seeds into one review grid;
- region-size and fragmentation validator.

Exit criteria:

- four readable terrain identities;
- no accidental one-cell biome confetti above the configured limit;
- the same seed reproduces the same macro map;
- field data is inspectable independently of TileForge.

## Milestone W3 — Hydrology

Deliverables:

- drainage calculation;
- at least one lake, coast, or outlet;
- river source and routing pass;
- wetlands or shoreline classification;
- hydrology debug render and topology report.

Exit criteria:

- rivers have sources and destinations;
- no unexplained orphan segments;
- chunk borders agree on water data;
- route-crossing candidates can be queried.

## Milestone W4 — Route graph and semantic corridors

Deliverables:

- destination graph;
- primary road routing;
- local dirt-path routing;
- bridge/ford candidate selection;
- TileForge-compatible road corridor semantics;
- connectivity and detour validators;
- interactive read-only artifact viewer v1 — single-file, no-build browser
  tool loading the world artifact: pan/zoom, layer toggles (fields,
  hydrology, biomes, routes, placements, chunk grid), hover inspection.
  Read-only by contract; the graphical world editor stays deferred. Static
  debug renders remain the evidence format for W2-W3 and for reports.

Exit criteria:

- every required destination is connected;
- routes cross water only at valid crossings;
- country roads include supporting corridors;
- mixed road junction rules are represented;
- decoration cannot sever required paths;
- the read-only viewer opens a generated world artifact in a browser and
  renders material, elevation, river, path, route, and chunk-grid layers with
  hover inspection, without any capability to write world data.

## Milestone W5 — Settlements and landmark stamps

Deliverables:

- settlement candidate scoring;
- one town and one outpost plan;
- districts or lots;
- atomic structure placement;
- entrance and approach reservations;
- one authored landmark stamp with procedural blending;
- versioned relational-placement vocabulary backed by the implemented solver.

Exit criteria:

- footprints do not overlap;
- required entrances are reachable;
- settlement purpose relates to geography;
- landmark blending does not form an unexplained hard rectangle;
- the same plan resolves identically across generation order.

## Milestone W6 — TileForge adapter

Deliverables:

- pinned-package importer and lock;
- manifest compatibility validation;
- semantic-key mapping;
- masks, underlays, typed networks, structures, props, and layer resolution;
- chunk halo compilation;
- reference output in a package-supported format.

Exit criteria:

- no hard-coded atlas coordinates;
- all semantic keys resolve;
- adjacent chunks produce matching border resolution;
- a reference slice passes the TileForge acceptance procedure;
- no file in the TileForge repository changes.

## Milestone W7 — Godot consumer vertical slice

Deliverables:

- Godot runtime adapter;
- streamed 8×8-chunk demonstration world;
- player traversal;
- minimap/debug overlays;
- persistence of explicit world deltas;
- headless or repeatable integration check.

The slice should contain:

- four terrain or biome identities;
- one river and crossing;
- one town;
- one outpost;
- one dungeon or major landmark;
- one connected primary route;
- visible chunk loading without border seams.

Exit criteria:

- the world loads from a versioned artifact;
- re-entered chunks remain stable;
- the player can traverse the required route;
- TileForge metadata drives walkability and hazards correctly;
- a clean checkout can reproduce the demonstration.

## Milestone W8 — TypeScript game consumer

Deliverables:

- typed public artifact loader;
- artifact, generator, and dependency compatibility validation;
- typed world, chunk, layer, route, and metadata access;
- chunk query or streaming interface suitable for TypeScript games;
- build-time CLI integration example;
- small TypeScript traversal or inspection harness using the W7 world;
- cross-consumer parity fixture and report;
- artifact viewer migrated onto the public loader, so opening a world in the
  viewer also exercises the consumer contract.

Exit criteria:

- the Godot and TypeScript consumers load the same base world artifact;
- both agree on artifact hash, chunk coordinates, semantic IDs, walkability,
  and required-route topology;
- incompatible artifact or dependency versions fail clearly;
- the TypeScript consumer does not import private generator-pass modules;
- consumer-specific caches identify their base artifact and adapter version;
- no game-specific quest, enemy, progression, or lore system enters the core.

Runtime generation inside a shipped TypeScript game is not required for this
milestone. The first lane is artifact loading plus optional build-time compiler
invocation.

## Milestone W9 — Optional AI authoring workflow

Deliverables:

- natural-language intent brief format;
- AI-assisted draft recipe flow;
- human-readable recipe explanation;
- structured recipe-diff proposals;
- validator-feedback-to-revision loop;
- comparison summary for two generated candidates;
- clear approval state for accepted recipes and visual baselines.

Exit criteria:

- AI and manual authoring use the same public recipe schema;
- invalid AI suggestions fail before generation;
- accepted recipes regenerate offline and without model access;
- the user can inspect every proposed recipe change;
- AI cannot bypass validators or modify generated artifacts as a hidden repair;
- TileForge remains a pinned, read-only package dependency.

## Deferred beyond the initial consumer proofs

- infinite worlds;
- multiplayer synchronization;
- planet-scale climate;
- full procedural interiors;
- quest and narrative generation;
- enemy population simulation;
- faction territory simulation;
- economy simulation;
- graphical world editor (the read-only artifact viewer, W4, is in scope —
  editing is what stays deferred);
- runtime AI as a requirement for generation or loading;
- in-process runtime generation inside shipped Godot or TypeScript games;
- Unity support;
- automatic TileForge upstream changes;
- multiple simultaneous TileForge packages.

## Review note

Strongest playable first slice:

> A compact finite world with one watershed, two settlements, one landmark,
> and a road that proves coherent world planning and seamless TileForge chunk
> resolution.

Biggest unresolved risk:

> Mixing world planning and tile resolution too early, producing a generator
> that looks correct with one tileset but cannot explain or reuse its own world
> semantics.

What should not be treated as final:

- file formats beyond versioning principles;
- world and chunk dimensions;
- biome list;
- game-specific content interfaces;
- performance budgets before profiling.
