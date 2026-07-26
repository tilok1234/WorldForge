# WorldForge Agent Rules

Status: **Normative repository instructions**

These instructions govern AI-assisted work in this repository.

## Required opening sequence

Before changing WorldForge, an AI agent must:

1. Confirm the exact WorldForge repository path.
2. Read repository instructions and the documents listed in `README.md`.
3. Inspect WorldForge Git status and recent history.
4. Identify user-owned or other-agent dirty work.
5. State the files and systems within the current task.
6. Confirm that no planned write resolves into the TileForge repository.

The adopted implementation language is TypeScript. Read
`docs/decisions/ADR-0001-typescript.md` before changing the core toolchain,
numeric kernel, or runtime boundaries.

TypeScript as the compiler language does not make generator internals a public
game API.

## Absolute TileForge rule

TileForge is read-only upstream.

The agent may browse TileForge, inspect the user's checkout, or clone/download a
reference copy. It may fetch or check out a requested revision in that
disposable reference copy. It must never edit TileForge source, generate output
inside a TileForge checkout, commit, push, clean, reset, or otherwise mutate the
authoritative TileForge repository.

If the user provides a TileForge repository path, treat that path as
inspection-only. A downloaded reference copy must also remain source-read-only
after it has been prepared. Prefer the exported package for implementation,
because that is the consumer contract.

If a diagnostic command would write build output or caches, run it against a
WorldForge-owned copy of the released package or in a WorldForge temporary
directory, not inside either TileForge checkout.

If a task appears to require a TileForge change:

1. Stop that branch of implementation.
2. Record the compatibility gap inside WorldForge.
3. Explain the evidence and smallest upstream request.
4. Ask the user to handle it as a separate TileForge task.

Do not make the change merely because filesystem permissions allow it.

This path works in practice: WorldForge needed a stable package identity for
its dependency lock, the request became a user-scoped TileForge task, and the
manifest `sourceCommit` field shipped upstream the same day (TileForge commit
`a5baf52`, 2026-07-26). Ask for the smallest upstream change; do not work
around the package.

## Scope discipline

- Modify only files required by the current WorldForge task.
- Preserve unrelated changes.
- Do not redesign settled contracts as incidental cleanup.
- Do not add gameplay systems to solve generator problems.
- Do not add TileForge art or rendering internals to solve adapter problems.
- Do not expand a milestone until its stated exit criteria pass.
- Treat generated worlds as outputs, not hand-edited source.

## Multi-game integration discipline

- Keep the versioned engine-neutral artifact as the boundary for both Godot and
  TypeScript games.
- Godot consumes the artifact through its importer/runtime adapter.
- TypeScript games consume it through a typed public loader, not unversioned
  imports from generator internals.
- Consumer-specific derived caches MUST identify their base artifact hash and
  adapter version.
- A consumer adapter MUST NOT reinterpret or silently change base semantic
  meaning.
- Keep production game recipes, authored content, quests, enemies, and
  progression in the consuming game or an explicitly versioned content pack by
  default.
- Do not write to a game repository unless the user separately scopes that
  repository and task.

## Source-of-truth discipline

- Treat the accepted normalized `WorldRecipe` as the source of truth for world
  intent; prose chat history is optional provenance, not the world contract.
- Treat `ResolvedWorldConfig` as deterministic derived data; do not maintain it
  as a second hand-authored source of truth.
- Read mappings from the pinned committed TileForge package manifest.
- Read rendering behavior from the package guide and formats.
- Do not invent numeric IDs, atlas coordinates, mask rules, or structure sizes.
- Keep WorldForge semantic schemas authoritative for world meaning.
- Keep the dependency lock authoritative for package identity.
- When docs and live code disagree, report the discrepancy; do not silently
  choose the more convenient behavior.

## AI authoring role

- AI may translate user intent into a draft recipe, explain results, and propose
  structured recipe diffs.
