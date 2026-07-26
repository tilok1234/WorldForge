import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import {
  importTileForgePackage,
  verifyTileForgePackage,
  LOCK_FILE_NAME,
} from "../src/package/importPackage.js";

const cleanups: string[] = [];
after(() => {
  for (const path of cleanups) {
    rmSync(path, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}

/** Build a store-method zip in memory (enough for import preflight tests). */
function buildZip(files: ReadonlyArray<{ name: string; data: Buffer | string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const data = typeof file.data === "string" ? Buffer.from(file.data, "utf8") : file.data;
    const name = Buffer.from(file.name, "utf8");
    const crc = crc32(data) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += 30 + name.length + data.length;
  }
  const centralBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralBuffer, eocd]);
}

const GOOD_MANIFEST = JSON.stringify({
  formatVersion: 1,
  generator: "tileforge-proto/0.0.1",
  sourceCommit: "abc1234",
  projectSeed: 7,
  tileSize: 32,
  style: { theme: "testtheme" },
});

function goodFiles(): Array<{ name: string; data: Buffer | string }> {
  return [
    { name: "pkg/tileforge-manifest.json", data: GOOD_MANIFEST },
    { name: "pkg/GAME-GUIDE.md", data: "# guide\n" },
    { name: "pkg/FORMATS.md", data: "# formats\n" },
    { name: "pkg/README.txt", data: "readme\n" },
    { name: "pkg/atlas.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  ];
}

function writeZip(files: ReadonlyArray<{ name: string; data: Buffer | string }>): string {
  const dir = tempDir("wf-pkg-zip-");
  const zipPath = join(dir, "package.zip");
  writeFileSync(zipPath, buildZip(files));
  return zipPath;
}

function importInto(zipPath: string, packageId?: string) {
  const worldforgeRoot = tempDir("wf-pkg-root-");
  return {
    worldforgeRoot,
    result: importTileForgePackage({
      zipPath,
      worldforgeRoot,
      ...(packageId === undefined ? {} : { packageId }),
    }),
  };
}

describe("package import", () => {
  it("imports a valid package, strips the shared root, and verifies", () => {
    const { worldforgeRoot, result } = importInto(writeZip(goodFiles()), "test-pkg");
    assert.equal(result.packageId, "test-pkg");
    assert.equal(result.fileCount, 5);
    assert.equal(result.lock.strippedRoot, "pkg");
    assert.equal(result.lock.generator, "tileforge-proto/0.0.1");
    assert.equal(result.lock.theme, "testtheme");
    assert.equal(result.lock.sourceCommit, "abc1234");
    assert.ok(existsSync(join(result.packageDir, "tileforge-manifest.json")));
    assert.ok(existsSync(join(worldforgeRoot, LOCK_FILE_NAME)));

    const verification = verifyTileForgePackage(worldforgeRoot);
    assert.deepEqual(verification.problems, []);
    assert.equal(verification.ok, true);
  });

  it("detects tampering, manifest edits, and deletions after import", () => {
    const { worldforgeRoot, result } = importInto(writeZip(goodFiles()), "tamper-pkg");

    const atlasPath = join(result.packageDir, "atlas.png");
    const original = readFileSync(atlasPath);
    writeFileSync(atlasPath, Buffer.from("tampered"));
    let verification = verifyTileForgePackage(worldforgeRoot);
    assert.equal(verification.ok, false);
    assert.ok(verification.problems.some((p) => p.includes("contentSha256")));
    writeFileSync(atlasPath, original);

    const manifestPath = join(result.packageDir, "tileforge-manifest.json");
    writeFileSync(manifestPath, GOOD_MANIFEST + "\n");
    verification = verifyTileForgePackage(worldforgeRoot);
    assert.equal(verification.ok, false);
    assert.ok(verification.problems.some((p) => p.includes("manifestSha256")));
    writeFileSync(manifestPath, GOOD_MANIFEST);

    rmSync(join(result.packageDir, "README.txt"));
    verification = verifyTileForgePackage(worldforgeRoot);
    assert.equal(verification.ok, false);
    assert.ok(verification.problems.some((p) => p.includes("fileCount")));
  });

  it("refuses a second import while a lock or package exists", () => {
    const zipPath = writeZip(goodFiles());
    const { worldforgeRoot } = importInto(zipPath, "once-pkg");
    assert.throws(
      () => importTileForgePackage({ zipPath, worldforgeRoot, packageId: "twice-pkg" }),
      /deliberate compatibility event/,
    );
  });

  it("rejects zip-slip, VCS metadata, and unsafe names", () => {
    assert.throws(
      () => importInto(writeZip([...goodFiles(), { name: "../evil.txt", data: "x" }])),
      /\.\." path segment|absolute path/,
    );
    assert.throws(
      () => importInto(writeZip([...goodFiles(), { name: "pkg/.git/config", data: "x" }])),
      /source-control metadata/,
    );
    assert.throws(
      () => importInto(writeZip([...goodFiles(), { name: "pkg\\odd.txt", data: "x" }])),
      /unsafe name/,
    );
    assert.throws(
      () =>
        importInto(
          writeZip([...goodFiles(), { name: "pkg/dupe.txt", data: "a" }, { name: "pkg/dupe.txt", data: "b" }]),
        ),
      /more than once/,
    );
  });

  it("rejects secret-looking files by name and content", () => {
    assert.throws(
      () => importInto(writeZip([...goodFiles(), { name: "pkg/.env", data: "TOKEN=1" }])),
      /secret-material filename/,
    );
    assert.throws(
      () =>
        importInto(
          writeZip([
            ...goodFiles(),
            { name: "pkg/notes.txt", data: "-----BEGIN RSA PRIVATE KEY-----\nzzz" },
          ]),
        ),
      /secret-looking content/,
    );
  });

  it("rejects incomplete or incompatible packages", () => {
    const missingFormats = goodFiles().filter((file) => !file.name.endsWith("FORMATS.md"));
    assert.throws(() => importInto(writeZip(missingFormats)), /missing required file "FORMATS\.md"/);

    const badManifest = goodFiles().map((file) =>
      file.name.endsWith("tileforge-manifest.json")
        ? { name: file.name, data: JSON.stringify({ formatVersion: 2, generator: "x", style: { theme: "t" } }) }
        : file,
    );
    assert.throws(() => importInto(writeZip(badManifest)), /unsupported manifest formatVersion/);
  });
});
