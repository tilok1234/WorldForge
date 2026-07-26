import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  verifyTileForgePackage,
  LOCK_FILE_NAME,
  type TileForgeLock,
} from "../src/package/importPackage.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * W0B exit-criteria proof against the real committed forest package:
 * the lock pins the user-approved identity, a clean clone carries the
 * complete package, and the manifest + guides are readable without any
 * TileForge source access.
 */
describe("pinned TileForge package fixture", () => {
  const lockPath = join(ROOT, LOCK_FILE_NAME);

  it("has the committed dependency lock with the approved identity", () => {
    assert.ok(existsSync(lockPath), `${LOCK_FILE_NAME} must be committed at the repo root`);
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as TileForgeLock;
    assert.equal(lock.lockFormat, 1);
    assert.equal(lock.provider, "TileForge");
    assert.equal(lock.generator, "tileforge-proto/0.4.0");
    assert.equal(lock.manifestFormat, 1);
    assert.equal(lock.theme, "forest");
    assert.equal(lock.sourceCommit, "a5baf52");
    assert.equal(lock.projectSeed, 103991);
    assert.equal(lock.tileSize, 32);
    assert.equal(
      lock.packageSha256,
      "3e58c902c5baca63e33d1201d459844299616d5b1f87e514e330163524580d68",
    );
    assert.equal(
      lock.manifestSha256,
      "5e6bd19a71d4a2949815896bf58f0dd3a2a3ed12882caa456d60224c6c70e83e",
    );
  });

  it("matches the lock byte-for-byte (clean-clone reproducibility)", () => {
    const verification = verifyTileForgePackage(ROOT);
    assert.deepEqual(verification.problems, []);
    assert.equal(verification.ok, true);
  });

  it("exposes the manifest and required guides without TileForge source access", () => {
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as TileForgeLock;
    const packageDir = join(ROOT, ...lock.packagePath.split("/"));

    for (const required of ["tileforge-manifest.json", "GAME-GUIDE.md", "FORMATS.md", "README.txt"]) {
      assert.ok(existsSync(join(packageDir, required)), `${required} must exist in the fixture`);
    }

    const manifest = JSON.parse(
      readFileSync(join(packageDir, "tileforge-manifest.json"), "utf8"),
    ) as Record<string, unknown>;
    assert.equal(manifest["formatVersion"], 1);
    assert.equal(manifest["generator"], "tileforge-proto/0.4.0");
    assert.equal(manifest["sourceCommit"], "a5baf52");
    assert.equal(manifest["projectSeed"], 103991);
    assert.equal(manifest["tileSize"], 32);
    const style = manifest["style"] as Record<string, unknown>;
    assert.equal(style["theme"], "forest");
    assert.ok(typeof manifest["palette"] === "object" && manifest["palette"] !== null);
  });
});
