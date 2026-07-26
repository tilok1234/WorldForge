import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, parse } from "node:path";
import { guardOutputRoot, type GuardOptions } from "../src/core/pathGuard.js";

let sandbox: string;
let wfRoot: string;
let options: GuardOptions;

before(() => {
  sandbox = mkdtempSync(join(tmpdir(), "wf-guard-"));
  wfRoot = join(sandbox, "wf");
  mkdirSync(join(wfRoot, "outputs"), { recursive: true });
  mkdirSync(join(wfRoot, "external"), { recursive: true });
  mkdirSync(join(wfRoot, "src"), { recursive: true });

  // Simulated TileForge checkout whose folder name does not say "tileforge".
  const tileforge = join(sandbox, "semantic-tile-design");
  mkdirSync(tileforge, { recursive: true });
  writeFileSync(join(tileforge, "tileforge-manifest.json"), "{}\n");

  // Simulated exported package identified by its guide files.
  const pkg = join(sandbox, "some-package");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, "GAME-GUIDE.md"), "guide\n");
  writeFileSync(join(pkg, "FORMATS.md"), "formats\n");

  // A directory that directly contains the checkout.
  const parentDir = join(sandbox, "projects");
  mkdirSync(join(parentDir, "tf-inside"), { recursive: true });
  writeFileSync(join(parentDir, "tf-inside", "tileforge-manifest.json"), "{}\n");

  // A foreign git repository.
  mkdirSync(join(sandbox, "foreign-repo", ".git"), { recursive: true });

  options = {
    worldforgeRoot: wfRoot,
    forbiddenRoots: [join(sandbox, "registered-upstream")],
  };
  mkdirSync(join(sandbox, "registered-upstream"), { recursive: true });
});

after(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("output path guard", () => {
  it("allows fresh directories under outputs/ and the OS temp root", () => {
    assert.equal(guardOutputRoot(join(wfRoot, "outputs", "run1"), options).allowed, true);
    assert.equal(guardOutputRoot(join(sandbox, "plain-task-dir"), options).allowed, true);
  });

  it("rejects the repository root and non-output repository paths", () => {
    assert.equal(guardOutputRoot(wfRoot, options).allowed, false);
    const src = guardOutputRoot(join(wfRoot, "src", "oops"), options);
    assert.equal(src.allowed, false);
    assert.match(src.reason, /output roots/);
  });

  it("rejects external/, home, filesystem roots, and env-var syntax", () => {
    assert.equal(guardOutputRoot(join(wfRoot, "external", "ref"), options).allowed, false);
    assert.equal(guardOutputRoot(homedir(), options).allowed, false);
    assert.equal(guardOutputRoot(parse(wfRoot).root, options).allowed, false);
    assert.equal(guardOutputRoot("%OUTDIR%\\worlds", options).allowed, false);
    assert.equal(guardOutputRoot("$HOME/worlds", options).allowed, false);
  });

  it("rejects TileForge checkouts and packages even inside the temp root", () => {
    const checkout = guardOutputRoot(join(sandbox, "semantic-tile-design", "out"), options);
    assert.equal(checkout.allowed, false);
    assert.match(checkout.reason, /TileForge/);

    const pkg = guardOutputRoot(join(sandbox, "some-package", "sub"), options);
    assert.equal(pkg.allowed, false);
    assert.match(pkg.reason, /TileForge/);
  });

  it("rejects a destination that directly contains a TileForge checkout", () => {
    const parent = guardOutputRoot(join(sandbox, "projects"), options);
    assert.equal(parent.allowed, false);
    assert.match(parent.reason, /contains a TileForge/);
  });

  it("rejects foreign git repositories and registered forbidden roots", () => {
    const foreign = guardOutputRoot(join(sandbox, "foreign-repo", "worlds"), options);
    assert.equal(foreign.allowed, false);
    assert.match(foreign.reason, /git repository/);

    const registered = guardOutputRoot(join(sandbox, "registered-upstream", "x"), options);
    assert.equal(registered.allowed, false);
    assert.match(registered.reason, /read-only upstream/);
  });

  it("follows links out of allowed roots and rejects the real destination", () => {
    const link = join(wfRoot, "outputs", "sneaky");
    try {
      symlinkSync(join(sandbox, "semantic-tile-design"), link, "junction");
    } catch {
      // Symlink creation can be restricted; treat as untestable here.
      return;
    }
    const result = guardOutputRoot(join(link, "worlds"), options);
    assert.equal(result.allowed, false);
  });
});
