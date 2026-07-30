/**
 * Pack publish gate + GitHub-release transport (planning repo doc 18 §4,
 * accepted 2026-07-30).
 *
 * The gate: a game pack must be reproducible from a pushed commit, so the
 * exporter refuses to run when the working tree has uncommitted changes or
 * HEAD is not on any remote branch. The transport: every successful export
 * uploads the pack as a deterministic zip on a GitHub release tagged with
 * the artifact id, its notes carrying the source commit and content hashes —
 * the original stays fetchable and hash-checkable even if the dev machine
 * copy is lost (the incident class that motivated the protocol).
 *
 * The pack's own bytes never change here: WorldForge pack manifests are
 * deliberately commit-free (identity lives in content hashes, so re-exports
 * at the same behavior version stay byte-stable across commits). The git
 * commit binds to the artifact through the release tag and notes instead.
 */

import { execFileSync } from "node:child_process";

function run(
  command: string,
  args: readonly string[],
  cwd?: string,
): { readonly ok: boolean; readonly stdout: string; readonly stderr: string } {
  try {
    const stdout = execFileSync(command, args as string[], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ok: true, stdout, stderr: "" };
  } catch (error) {
    const failed = error as { stdout?: unknown; stderr?: unknown; message?: string };
    return {
      ok: false,
      stdout: typeof failed.stdout === "string" ? failed.stdout : "",
      stderr:
        typeof failed.stderr === "string" && failed.stderr !== ""
          ? failed.stderr
          : (failed.message ?? String(error)),
    };
  }
}

export type PublishGateVerdict =
  | { readonly ok: true; readonly headCommit: string }
  | { readonly ok: false; readonly reasons: readonly string[] };

/**
 * Doc 18 §4.1, verbatim checks: `git status --porcelain` must be empty and
 * `git branch -r --contains HEAD` must name at least one remote branch. Any
 * git failure (no repo, no git) is a refusal, never a silent pass.
 */
export function checkPublishable(repoRoot: string): PublishGateVerdict {
  const status = run("git", ["status", "--porcelain"], repoRoot);
  if (!status.ok) {
    return { ok: false, reasons: [`git status failed: ${status.stderr.trim()}`] };
  }
  const reasons: string[] = [];
  const dirty = status.stdout.split(/\r?\n/).filter((line) => line.length > 0);
  if (dirty.length > 0) {
    const sample = dirty.slice(0, 8).map((line) => `    ${line}`);
    if (dirty.length > sample.length) {
      sample.push(`    … and ${dirty.length - sample.length} more`);
    }
    reasons.push(`the working tree has ${dirty.length} uncommitted path(s):\n${sample.join("\n")}`);
  }
  const head = run("git", ["rev-parse", "HEAD"], repoRoot);
  if (!head.ok) {
    return { ok: false, reasons: [...reasons, `git rev-parse HEAD failed: ${head.stderr.trim()}`] };
  }
  const headCommit = head.stdout.trim();
  const remote = run("git", ["branch", "-r", "--contains", "HEAD"], repoRoot);
  if (!remote.ok) {
    reasons.push(`git branch -r --contains HEAD failed: ${remote.stderr.trim()}`);
  } else if (remote.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0).length === 0) {
    reasons.push(
      `HEAD ${headCommit.slice(0, 12)} is not on any remote branch — push before exporting`,
    );
  }
  return reasons.length > 0 ? { ok: false, reasons } : { ok: true, headCommit };
}

export interface PackReleaseIdentity {
  /** Recipe basename, e.g. "small-cold-coastal". */
  readonly worldName: string;
  /** Pinned package theme from the dependency lock, e.g. "dusk". */
  readonly theme: string;
  readonly behaviorVersion: number;
}

/** Canonical pack name = the game's intake directory name convention. */
export function packName(identity: PackReleaseIdentity): string {
  return `${identity.worldName}-pack-${identity.theme}`;
}

/** Release tag / artifact id, matching the sync-log convention (`…@b63`). */
export function packArtifactId(identity: PackReleaseIdentity): string {
  return `${packName(identity)}@b${identity.behaviorVersion}`;
}

/** Zip asset filename (tag's `@` kept out of the filename). */
export function packAssetName(identity: PackReleaseIdentity): string {
  return `${packName(identity)}-b${identity.behaviorVersion}.zip`;
}

