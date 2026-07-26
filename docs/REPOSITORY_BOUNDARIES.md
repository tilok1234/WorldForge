# WorldForge Repository Boundaries

Status: **Normative**

This document defines hard ownership and safety rules. It overrides convenience,
implementation shortcuts, and task pressure.

## Absolute upstream rule

WorldForge may inspect TileForge, including by cloning or downloading a local
reference copy, but must never modify the authoritative TileForge repository or
publish TileForge changes.

This includes direct and indirect changes.

## Inspection and reference copies are allowed

A WorldForge developer or AI agent may:

- browse the TileForge repository through GitHub or another read-only viewer;
- read the user's existing TileForge checkout;
- inspect TileForge source, documentation, history, tags, and release metadata;
- clone, download, fetch, or replace a local TileForge reference copy;
- check out a specific commit or tag inside a disposable reference copy;
- calculate hashes and compare versions;
- run commands that are demonstrably read-only;
- consume a user-selected TileForge release ZIP;
- copy a released package into a WorldForge-owned fixture or cache.

The recommended location for a downloaded source reference is:

```text
worldforge/external/tileforge-reference/<commit-or-release>/
```

That directory should be ignored by WorldForge Git. It is reference material,
not WorldForge source.

A downloaded source reference remains read-only after creation. Cloning,
fetching, or checking out a requested revision is allowed because it prepares
the reference copy; editing source files, committing, or pushing from it is not.

If a diagnostic would create build output, caches, regenerated exports, lock
files, or modified sources, copy the required public package or input into a
WorldForge-owned temporary directory and run the diagnostic there instead.

### Forbidden actions

A WorldForge developer or AI agent must not:

- edit any source or tracked file inside the authoritative TileForge checkout
  or a downloaded TileForge reference copy;
- generate exports into the authoritative checkout or reference copy;
- run formatters or migrations that write into TileForge;
- commit, push, tag, branch, reset, clean, or otherwise alter TileForge Git state;
- delete, move, rename, or normalize TileForge files;
- update TileForge documentation from a WorldForge task;
- patch TileForge to satisfy a WorldForge integration problem;
- create a branch or worktree for the purpose of modifying TileForge;
- use symlinks or junctions that make WorldForge writes land in TileForge;
- run TileForge commands known to mutate its workbench, baselines, exports, or
  repository state;
- vendor TileForge source code as an undocumented private dependency;
- assume a dirty TileForge working tree belongs to WorldForge.

The rule applies even when:

- TileForge is located beside WorldForge;
- both repositories are open in the same editor;
- an AI agent has filesystem permission to write there;
- a compatibility problem appears easy to fix upstream;
- tests would pass more easily after an upstream edit;
- the user asks for WorldForge work while another agent is editing TileForge.

### Allowed read-only interactions

WorldForge may:

- read a user-specified TileForge release ZIP;
- read a copied TileForge package located inside WorldForge test fixtures;
- inspect `README.txt`, `GAME-GUIDE.md`, `FORMATS.md`, manifests, validation
  reports, maps, examples, and importer scripts inside that package;
- calculate hashes and compatibility reports;
- run read-only inspection or validation against a package copy;
- compare WorldForge output with a package's `map-reference.png`;
- record the exact TileForge package identity in WorldForge lock data.

Repository inspection is allowed and useful for understanding provenance or
debugging a contract question. Implementation must still target the exported
package, because the package is the consumer contract.

## Artifact-only dependency

WorldForge integrates with a TileForge release package, not TileForge source.

A pinned dependency record should contain at least:

```json
{
  "provider": "TileForge",
  "generator": "tileforge-proto/0.4.0",
  "manifestFormat": 1,
  "theme": "forest",
  "packageSha256": "<sha256>",
  "manifestSha256": "<sha256>",
  "importedAt": "<timestamp>",
  "sourceLabel": "<user supplied release label>"
}
```

The package may be copied into a WorldForge-owned fixture or cache only through
an explicit import command. That command must refuse any destination outside
the WorldForge repository or its configured cache.

## Compatibility problem procedure

If WorldForge discovers a missing or inconsistent TileForge capability:

1. Stop treating the issue as a WorldForge implementation task.
2. Record the failing package version, reproduction, expected contract, and
   evidence inside WorldForge.
3. Write a compatibility proposal or upstream request.
4. Continue only if a safe WorldForge-side adapter is possible without changing
   the meaning of the TileForge contract.
5. Let the user decide whether separate TileForge work should occur.

WorldForge must never silently patch upstream.

## Ownership matrix

| Resource | WorldForge access |
|---|---|
| Authoritative TileForge repository | Read-only inspection |
| Downloaded TileForge reference copy | Clone/fetch/checkout for inspection; no source edits, commits, or pushes |
| TileForge release ZIP | Read |
| Imported package fixture under WorldForge | Read; replace only through explicit import |
| WorldForge source and docs | Read/write within task scope |
| WorldForge generated output | Read/write within configured output root |
| Game repository | No access unless the user separately scopes it |
| Sprite repositories | No access unless separately scoped |

## Path safety

Before any write, tooling must resolve the destination path and verify that it
is inside one of:

- the WorldForge repository;
- a configured WorldForge output directory;
- a temporary directory created for the current task.

The following must never be accepted as generation destinations:

- the TileForge repository;
- a downloaded TileForge reference copy;
- a parent directory containing TileForge;
- the user's home directory;
- a drive root;
- an unresolved environment-variable path;
- a symlink or junction resolving outside the intended WorldForge root.

## Git safety

- Inspect WorldForge Git status before edits.
- Preserve unrelated and user-owned dirty work.
- Never reset, clean, or overwrite another agent's changes.
- Commit only WorldForge-owned files.
- Never include imported TileForge release packages in Git unless the repository
  explicitly adopts fixture storage.
- Do not commit generated worlds by default; commit small deterministic fixtures
  and expected validation summaries instead.
- Publishing, version tagging, and visibility changes require their own authority.

## Dependency upgrades

A TileForge upgrade is a deliberate compatibility event:

1. Import the new package into a new versioned cache entry.
2. Validate manifest format and required mappings.
3. If useful, inspect or download the corresponding TileForge tag or commit
   without modifying it.
4. Run semantic lookup tests.
5. Run the full reference-map acceptance test.
6. Compare generated world fixtures.
7. Record expected visual or semantic changes.
8. Update the WorldForge dependency lock only after approval.

Never overwrite the previously pinned package before the comparison completes.
