import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { composeWorld } from "../src/generation/composeWorld.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { validateArtifact } from "../src/validation/validateArtifact.js";
import { PALETTE_INDEX, WORLD_PALETTE } from "../src/regions/biomes.js";
import { WATER_NONE } from "../src/hydrology/hydrology.js";

function worldFor(seed: number, landmarks?: unknown) {
  const validation = validateRecipe({
    recipeFormat: 1,
    seed,
    world: { sizePreset: "tiny", climatePreset: "temperate" },
    budgets: { settlementCount: 3, landmarkCount: 1, primaryRouteCount: 1 },
    ...(landmarks === undefined ? {} : { landmarks }),
  });
  assert.ok(validation.ok, JSON.stringify(validation));
  const normalized = normalizeRecipe(validation.recipe);
  const config = compileRecipe(normalized);
  return { normalized, config, composed: composeWorld(config) };
}

describe("settlement planning", () => {
  it("plans a town plus outposts with geography-derived purposes (seeds 1-4)", () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      const { composed } = worldFor(seed);
      assert.deepEqual(composed.routesResult.errors, [], `seed ${seed}`);
      const plans = composed.settlementPlans;
      assert.ok(plans.length >= 1, `seed ${seed} produced settlements`);
      assert.equal(plans[0]?.kind, "town");
      for (const plan of plans.slice(1)) {
        assert.equal(plan.kind, "outpost");
      }
      for (const plan of plans) {
        assert.ok(
          ["harbor", "crossing", "farming", "mining", "waypoint"].includes(plan.purpose),
          `purpose ${plan.purpose}`,
        );
        assert.ok(plan.structures.length >= 1, `settlement ${plan.id} has structures`);
      }
    }
  });

  it("keeps structure footprints atomic, land-only, and non-overlapping", () => {
    const { composed } = worldFor(2);
    const { width } = composed;
    const claimed = new Set<number>();
    const allPlans = [
      ...composed.settlementPlans.flatMap((plan) =>
        plan.structures.map((s) => ({ x: s.x, y: s.y, w: s.width, h: s.height })),
      ),
      ...composed.landmarkPlans.map((plan) => ({ x: plan.x, y: plan.y, w: plan.width, h: plan.height })),
    ];
    for (const rect of allPlans) {
      for (let sy = 0; sy < rect.h; sy += 1) {
        for (let sx = 0; sx < rect.w; sx += 1) {
          const cell = (rect.y + sy) * width + rect.x + sx;
          assert.ok(!claimed.has(cell), `overlap at cell ${cell}`);
          claimed.add(cell);
          assert.equal(composed.hydro.waterKind[cell], WATER_NONE, "structures stay on land");
        }
      }
    }
    // Settlement footprints paint the layer fully; landmark rects reserve
    // their full extent in records while only walls/gate paint the layer.
    let layerCells = 0;
    for (const value of composed.structureLayer) {
      if (value !== 0) layerCells += 1;
    }
    const settlementCells = composed.settlementPlans.reduce(
      (sum, plan) => sum + plan.structures.reduce((s, r) => s + r.width * r.height, 0),
      0,
    );
    assert.ok(layerCells >= settlementCells && layerCells <= claimed.size);
  });

  it("reaches every structure entrance from the town (exit criterion)", () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      const { composed } = worldFor(seed);
      const entranceErrors = composed.routesResult.errors.filter((error) => error.includes("unreachable"));
      assert.deepEqual(entranceErrors, [], `seed ${seed}`);
    }
  });

  it("resolves identically across repeated composition (order independence)", () => {
    const first = worldFor(3).composed;
    const second = worldFor(3).composed;
    assert.deepEqual(first.settlementPlans, second.settlementPlans);
    assert.deepEqual(first.landmarkPlans, second.landmarkPlans);
  });
});

