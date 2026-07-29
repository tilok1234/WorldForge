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
import { loadWorldArtifact, STRUCTURE_PASS_CELLS } from "../src/consumers/typescript/loader.js";
import { resolveToTileForge } from "../src/adapters/tileforge/resolve.js";
import { buildWalkability, packBits, unpackBit } from "../src/gamepack/export.js";

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
  const mapData = resolveToTileForge(result.composed).mapData;
  return { result, report, mapData };
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
  it("is exactly WYSIWYG: ladder + moss ruling + art-outline stamp, nothing else", () => {
    const { result, mapData } = generatedTiny();
    const walkability = buildWalkability(result.artifact, mapData);
    const loaded = loadWorldArtifact(result.artifact as unknown);
    assert.ok(loaded.ok);
    const world = loaded.world;
    const { width, height } = world.dimensions;
    assert.equal(walkability.width, width);
    assert.equal(walkability.height, height);

    // Independent art-outline model, rebuilt from the artifact records
    // rather than the exporter's helpers: every placement footprint minus
    // the type's declared pass cells (the loader's public roster — gate
    // arches, cave mouths, den and crypt doors, the dock's deck). House
    // types declare no pass cells, so doors stamp solid with the walls.
    // Landmarks never stamp (open-air compounds, behavior 47).
    const artifact = result.artifact;
    const solidArt = new Uint8Array(width * height);
    const addRect = (type: string, ox: number, oy: number, w: number, h: number): void => {
      const pass = STRUCTURE_PASS_CELLS[type];
      for (let sy = 0; sy < h; sy += 1) {
        for (let sx = 0; sx < w; sx += 1) {
          if (pass !== undefined && pass.includes(sy * w + sx)) continue;
          if (ox + sx >= 0 && oy + sy >= 0 && ox + sx < width && oy + sy < height) {
            solidArt[(oy + sy) * width + ox + sx] = 1;
          }
        }
      }
    };
    for (const settlement of artifact.settlements) {
      for (const structure of settlement.structures) {
        addRect(
          structure.type,
          structure.cell[0],
          structure.cell[1],
          structure.footprint[0],
          structure.footprint[1],
        );
      }
    }
    for (const poi of artifact.pois) {
      if (poi.structure !== undefined) {
        addRect(poi.structure.type, poi.structure.x, poi.structure.y, poi.structure.w, poi.structure.h);
      }
    }
    // The moss ruling, independently restated: bare carpet on level-0 rock
    // (the adapter's flat apron) walks; raised or covered moss stays solid.
    const mossWalksAt = (x: number, y: number): boolean =>
      world.mossAt(x, y) &&
      world.materialAt(x, y) === "terrain.rock" &&
      (mapData.elev[y * width + x] as number) === 0 &&
      world.structureAt(x, y) === null &&
      world.propAt(x, y) === null &&
      world.fenceAt(x, y) === null &&
      world.riverTierAt(x, y) === 0;

    // The WYSIWYG equality, cell for cell in BOTH directions (designer
    // ruling 2026-07-29): the pack walks exactly where the ladder or the
    // moss ruling walks and no art stamps — no slit seals, no thread
    // seals, no pocket seals, no exceptions. What you see is where you
    // can walk.
    const packed = Buffer.from(walkability.grid, "base64");
    let stampedCells = 0;
    let mossWalkCells = 0;
    let mossSolidCells = 0;
    let oneWideGaps = 0;
    let passOpenings = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const baseWalkable = world.walkableAt(x, y) || mossWalksAt(x, y);
        const expected = baseWalkable && solidArt[index] === 0;
        const packWalkable = unpackBit(packed, index);
        assert.equal(
          packWalkable,
          expected,
          `pack ${packWalkable ? "walks" : "blocks"} against the WYSIWYG model at ${x},${y}`,
        );
        if (baseWalkable && !packWalkable) stampedCells += 1;
        if (mossWalksAt(x, y) && solidArt[index] === 0) mossWalkCells += 1;
        if (world.mossAt(x, y) && !mossWalksAt(x, y) && !world.walkableAt(x, y)) mossSolidCells += 1;
        // The acceptance geometry: a one-wide ground strip between two art
        // stamps (the grass gap between houses) is LEGAL walking ground.
        const pinchedEastWest =
          x > 0 && x < width - 1 && solidArt[index - 1] === 1 && solidArt[index + 1] === 1;
        const pinchedNorthSouth =
          y > 0 && y < height - 1 && solidArt[index - width] === 1 && solidArt[index + width] === 1;
        if (packWalkable && (pinchedEastWest || pinchedNorthSouth)) oneWideGaps += 1;
        // Reopened dungeon doors: pass-cell openings inside stamped
        // footprints that the ladder walks are open in the pack.
        if (packWalkable && !mossWalksAt(x, y)) {
          const structure = world.structureAt(x, y);
          if (structure !== null && STRUCTURE_PASS_CELLS[structure] !== undefined) {
            passOpenings += 1;
          }
        }
      }
    }
    // The fixture exercises every clause: solid houses, both moss
    // outcomes, the reopened one-wide gaps (the start town's grass
    // slits), and at least one pass-cell opening (a dungeon or gate
    // mouth). stampedCells may legitimately be zero — where the painted
    // structure layer covers a full footprint the ladder already blocks
    // it, and the stamp only backstops unpainted footprint cells.
    let houseCellsSolid = 0;
    for (const settlement of artifact.settlements) {
      for (const structure of settlement.structures) {
        if (STRUCTURE_PASS_CELLS[structure.type] !== undefined) continue;
        for (let fy = 0; fy < structure.footprint[1]; fy += 1) {
          for (let fx = 0; fx < structure.footprint[0]; fx += 1) {
            const x = structure.cell[0] + fx;
            const y = structure.cell[1] + fy;
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            assert.equal(
              unpackBit(packed, y * width + x),
              false,
              `house cell ${x},${y} walks (doors and walls are art-solid)`,
            );
            houseCellsSolid += 1;
          }
        }
      }
    }
    assert.ok(houseCellsSolid > 0, "fixture has no house footprints to prove solid");
    assert.ok(stampedCells >= 0);
    assert.ok(mossWalkCells > 0, "fixture has no walking moss carpet");
    assert.ok(mossSolidCells > 0, "fixture has no raised/covered moss");
    assert.ok(oneWideGaps > 0, "fixture has no one-wide inter-house gaps to keep open");
    assert.ok(passOpenings > 0, "fixture has no walkable pass-cell openings");

    // The spawn cell is walkable and the flood from it, recomputed
    // independently over the packed grid, matches the recorded count —
    // the traverse-harness rule, re-proven from pack bytes alone. Ground
    // pockets cut off by door stamps stay walkable but outside the flood
    // (unreachable islands, not seals).
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
