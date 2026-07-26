# ADR-0001: TypeScript for the WorldForge Core

Status: **Accepted**

Date: 2026-07-26

## Context

WorldForge needs an implementation language for its engine-neutral compiler,
command-line tools, schemas, deterministic tests, TileForge adapter, and
versioned JSON artifacts.

The first game integration target is Godot, followed by an official TypeScript
game-consumer lane. The reusable generator does not need to execute inside
either game runtime. TileForge is JavaScript-based and its public consumer
contract is primarily manifests, guides, and JSON-compatible data.

## Decision

Implement the WorldForge core and command-line tooling in TypeScript.

Compile and test it on a repository-pinned Node.js toolchain. The Godot adapter
and TypeScript game loader will consume versioned WorldForge artifacts. Sharing
the compiler's language does not make private generator modules part of the
TypeScript game API.

## Reasons

- Strong static typing supports explicit world, recipe, schema, and adapter
  contracts.
- TypeScript fits TileForge's JavaScript and JSON ecosystem without coupling
  WorldForge to TileForge source.
- Node.js is well suited to offline compilation, validation, debug rendering,
  and build-pipeline tooling.
- Generated artifacts can remain engine-neutral.
- Godot can use a thin importer/runtime adapter instead of hosting the complete
  generator.
- TypeScript games can use a typed artifact loader and optional build-time
  compiler invocation without a language bridge.
- The ecosystem supports property tests, golden fixtures, schema validation,
  and command-line packaging.

## Determinism constraints

Choosing TypeScript does not make JavaScript's default numeric behavior an
acceptable generation contract.

- Never use `Math.random()` for world generation.
- Use explicitly defined 32-bit integer operations for the initial hash kernel.
- Use `Math.imul` where 32-bit multiplication semantics are required.
- Normalize unsigned values with `>>> 0` at documented boundaries.
- Do not represent integers above JavaScript's safe integer range as `number`.
  Use bounded 32-bit values or an explicitly serialized `bigint` strategy.
- Do not use language-default object iteration as an implicit ordering rule.
- Do not use platform transcendental functions as random or classification
  primitives.
- Prefer integer or fixed-point field values. Pin and quantize any unavoidable
  floating-point noise before semantic decisions.
- Canonicalize JSON key ordering, numeric encoding, UTF-8 text, and newlines.
- Pin the supported Node.js, TypeScript, dependency, and package-manager
  versions in the repository.
- Protect the kernel and complete small-world artifact with golden vectors on
  every supported platform.

## Consequences

### Positive

- WorldForge can begin with a small, portable CLI and test suite.
- The TileForge package adapter can consume manifests without a language bridge.
- AI and manual authoring clients can share JSON Schema-backed recipes.
- Game projects receive stable artifacts instead of generator internals.
- Godot and TypeScript consumers can share schemas, fixtures, and parity tests.

### Tradeoffs

- Runtime generation directly inside Godot is not the first architecture.
- Runtime generation inside a shipped TypeScript game is also not required by
  the first consumer adapter.
- JavaScript numeric edge cases require explicit discipline and tests.
- A shipped game that needs live generation will need a service, embedded
  runtime, pre-generated artifacts, or a future port of the deterministic
  kernel.

## Alternatives considered

### C#

Strong choice for generation running directly inside Godot or another .NET
runtime. Not selected for the first release because offline generation and JSON
tooling are the current priority.

### Rust

Strong determinism and performance properties, but adds build and integration
complexity before WorldForge has proven its smallest useful slice.

### Python

Fast for experimentation, but weaker for the intended typed public contracts
and easier to vary accidentally across environments and numeric dependencies.

## Revisit conditions

Revisit this decision only if measured requirements show that:

- generation must run inside the shipped Godot process;
- TypeScript cannot meet an established performance budget;
- cross-platform golden vectors cannot be maintained;
- a shared native kernel becomes necessary for multiple runtimes.

A revisit requires a new ADR and compatibility plan. It must not silently
change existing world identities.