describe("landmark stamps and blending", () => {
  it("stamps the fortress with walls, gate, and a blended (non-rectangular) edge", () => {
    let sawFortress = false;
    for (let seed = 1; seed <= 6 && !sawFortress; seed += 1) {
      const { composed } = worldFor(seed);
      if (composed.landmarkPlans.length === 0) {
        continue;
      }
      sawFortress = true;
      const plan = composed.landmarkPlans[0]!;
      const { width } = composed;
      const gate = composed.structureLayer[plan.entranceY * width + plan.entranceX];
      assert.equal(gate, 1, "gate cell carries structure.fortress_gate");

      // Blend ring: the one-cell border outside the footprint must not be a
      // uniform material (no unexplained hard rectangle).
      const ringMaterials = new Set<number>();
      for (let sx = -1; sx <= plan.width; sx += 1) {
        for (const sy of [-1, plan.height]) {
          const x = plan.x + sx;
          const y = plan.y + sy;
          if (x >= 0 && y >= 0 && x < width && y < composed.height) {
            ringMaterials.add(composed.grid[y * width + x] as number);
          }
        }
      }
      assert.ok(ringMaterials.size >= 2, "blend ring mixes materials");
      const gravel = PALETTE_INDEX["terrain.gravel"];
      const nearby = new Set<number>();
      for (let sy = -3; sy < plan.height + 3; sy += 1) {
        for (let sx = -3; sx < plan.width + 3; sx += 1) {
          const x = plan.x + sx;
          const y = plan.y + sy;
          if (x >= 0 && y >= 0 && x < width && y < composed.height) {
            nearby.add(composed.grid[y * width + x] as number);
          }
        }
      }
      assert.ok(nearby.has(gravel), "blend scatter reaches the surroundings");
    }
    assert.ok(sawFortress, "at least one seed places the fortress");
  });
});

describe("relational vocabulary", () => {
  it("rejects malformed landmark requests", () => {
    assert.equal(
      validateRecipe({
        recipeFormat: 1,
        seed: 1,
        world: { sizePreset: "tiny", climatePreset: "temperate" },
        landmarks: [{ type: "flying_castle" }],
      }).ok,
      false,
    );
    assert.equal(
      validateRecipe({
        recipeFormat: 1,
        seed: 1,
        world: { sizePreset: "tiny", climatePreset: "temperate" },
        budgets: { landmarkCount: 1 },
        landmarks: [
          { type: "ancient_fortress" },
          { type: "ancient_fortress" },
        ],
      }).ok,
      false,
      "requests beyond the landmark budget fail",
    );
  });

  it("honors near_town and reports unsatisfiable constraints honestly", () => {
    let satisfied = 0;
    let named = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const { composed } = worldFor(seed, [{ type: "ancient_fortress", relation: "near_town" }]);
      const town = composed.settlementPlans[0];
      if (composed.landmarkPlans.length === 1 && town !== undefined) {
        const plan = composed.landmarkPlans[0]!;
        const distance = Math.max(
          Math.abs(plan.x + Math.trunc(plan.width / 2) - town.anchorX),
          Math.abs(plan.y + Math.trunc(plan.height / 2) - town.anchorY),
        );
        assert.ok(distance <= Math.trunc(composed.width / 5) + 5, `seed ${seed}: near_town distance ${distance}`);
        satisfied += 1;
      } else {
        assert.ok(
          composed.routesResult.errors.some((error) => error.includes("near_town") || error.includes("landmark")),
          `seed ${seed}: failure must be named`,
        );
        named += 1;
      }
    }
    assert.ok(satisfied + named === 6 && satisfied > 0, "solver both satisfies and honestly fails");
  });

  it("artifact format 5 carries settlements, landmarks, and the structure layer", () => {
    const { normalized, config } = worldFor(1);
    const result = generateWorldDetailed(normalized, config);
    assert.equal(result.artifact.formatVersion, 5);
    assert.deepEqual(result.artifact.semanticPalette, [...WORLD_PALETTE]);
    const report = validateArtifact(result.artifact, { minRegionCells: config.biomes.minRegionCells });
    assert.equal(report.status, "pass", report.errors.join("; "));
    assert.ok(result.artifact.settlements.length >= 1);
    let structureCells = 0;
    for (const chunk of result.artifact.chunks) {
      for (const row of chunk.layers.structure) {
        for (const cell of row) {
          if (cell !== 0) structureCells += 1;
        }
      }
    }
    assert.ok(structureCells > 0, "structure layer present in chunks");
  });
});