- AI-authored recipes use the same schema and validators as manual recipes.
- Do not embed essential world behavior only in a prompt or conversation.
- Do not call an AI model from the deterministic generation pipeline.
- Revise source recipes or versioned authored inputs; do not hand-edit generated
  cells to conceal a failure.
- Preserve the user's accepted seed and constraints unless the requested change
  explicitly alters them.
- Keep every accepted recipe readable, reviewable, and reproducible without AI.
- Follow `docs/AI_AUTHORING_MODEL.md`.

## Deterministic implementation rules

- Use the shared coordinate and hash kernel.
- Use explicitly sized integer hash operations with documented overflow and
  signedness behavior.
- Assign a stable name to every random channel.
- Never use process-global random state.
- Do not use platform-dependent transcendental functions or an unpinned noise
  library for generation decisions.
- Prefer integer or fixed-point field math. If floating-point sampling is
  unavoidable, pin the implementation, quantize before semantic decisions, and
  protect it with cross-platform golden vectors.
- Never let iteration order of unordered collections affect output.
- Normalize `WorldRecipe` before identity hashing and canonicalize
  `ResolvedWorldConfig` before calculating its derived verification hash.
- Compile the normalized recipe into `ResolvedWorldConfig` through the versioned
  recipe compiler; never accept two independently authored inputs for one world.
- Canonicalize serialization, including object-key order and numeric encoding.
- Include generator and rule versions in output.
- Add deterministic fixtures before refactoring generation behavior.
- Compare outputs structurally, not only through screenshots.

## Safe write rules

- Resolve and verify every output root.
- Refuse output paths outside WorldForge-owned roots.
- Do not follow symlinks or junctions into upstream repositories.
- Use temporary directories for incomplete artifacts.
- Publish an artifact only after validation succeeds.
- Never overwrite the only copy of a user-authored landmark or configuration.

## Evidence requirements

An agent must not claim a pass from code inspection alone when a relevant test
can be run.

Completion evidence should include:

- changed files;
- deterministic test result;
- relevant validation summary;
- artifact path;
- visual review status when visuals changed;
- remaining warnings and approval gates.

Do not call a world “approved,” “production-ready,” or “pixel-identical” without
the corresponding evidence.

## Visual approval

- Structural success and visual approval are separate.
- Leave a real generated candidate available for inspection.
- Review macro scale, gameplay scale, and chunk borders.
- Preserve an accepted baseline until a replacement is explicitly approved.
- Do not silently update visual baselines after generator changes.

## Multi-agent coordination

- Assume another agent may be working in the repository.
- Inspect status immediately before editing and before committing.
- Use narrow file ownership.
- Do not reset or overwrite another agent's work.
- Keep generated output directories isolated per task when concurrent work is
  possible.

## Decisions requiring user authority

The agent must not decide these implicitly:

- creating or changing repositories;
- changing repository visibility;
- publishing or tagging a release;
- replacing an accepted world baseline;
- upgrading the pinned TileForge package;
- changing world artifact format compatibility;
- rebuilding existing saved worlds under new generator behavior;
- expanding WorldForge into game-specific progression or content systems;
- modifying TileForge.

## Definition of done

A WorldForge implementation task is done only when:

1. The requested behavior exists.
2. The relevant deterministic and structural tests pass.
3. Outputs remain inside WorldForge-owned paths.
4. The TileForge repository is unchanged.
5. Documentation and schemas match the implementation.
6. Any visual candidate is available and honestly marked approved or pending.
7. Remaining risks are stated.

## Recommended task preamble

Future AI tasks may begin with:

> Work only inside the confirmed WorldForge repository. You may browse, inspect,
> clone, or download TileForge as read-only reference material, but you must not
> edit its source, generate into its checkout, commit, or push changes. Implement
> against the pinned TileForge package contract. Preserve unrelated dirty work,
> treat AI as an optional authoring client of the validated WorldRecipe contract,
> keep generation deterministic and offline-reproducible, run the relevant
> validators, and leave any visual candidate pending explicit approval.
