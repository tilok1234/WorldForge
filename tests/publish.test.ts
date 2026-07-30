import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, describe, it } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStoredZip, crc32 } from "../src/gamepack/zip.js";
import {
  checkPublishable,
  packArtifactId,
  packAssetName,
  packName,
  parseManifestSha,
  releaseNotes,
} from "../src/gamepack/publish.js";

const cleanups: string[] = [];
after(() => {
  for (const dir of cleanups) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function git(args: readonly string[], cwd: string): string {
  const result = spawnSync("git", args as string[], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
}

/** Commit with a self-contained identity so user-level git config never leaks in. */
function commit(cwd: string, message: string): void {
  git(
    [
      "-c",
      "user.email=test@worldforge",
      "-c",
      "user.name=worldforge-test",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      message,
    ],
    cwd,
  );
}

describe("publish gate (doc 18 §4)", () => {
  it("refuses dirty trees and unpushed HEADs, passes a pushed clean tree", () => {
    const repo = mkdtempSync(join(tmpdir(), "wf-gate-"));
    cleanups.push(repo);
    git(["init", "-q", "-b", "main"], repo);

    // Untracked file: dirty.
    writeFileSync(join(repo, "a.txt"), "one\n");
    const dirty = checkPublishable(repo);
    assert.equal(dirty.ok, false);
    assert.ok(!dirty.ok && dirty.reasons.some((reason) => reason.includes("uncommitted")));
    assert.ok(!dirty.ok && dirty.reasons.some((reason) => reason.includes("a.txt")));

    // Committed but on no remote branch: refused with the push hint.
    git(["add", "a.txt"], repo);
    commit(repo, "first");
    const unpushed = checkPublishable(repo);
    assert.equal(unpushed.ok, false);
    assert.ok(
      !unpushed.ok && unpushed.reasons.some((reason) => reason.includes("not on any remote branch")),
    );

    // A remote-tracking ref containing HEAD: publishable, commit reported.
    git(["update-ref", "refs/remotes/origin/main", "HEAD"], repo);
    const clean = checkPublishable(repo);
    assert.equal(clean.ok, true);
    assert.ok(clean.ok && clean.headCommit === git(["rev-parse", "HEAD"], repo).trim());

    // Modified tracked file on top: dirty again, both reasons possible but
    // the tree reason must name the path.
    writeFileSync(join(repo, "a.txt"), "two\n");
    const modified = checkPublishable(repo);
    assert.equal(modified.ok, false);
    assert.ok(!modified.ok && modified.reasons.some((reason) => reason.includes("a.txt")));
  });

  it("refuses instead of passing when the directory is not a git repository", () => {
    const dir = mkdtempSync(join(tmpdir(), "wf-norepo-"));
    cleanups.push(dir);
    const verdict = checkPublishable(dir);
    assert.equal(verdict.ok, false);
  });
});

describe("deterministic store-only zip", () => {
  const entries = [
    { path: "pack/b.txt", bytes: Buffer.from("world", "utf8") },
    { path: "pack/a/x.bin", bytes: Buffer.from([0x00, 0xff, 0x10, 0x80]) },
  ];

  it("crc32 matches the standard check value", () => {
    assert.equal(crc32(Buffer.from("123456789", "ascii")), 0xcbf43926);
    assert.equal(crc32(Buffer.alloc(0)), 0);
  });

  it("builds byte-identical archives with the pinned canonical hash", () => {
    const zipA = buildStoredZip(entries);
    const zipB = buildStoredZip([...entries].reverse());
    assert.ok(zipA.equals(zipB), "entry order must not affect bytes");
    assert.equal(zipA.readUInt32LE(0), 0x04034b50, "local header signature");
    assert.equal(zipA.readUInt32LE(zipA.length - 22), 0x06054b50, "EOCD signature");
    assert.equal(zipA.readUInt16LE(zipA.length - 22 + 10), entries.length, "entry count");
    // Canonical-bytes pin (same doctrine as canonicalJson): the zip layout is
    // part of release identity — changing it changes every zipSha256.
    assert.equal(
      createHash("sha256").update(zipA).digest("hex"),
      "a6939113de61c8b341bc8ffb84fcc67bf118b0e9db747674f916bee5b4f037c8",
    );
  });

  /**
   * An independent system unzipper, probed rather than assumed: PATH `tar`
   * is GNU tar under Git Bash (reads no zips), so prefer Windows' System32
   * bsdtar, then `unzip`, then a `tar` that identifies as bsdtar.
   */
  function findUnzipper(): { cmd: string; args: readonly string[] } | null {
    if (process.platform === "win32") {
      const bsdtar = join(process.env["SystemRoot"] ?? "C:\\Windows", "System32", "tar.exe");
      const probe = spawnSync(bsdtar, ["--version"], { encoding: "utf8" });
      if (probe.error === undefined && probe.status === 0) {
        return { cmd: bsdtar, args: ["-xf", "roundtrip.zip", "-C", "out"] };
      }
    }
    const unzip = spawnSync("unzip", ["-v"], { encoding: "utf8" });
    if (unzip.error === undefined && unzip.status === 0) {
      return { cmd: "unzip", args: ["-oq", "roundtrip.zip", "-d", "out"] };
    }
    const tar = spawnSync("tar", ["--version"], { encoding: "utf8" });
    if (tar.error === undefined && tar.status === 0 && tar.stdout.includes("bsdtar")) {
      return { cmd: "tar", args: ["-xf", "roundtrip.zip", "-C", "out"] };
    }
    return null;
  }

  it("round-trips through the system unzipper when one is available", (ctx) => {
    const unzipper = findUnzipper();
    if (unzipper === null) {
      ctx.skip("no zip-capable extractor on this machine");
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "wf-zip-"));
    cleanups.push(dir);
    writeFileSync(join(dir, "roundtrip.zip"), buildStoredZip(entries));
    const extractDir = join(dir, "out");
    mkdirSync(extractDir);
    // Relative argv + cwd on purpose: bsdtar parses "C:\…" as a remote host
    // ("Cannot connect to C"), so absolute Windows paths never reach it.
    const result = spawnSync(unzipper.cmd, unzipper.args as string[], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${unzipper.cmd} refused our zip: ${result.stderr}`);
    for (const entry of entries) {
      assert.ok(
        readFileSync(join(extractDir, ...entry.path.split("/"))).equals(entry.bytes),
        `extracted ${entry.path}`,
      );
    }
  });

  it("refuses unsafe entry paths", () => {
    assert.throws(() => buildStoredZip([{ path: "a\\b.txt", bytes: Buffer.alloc(0) }]));
    assert.throws(() => buildStoredZip([{ path: "/abs.txt", bytes: Buffer.alloc(0) }]));
    assert.throws(() =>
      buildStoredZip([
        { path: "same.txt", bytes: Buffer.alloc(0) },
        { path: "same.txt", bytes: Buffer.alloc(1) },
      ]),
    );
  });
});

describe("release identity and notes", () => {
  const identity = { worldName: "small-cold-coastal", theme: "dusk", behaviorVersion: 65 };

  it("derives the sync-log artifact id convention", () => {
    assert.equal(packName(identity), "small-cold-coastal-pack-dusk");
    assert.equal(packArtifactId(identity), "small-cold-coastal-pack-dusk@b65");
    assert.equal(packAssetName(identity), "small-cold-coastal-pack-dusk-b65.zip");
  });

  it("notes carry a parseable manifest hash that round-trips", () => {
    const manifestSha256 = "ab".repeat(32);
    const notes = releaseNotes({
      identity,
      sourceCommit: "cd".repeat(20),
      packFormat: 1,
      tileforgeAdapterVersion: 7,
      tileforgePackageId: "dusk-ae1eecb-seed103991",
      baseArtifactSha256: "ef".repeat(32),
      manifestSha256,
      zipSha256: "12".repeat(32),
      fileCount: 9,
      floodCount: 34641,
      spawnCell: [240, 125],
    });
    assert.equal(parseManifestSha(notes), manifestSha256);
    assert.ok(notes.includes(`sourceCommit: ${"cd".repeat(20)}`));
    assert.ok(notes.includes("artifactId: small-cold-coastal-pack-dusk@b65"));
    assert.equal(parseManifestSha("no hashes here"), null);
  });
});
