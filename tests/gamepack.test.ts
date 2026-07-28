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
import { resolveToTileForge } from "../src/adapters/tileforge/resolve.js";
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
  it("is the loader grid under the moss ruling and the Phase-A stamp", () => {
    const { result, mapData } = generatedTiny();
    const walkability = buildWalkability(result.artifact, mapData);
    const loaded = loadWorldArtifact(result.artifact as unknown);
    assert.ok(loaded.ok);
    const world = loaded.world;
    const { width, height } = world.dimensions;
    assert.equal(walkability.width, width);
    assert.equal(walkability.height, height);

    // Independent stamp model, rebuilt from the artifact rather than the
    // exporter's helpers: placement footprints (settlement structures and
    // non-gate POI structures; landmarks and gates excluded) and the street
    // mask the slit pass must honor.
    const artifact = result.artifact;
    const inRect = new Uint8Array(width * height);
    const addRect = (ox: number, oy: number, w: number, h: number): void => {
      for (let sy = 0; sy < h; sy += 1) {
        for (let sx = 0; sx < w; sx += 1) {
          if (ox + sx >= 0 && oy + sy >= 0 && ox + sx < width && oy + sy < height) {
            inRect[(oy + sy) * width + ox + sx] = 1;
          }
        }
      }
    };
    for (const settlement of artifact.settlements) {
      for (const structure of settlement.structures) {
        addRect(structure.cell[0], structure.cell[1], structure.footprint[0], structure.footprint[1]);
      }
    }
    for (const poi of artifact.pois) {
      if (
        poi.structure !== undefined &&
        poi.structure.type !== "structure.ruined_gate" &&
        poi.structure.type !== "structure.fortress_gate"
      ) {
        addRect(poi.structure.x, poi.structure.y, poi.structure.w, poi.structure.h);
      }
    }
    const inLandmark = new Uint8Array(width * height);
    for (const landmark of artifact.landmarks) {
      for (let sy = 0; sy < landmark.footprint[1]; sy += 1) {
        for (let sx = 0; sx < landmark.footprint[0]; sx += 1) {
          const x = landmark.cell[0] + sx;
          const y = landmark.cell[1] + sy;
          if (x >= 0 && y >= 0 && x < width && y < height) {
            inLandmark[y * width + x] = 1;
          }
        }
      }
    }
    const keepOpenAt = (x: number, y: number): boolean => {
      const material = world.materialAt(x, y);
      return (
        material === "terrain.packed_road" ||
        material === "terrain.cobble" ||
        world.trailAt(x, y) ||
        world.pierAt(x, y) !== null ||
        world.riverTierAt(x, y) > 0 ||
        world.mossAt(x, y) ||
        inLandmark[y * width + x] === 1
      );
    };
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

    const packed = Buffer.from(walkability.grid, "base64");
    let walkableTotal = 0;
    let stampedCells = 0;
    let mossWalkCells = 0;
    let mossSolidCells = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const baseWalkable = world.walkableAt(x, y) || mossWalksAt(x, y);
        const packWalkable = unpackBit(packed, index);
        if (baseWalkable) walkableTotal += 1;

        // Stamping only ever REMOVES walkability from the moss-adjusted base.
        if (packWalkable) {
          assert.ok(baseWalkable, `pack walks where the base blocks at ${x},${y}`);
        }
        // Placement footprints are solid, doors and pass cells included.
        if (inRect[index] === 1) {
          assert.equal(packWalkable, false, `placement cell ${x},${y} stayed walkable`);
        }
        // Level-0 bare moss carpet walks (outside placement footprints).
        if (mossWalksAt(x, y) && inRect[index] === 0) {
          assert.equal(packWalkable, true, `flat moss carpet at ${x},${y} does not walk`);
          mossWalkCells += 1;
        }
        // Raised or covered moss stays exactly as the loader has it.
        if (world.mossAt(x, y) && !mossWalksAt(x, y) && !world.walkableAt(x, y)) {
          assert.equal(packWalkable, false, `raised/covered moss at ${x},${y} walks`);
          mossSolidCells += 1;
        }
        // Streets, trails, piers, fords, moss, and landmark interiors never
        // seal outside placement footprints.
        if (baseWalkable && inRect[index] === 0 && keepOpenAt(x, y)) {
          assert.equal(packWalkable, true, `protected cell ${x},${y} was sealed`);
        }
        if (baseWalkable && !packWalkable) stampedCells += 1;
      }
    }
    // The fixture actually exercises the stamp and both moss outcomes.
    assert.ok(stampedCells > 0, "no cells stamped; fixture no longer exercises the stamp");
    assert.ok(mossWalkCells > 0, "fixture has no walking moss carpet");
    assert.ok(mossSolidCells > 0, "fixture has no raised/covered moss");
    assert.ok(walkability.floodCount > 0);
    assert.ok(walkability.floodCount <= walkableTotal - stampedCells);

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

    // No-orphan arithmetic: from the same spawn, the moss-adjusted base
    // flood exceeds the pack flood by exactly the stamped cells it could
    // reach — stamping consumed cells, it never severed a region beyond
    // them.
    const baseSeen = new Set<number>([sy * width + sx]);
    const baseQueue: number[] = [sy * width + sx];
    for (let head = 0; head < baseQueue.length; head += 1) {
      const index = baseQueue[head] as number;
      const x = index % width;
      const y = (index - x) / width;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!baseSeen.has(next) && (world.walkableAt(nx, ny) || mossWalksAt(nx, ny))) {
          baseSeen.add(next);
          baseQueue.push(next);
        }
      }
    }
    let stampedReachable = 0;
    for (const index of baseSeen) {
      if (!unpackBit(packed, index)) stampedReachable += 1;
    }
    assert.equal(baseSeen.size, walkability.floodCount + stampedReachable);
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
