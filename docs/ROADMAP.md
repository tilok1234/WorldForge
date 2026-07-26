# WorldForge Starter Roadmap

Status: **Draft**

This roadmap deliberately begins with a small, testable compiler. Later systems
remain gated until the foundation proves deterministic and integrable.

## Milestone W0 — Repository and contracts

Deliverables:

- independent WorldForge repository;
- `AGENTS.md` derived from `AI_AGENT_RULES.md`;
- adopted vision, boundary, architecture, and generation documents;
- source, test, fixture, schema, and output directories;
- normalized configuration schema;
- dependency-lock schema;
- no-write path guard for TileForge and external repositories;
- minimal command-line entry point.

Exit criteria:

- a smoke command runs;
- invalid output roots are rejected;
- a TileForge repository path cannot be used as an output;
- configuration normalization is deterministic;
- repository ownership rules are documented.

## Milestone W1 — Deterministic kernel

Deliverables:

- coordinate conventions;
- named hash channels;
- deterministic sampling utilities;
- generator identity calculation;
- world and chunk coordinate conversions;
- fixture snapshot framework.

Exit criteria:

- repeated runs are byte-identical;
- generation order does not alter channel results;
- negative-coordinate tests pass if negative coordinates are supported;
- adding a new test channel does not change existing channels.

## Milestone W2 — Finite macro world

Deliverables:

- finite world bounds;
- elevation, moisture, and temperature fields;
- initial region/biome classifier;
- macro debug render;
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
- connectivity and detour validators.

Exit criteria:

- every required destination is connected;
- routes cross water only at valid crossings;
- country roads include supporting corridors;
- mixed road junction rules are represented;
- decoration cannot sever required paths.

## Milestone W5 — Settlements and landmark stamps

Deliverables:

- settlement candidate scoring;
- one town and one outpost plan;
- districts or lots;
- atomic structure placement;
- entrance and approach reservations;
- one authored landmark stamp with procedural blending.

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

## Milestone W7 — Godot vertical slice

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

## Deferred until after W7

- infinite worlds;
- multiplayer synchronization;
- planet-scale climate;
- full procedural interiors;
- quest and narrative generation;
- enemy population simulation;
- faction territory simulation;
- economy simulation;
- graphical world editor;
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

- language choice;
- file formats beyond versioning principles;
- world and chunk dimensions;
- biome list;
- game-specific content interfaces;
- performance budgets before profiling.
