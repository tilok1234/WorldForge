import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { DECOR_TYPES, PROP_WALKABILITY } from "../src/decoration/decorate.js";
import { respaceWildernessProps, type RespaceResult } from "../src/decoration/respace.js";
import { PALETTE_INDEX } from "../src/regions/biomes.js";
import { WATER_NONE } from "../src/hydrology/hydrology.js";
import type { ComposedWorld } from "../src/generation/composeWorld.js";

// The walkable-woods pass is ARCHIVED (sl-0075 closed superseded:
// composition is art direction; navigation moved game-side, sl-0078).
// It is NOT wired into generation — these tests invoke it directly so
// the dormant module cannot rot, and pin that generation itself leaves
// prop composition as authored.

const TERRAIN_SOLID = new Set<number>([PALETTE_INDEX["terrain.rock"], PALETTE_INDEX["terrain.swamp"]]);

function terrainSolidAt(composed: ComposedWorld, cell: number): boolean {
  return (
    TERRAIN_SOLID.has(composed.grid[cell] as number) ||
    composed.hydro.waterKind[cell] !== WATER_NONE ||
    composed.hydro.isMajorRiver[cell] === 1
  );
}

function generated(seed: number) {
  const validation = validateRecipe({
    recipeFormat: 1,
    seed,
    world: { sizePreset: "tiny", climatePreset: "temperate" },
    budgets: { settlementCount: 3, landmarkCount: 1, primaryRouteCount: 1 },
  });
  assert.ok(validation.ok);
  const normalized = normalizeRecipe(validation.recipe);
  const config = compileRecipe(normalized);
  return { result: generateWorldDetailed(normalized, config), config };
}

function runPass(composed: ComposedWorld, seed: number): RespaceResult {
  return respaceWildernessProps({
    grid: composed.grid,
    width: composed.width,
    height: composed.height,
    structureLayer: composed.structureLayer,
    hydro: composed.hydro,
    pathLayer: composed.routesResult.pathLayer,
    fenceLayer: composed.farms.fenceLayer,
    pierLayer: composed.farms.pierLayer,
    cropLayer: composed.farms.cropLayer,
    decoration: composed.decoration,
    seed,
  });
}

const blockingValues = new Set<number>(
  DECOR_TYPES.flatMap((key, index) => (PROP_WALKABILITY[key] !== "carpet" ? [index + 1] : [])),
);

describe("walkable woods (archived pass, sl-0075 superseded)", () => {
  it("generation ships the composition as authored: clusters above pair size exist", () => {
    // The art-direction ruling: no re-spacing in the pipeline. A forested
    // tiny world therefore still contains governed solid clusters larger
    // than two — the pass would have dissolved them, and its dormancy is
    // exactly what this pins.
    const { result } = generated(1);
    const { decoration, width, height } = result.composed;
    let bigClusterCells = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cell = y * width + x;
        if (decoration.wildernessProps[cell] !== 1 || !blockingValues.has(decoration.propLayer[cell] as number)) continue;
        if (terrainSolidAt(result.composed, cell)) continue;
        let contacts = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (blockingValues.has(decoration.propLayer[ny * width + nx] as number)) contacts += 1;
          }
        }
        if (contacts >= 2) bigClusterCells += 1;
      }
    }
    assert.ok(bigClusterCells > 0, "authored composition retains multi-contact prop cells");
  });

  it("invoked directly, the pass caps governed clusters at orthogonal pairs", () => {
    for (const seed of [1, 2, 3, 4, 5, 9]) {
      const { result, config } = generated(seed);
      const composed = result.composed;
      const stats = runPass(composed, config.seed);
      const { decoration, width, height } = composed;
      const { propLayer, wildernessProps } = decoration;
      let governedSolids = 0;
      let violations = 0;
      const samples: string[] = [];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const cell = y * width + x;
          if (wildernessProps[cell] !== 1 || !blockingValues.has(propLayer[cell] as number)) continue;
          if (terrainSolidAt(composed, cell)) continue;
          governedSolids += 1;
          let orthogonal = 0;
          let diagonal = 0;
          let authored = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              const n = ny * width + nx;
              if (!blockingValues.has(propLayer[n] as number)) continue;
              if (wildernessProps[n] !== 1) authored += 1;
              else if (dx === 0 || dy === 0) orthogonal += 1;
              else diagonal += 1;
            }
          }
          if (authored > 0 || diagonal > 0 || orthogonal > 1) {
            violations += 1;
            if (samples.length < 6) {
              samples.push(`seed ${seed} (${x},${y}) orth=${orthogonal} diag=${diagonal} authored=${authored}`);
            }
          }
        }
      }
      assert.ok(governedSolids > 0, `seed ${seed}: wilderness produced governed solids`);
      assert.ok(
        violations <= stats.stuck * 3,
        `seed ${seed}: ${violations} cluster violations exceed 3x the ${stats.stuck} reported stuck cells\n  ${samples.join("\n  ")}`,
      );
      assert.ok(stats.stuck <= Math.ceil(governedSolids / 100), `seed ${seed}: stuck ${stats.stuck} above 1% of ${governedSolids}`);
    }
  });

  it("relocates without deleting and settles in one pass", () => {
    const { result, config } = generated(3);
    const composed = result.composed;
    const histogram = (): Map<number, number> => {
      const map = new Map<number, number>();
      for (let cell = 0; cell < composed.width * composed.height; cell += 1) {
        const value = composed.decoration.propLayer[cell] as number;
        if (value !== 0) map.set(value, (map.get(value) ?? 0) + 1);
      }
      return map;
    };
    const before = histogram();
    const stats = runPass(composed, config.seed);
    const after = histogram();
    assert.deepEqual(
      [...after.entries()].sort((a, b) => a[0] - b[0]),
      [...before.entries()].sort((a, b) => a[0] - b[0]),
      "per-species counts are byte-equal: relocation, never deletion",
    );
    assert.ok(stats.moved > 0, "the pass did real work on a forested world");
    const again = runPass(composed, config.seed);
    assert.equal(again.moved, 0, "second pass relocates nothing");
    assert.equal(again.stuck, stats.stuck, "stuck census stable");
  });
});