export interface PackReleaseFacts {
  readonly identity: PackReleaseIdentity;
  readonly sourceCommit: string;
  readonly packFormat: number;
  readonly tileforgeAdapterVersion: number;
  readonly tileforgePackageId: string;
  readonly baseArtifactSha256: string;
  /** sha256 of manifest.json — the manifest hashes every other file. */
  readonly manifestSha256: string;
  readonly zipSha256: string;
  readonly fileCount: number;
  readonly floodCount: number;
  readonly spawnCell: readonly [number, number];
}

/**
 * Release notes: stable `key: value` lines so later runs (and consumers) can
 * hash-check by parsing, plus the regeneration recipe in prose.
 */
export function releaseNotes(facts: PackReleaseFacts): string {
  return [
    "WorldForge game pack — reproducible from the tagged commit.",
    "",
    `artifactId: ${packArtifactId(facts.identity)}`,
    `sourceCommit: ${facts.sourceCommit}`,
    `packFormat: ${facts.packFormat}`,
    `generatorBehaviorVersion: ${facts.identity.behaviorVersion}`,
    `tileforgeAdapterVersion: ${facts.tileforgeAdapterVersion}`,
    `tileforgePackageId: ${facts.tileforgePackageId}`,
    `baseArtifactSha256: ${facts.baseArtifactSha256}`,
    `manifestSha256: ${facts.manifestSha256}`,
    `zipSha256: ${facts.zipSha256}`,
    `packFiles: ${facts.fileCount}`,
    `walkableFlood: ${facts.floodCount}`,
    `spawnCell: ${facts.spawnCell[0]},${facts.spawnCell[1]}`,
    "",
    "Regenerate: check out sourceCommit, `npm run build`, then",
    `\`node dist/src/cli.js export-game-pack fixtures/recipes/${facts.identity.worldName}.json --out <dir>\`.`,
    "Every file's sha256 is in the pack's manifest.json; manifestSha256 above seals the set.",
  ].join("\n");
}

/** Pull `manifestSha256: <hex>` out of an existing release's notes. */
export function parseManifestSha(notesBody: string): string | null {
  const match = /^manifestSha256: ([0-9a-f]{64})$/m.exec(notesBody);
  return match === null ? null : (match[1] as string);
}

export type PackReleaseOutcome =
  | { readonly status: "created"; readonly url: string }
  | { readonly status: "verified-existing" }
  | { readonly status: "failed"; readonly message: string };

/**
 * Idempotent publish: if the tag already carries a release, verify its noted
 * manifestSha256 matches this export (same id must mean same bytes — a
 * mismatch is refused, incident-class); otherwise create the release with
 * the zip attached, tagging the source commit.
 */
export function publishPackRelease(
  facts: PackReleaseFacts,
  zipPath: string,
  cwd: string,
): PackReleaseOutcome {
  const gh = run("gh", ["--version"], cwd);
  if (!gh.ok) {
    return {
      status: "failed",
      message: `GitHub CLI unavailable (${gh.stderr.trim()}); install/authenticate gh, then re-run the export`,
    };
  }
  const tag = packArtifactId(facts.identity);
  const existing = run("gh", ["release", "view", tag, "--json", "body", "--jq", ".body"], cwd);
  if (existing.ok) {
    const noted = parseManifestSha(existing.stdout);
    if (noted === facts.manifestSha256) {
      return { status: "verified-existing" };
    }
    return {
      status: "failed",
      message:
        `release ${tag} already exists with manifestSha256 ${noted ?? "<unparsable>"} but this export` +
        ` produced ${facts.manifestSha256} — same artifact id must mean same bytes; refusing to` +
        ` overwrite (log an incident in the planning sync log if this is real drift)`,
    };
  }
  const created = run(
    "gh",
    [
      "release",
      "create",
      tag,
      zipPath,
      "--title",
      tag,
      "--target",
      facts.sourceCommit,
      "--notes",
      releaseNotes(facts),
    ],
    cwd,
  );
  if (!created.ok) {
    return {
      status: "failed",
      message: `gh release create failed: ${created.stderr.trim()}`,
    };
  }
  return { status: "created", url: created.stdout.trim() };
}
