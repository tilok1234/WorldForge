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

## Scope discipline

- Modify only files required by the current WorldForge task.
- Preserve unrelated changes.
- Do not redesign settled contracts as incidental cleanup.
- Do not add gameplay systems to solve generator problems.
- Do not add TileForge art or rendering internals to solve adapter problems.
- Do not expand a milestone until its stated exit criteria pass.
- Treat generated worlds as outputs, not hand-edited source.

## Source-of-truth discipline

- Read mappings from the pinned TileForge manifest.
- Read rendering behavior from the package guide and formats.
- Do not invent numeric IDs, atlas coordinates, mask rules, or structure sizes.
- Keep WorldForge semantic schemas authoritative for world meaning.
- Keep the dependency lock authoritative for package identity.
- When docs and live code disagree, report the discrepancy; do not silently
  choose the more convenient behavior.

## Deterministic implementation rules

- Use the shared coordinate and hash kernel.
- Assign a stable name to every random channel.
- Never use process-global random state.
- Never let iteration order of unordered collections affect output.
- Normalize configuration before hashing it.
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
> keep generation deterministic, run the relevant validators, and leave any
> visual candidate pending explicit approval.
