import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, describe, it } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { validateRecipe } from "../src/recipe/validate.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { compileRecipe } from "../src/recipe/compile.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { validateArtifact } from "../src/validation/validateArtifact.js";
import { loadWorldArtifact } from "../src/consumers/typescript/loader.js";
import {
  buildWalkability,
  packBits,
  unpackBit,
} from "../src/gamepack/export.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CLI = join(ROOT, "dist", "src", "cli.js");
const TINY_RECIPE = join(ROOT, "fixtures", "recipes", "tiny-temperate.json");

const cleanups: string[] = [];
after(() => {
  for (const path of cleanups) {
    rmSync(path, { recursive: true, force: true });
  }
});

function generatedTiny() {
  const validation = validateRecipe(JSON.parse(readFileSync(TINY_RECIPE, "utf8")));
  assert.ok(validation.ok);
  const normalized = normalizeRecipe(validation.recipe);
  const config = compileRecipe(normalized);
  const result = generateWorldDetailed(normalized, config);
  const report = validateArtifact(result.artifact, {
    minRegionCells: config.biomes.minRegionCells,
  });
  assert.equal(report.status, "pass");
  return { result, report };
}

describe("gamepack bit packing", () => {
  it("round-trips an arbitrary bit pattern", () => {
    const bits = new Uint8Array(101);
    for (let i = 0; i < bits.length; i += 1) {
      bits[i] = (i * 7 + 3) % 5 < 2 ? 1 : 0;
    }
    const packed = packBits(bits);
    assert.equal(packed.length, Math.ceil(bits.length / 8));
    for (let i = 0; i < bits.length; i += 1) {
      assert.equal(unpackBit(packed, i), bits[i] === 1, `bit ${i}`);
    }
  });
});

describe("gamepack walkability", () => {
  it("matches the public loader's walkable cells and flood exactly", () => {
    const { result } = generatedTiny();
    const walkability = buildWalkability(result.artifact);
    const loaded = loadWorldArtifact(result.artifact as unknown);
    assert.ok(loaded.ok);
    const world = loaded.world;
    const { width, height } = world.dimensions;
    assert.equal(walkability.width, width);
    assert.equal(walkability.height, height);

    const packed = Buffer.from(walkability.grid, "base64");
    let walkableTotal = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const expected = world.walkableAt(x, y);
        assert.equal(unpackBit(packed, y * width + x), expected, `cell ${x},${y}`);
        if (expected) walkableTotal += 1;
      }
    }
    assert.ok(walkability.floodCount > 0);
    assert.ok(walkability.floodCount <= walkableTotal);

    // The spawn cell is walkable and the flood from it, recomputed
    // independently over the packed grid, matches the recorded count —
    // the traverse-harness rule, re-proven from pack bytes alone.
    const [sx, sy] = walkability.spawnCell;
    assert.ok(unpackBit(packed, sy * width + sx));
    const seen = new Set<number>([sy * width + sx]);
    const queue: number[] = [sy * width + sx];
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head] as number;
      const x = index % width;
      const y = (index - x) / width;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!seen.has(next) && unpackBit(packed, next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    assert.equal(seen.size, walkability.floodCount);
  });
});

describe("export-game-pack CLI", () => {
  it("exports byte-stable packs whose manifest hashes match the files", () => {
    const dirA = mkdtempSync(join(tmpdir(), "wf-pack-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "wf-pack-b-"));
    cleanups.push(dirA, dirB);
    for (const dir of [dirA, dirB]) {
      const run = spawnSync(process.execPath, [CLI, "export-game-pack", TINY_RECIPE, "--out", dir], {
        encoding: "utf8",
      });
      assert.equal(run.status, 0, run.stderr);
    }

    const manifest = JSON.parse(readFileSync(join(dirA, "manifest.json"), "utf8")) as {
      pack: string;
      packFormat: number;
      baseArtifactSha256: string;
      walkability: { floodCount: number; spawnCell: [number, number] };
      files: Record<string, string>;
    };
    assert.equal(manifest.pack, "worldforge-game-pack");
    assert.equal(manifest.packFormat, 1);
    assert.equal(Object.keys(manifest.files).length, 8);

    for (const [path, expectedSha] of Object.entries(manifest.files)) {
      const bytes = readFileSync(join(dirA, path));
      const actual = createHash("sha256").update(bytes).digest("hex");
      assert.equal(actual, expectedSha, `hash of ${path}`);
    }
    assert.equal(
      createHash("sha256").update(readFileSync(join(dirA, "world.json"))).digest("hex"),
      manifest.baseArtifactSha256,
    );

    // Byte stability: the second export is identical file for file,
    // manifest included.
    for (const path of ["manifest.json", ...Object.keys(manifest.files)]) {
      assert.ok(
        readFileSync(join(dirA, path)).equals(readFileSync(join(dirB, path))),
        `byte-stable ${path}`,
      );
    }
  });
});
