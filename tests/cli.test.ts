import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CLI = join(ROOT, "dist", "src", "cli.js");
const TINY_RECIPE = join(ROOT, "fixtures", "recipes", "tiny-temperate.json");

const cleanups: string[] = [];
after(() => {
  for (const path of cleanups) {
    rmSync(path, { recursive: true, force: true });
  }
});

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("cli", () => {
  it("smoke passes and prints the identity hashes", () => {
    const { status, stdout } = run("smoke");
    assert.equal(status, 0);
    assert.match(stdout, /smoke: pass/);
    assert.match(stdout, /generationIdentitySha256: [0-9a-f]{64}/);
  });

  it("generates into an allowed temp directory", () => {
    const outDir = join(mkdtempSync(join(tmpdir(), "wf-cli-")), "world");
    cleanups.push(outDir);
    const { status, stdout } = run("generate", TINY_RECIPE, "--out", outDir);
    assert.equal(status, 0, stdout);
    for (const name of [
      "world.json",
      "normalized-recipe.json",
      "resolved-config.json",
      "validation-report.json",
    ]) {
      assert.ok(existsSync(join(outDir, name)), `${name} should exist`);
    }
  });

  it("refuses to generate into a TileForge-looking destination", () => {
    const fakeTileforge = mkdtempSync(join(tmpdir(), "wf-cli-tf-"));
    cleanups.push(fakeTileforge);
    writeFileSync(join(fakeTileforge, "tileforge-manifest.json"), "{}\n");
    const { status, stderr } = run("generate", TINY_RECIPE, "--out", join(fakeTileforge, "out"));
    assert.equal(status, 1);
    assert.match(stderr, /rejected/);
    assert.equal(existsSync(join(fakeTileforge, "out")), false);
  });

  it("rejects invalid recipes with actionable errors", () => {
    const dir = mkdtempSync(join(tmpdir(), "wf-cli-bad-"));
    cleanups.push(dir);
    const badRecipe = join(dir, "bad.json");
    writeFileSync(
      badRecipe,
      JSON.stringify({
        recipeFormat: 1,
        seed: 1,
        world: { sizePreset: "tiny", climatePreset: "temperate" },
        constraints: { requireReachableLandmarks: true },
      }),
    );
    const { status, stderr } = run("validate-recipe", badRecipe);
    assert.equal(status, 1);
    assert.match(stderr, /constraints/);
    assert.match(stderr, /Staged vocabulary/);
  });

  it("prints usage for unknown commands", () => {
    const { status, stderr } = run("frobnicate");
    assert.equal(status, 2);
    assert.match(stderr, /unknown command/);
  });
});
