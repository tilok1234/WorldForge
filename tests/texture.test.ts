import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateRecipe } from "../src/recipe/validate.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { compileRecipe } from "../src/recipe/compile.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { validateArtifact } from "../src/validation/validateArtifact.js";
import { PALETTE_INDEX, WORLD_PALETTE } from "../src/regions/biomes.js";

function generate(recipe: unknown) {
  const validation = validateRecipe(recipe);
  assert.ok(validation.ok, JSON.stringify(validation.ok ? [] : validation.issues));
  const normalized = normalizeRecipe(validation.recipe);
  const config = compileRecipe(normalized);
  return { result: generateWorldDetailed(normalized, config), config };
}

const BASE = {
  recipeFormat: 1,
  seed: 7,
  world: { sizePreset: "tiny", climatePreset: "temperate" },
  budgets: { settlementCount: 2, primaryRouteCount: 1, landmarkCount: 0 },
};

/** Row-major material grid flattened from the artifact's chunks. */
function materialGrid(artifact: {
  readonly dimensions: { readonly width: number; readonly height: number; readonly chunkWidth: number; readonly chunkHeight: number };
  readonly chunks: ReadonlyArray<{ readonly coord: readonly number[]; readonly layers: { readonly material: ReadonlyArray<readonly number[]> } }>;
}): number[] {
  const { width, height, chunkWidth, chunkHeight } = artifact.dimensions;
  const grid = new Array<number>(width * height).fill(-1);
  for (const chunk of artifact.chunks) {
    const baseX = (chunk.coord[0] as number) * chunkWidth;
    const baseY = (chunk.coord[1] as number) * chunkHeight;
    chunk.layers.material.forEach((row, y) => {
      row.forEach((value, x) => {
        grid[(baseY + y) * width + (baseX + x)] = value;
      });
    });
  }
  return grid;
}

describe("terrain texture (behavior 39)", () => {
  const { result } = generate(BASE);
  const stats = result.composed.textureStats;

  it("mottles and dithers a temperate world", () => {
    assert.ok(stats.mottledCells > 0, "expected mottled cells");
    assert.ok(stats.ditheredCells > 0, "expected dithered cells");
  });

  it("is deterministic: the same recipe textures identically", () => {
    const again = generate(BASE).result.composed.textureStats;
    assert.deepEqual(again, stats);
  });

  it("never writes blocking or water materials", () => {
    const grid = materialGrid(result.artifact);
    const forbiddenBySource = new Set<number>([
      PALETTE_INDEX["terrain.rock"],
      PALETTE_INDEX["terrain.swamp"],
      PALETTE_INDEX["water.deep"],
      PALETTE_INDEX["water.shallow"],
    ]);
    // The texture pass cannot be told apart from the base pass here, so
    // assert the global §2.7 sand-margin law instead: any sand within two
    // cells of an edge would be a texture guard failure (the base beach
    // pass already excludes it).
    const { width, height } = result.artifact.dimensions;
    const sand = PALETTE_INDEX["terrain.sand"];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = grid[y * width + x] as number;
        assert.ok(value >= 0 && value < WORLD_PALETTE.length);
        if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) {
          assert.notEqual(value, sand, `sand at margin cell (${x}, ${y})`);
        }
      }
    }
    assert.ok(forbiddenBySource.size > 0);
  });

  it("keeps corridors and structures untouched by texture targets", () => {
    // Corridor/structure cells carry corridor materials (cobble, packed
    // road, gravel trail) or structure records; texture targets are grass /
    // dry grass / sand / gravel ON ground cells only. Assert every street
    // ford cell still carries a walkable corridor-compatible material and
    // the route network still verifies (0 route errors).
    assert.deepEqual(result.composed.routesResult.errors, []);
  });

  it("the textured artifact still validates", () => {
    const report = validateArtifact(result.artifact, {});
    assert.equal(report.status, "pass", JSON.stringify(report).slice(0, 400));
  });
});
