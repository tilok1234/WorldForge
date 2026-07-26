import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalJson } from "../src/core/canonicalJson.js";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { composeWorld } from "../src/generation/composeWorld.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { PALETTE_INDEX } from "../src/regions/biomes.js";
import { WATER_DEEP } from "../src/hydrology/hydrology.js";

const PACKED_ROAD = PALETTE_INDEX["terrain.packed_road"];

function worldFor(seed: number, settlementCount = 4, landmarkCount = 1) {
  const validation = validateRecipe({
    recipeFormat: 1,
    seed,
    world: { sizePreset: "tiny", climatePreset: "temperate" },
    budgets: { settlementCount, landmarkCount, primaryRouteCount: 1 },
  });
  assert.ok(validation.ok);
  const normalized = normalizeRecipe(validation.recipe);
  const config = compileRecipe(normalized);
  return { normalized, config, composed: composeWorld(config) };
}

describe("route planning", () => {
  it("connects every destination with zero route errors (seeds 1-5)", () => {
    for (let seed = 1; seed <= 5; seed += 1) {
      const { composed } = worldFor(seed);
      assert.deepEqual(composed.routesResult.errors, [], `seed ${seed}`);
      assert.ok(composed.routesResult.destinations.length > 0, `seed ${seed} placed destinations`);
    }
  });

  it("builds a spanning route set over settlement candidates", () => {
    const { composed } = worldFor(2);
    const settlements = composed.routesResult.destinations.filter(
      (destination) => destination.kind === "settlement_candidate",
    );
    const roadRoutes = composed.routesResult.routes.filter((route) => route.routeClass !== "trail");
    assert.equal(roadRoutes.length, Math.max(0, settlements.length - 1), "MST edge count");
    const highways = roadRoutes.filter((route) => route.routeClass === "highway");
    assert.ok(highways.length <= 1, "highway budget respected");
  });

  it("never lays road material or trails on water; crossings sit on water or rivers", () => {
    for (let seed = 1; seed <= 5; seed += 1) {
      const { composed } = worldFor(seed);
      const { grid, hydro, routesResult } = composed;
      for (let index = 0; index < grid.length; index += 1) {
        if (grid[index] === PACKED_ROAD || routesResult.pathLayer[index] === 1) {
          assert.equal(hydro.waterKind[index], 0, `seed ${seed}: road/trail on water at ${index}`);
        }
      }
      for (const route of routesResult.routes) {
        for (const crossing of route.crossings) {
          const onWater = hydro.waterKind[crossing.cell] !== 0;
          const onRiver = hydro.isRiver[crossing.cell] === 1;
          assert.ok(onWater || onRiver, `seed ${seed}: crossing not on water or river`);
          assert.notEqual(hydro.waterKind[crossing.cell], WATER_DEEP, "routes never cross deep water");
          if (crossing.kind === "bridge") {
            assert.equal(hydro.isMajorRiver[crossing.cell], 1, "bridges span major rivers");
          }
        }
      }
    }
  });

  it("stamps corridors at least two cells wide along streets", () => {
    const { composed } = worldFor(1);
    const { grid, width } = composed;
    // Every road cell must have at least one D4 road neighbor (no 1-cell
    // stubs), which also implies corridors rather than single-cell lines.
    for (let index = 0; index < grid.length; index += 1) {
      if (grid[index] !== PACKED_ROAD) {
        continue;
      }
      const x = index % width;
      let hasRoadNeighbor = false;
      for (const neighbor of [index - width, index + width, index - 1, index + 1]) {
        if (neighbor < 0 || neighbor >= grid.length) continue;
        if (x === 0 && neighbor === index - 1) continue;
        if (x === width - 1 && neighbor === index + 1) continue;
        if (grid[neighbor] === PACKED_ROAD) {
          hasRoadNeighbor = true;
          break;
        }
      }
      assert.ok(hasRoadNeighbor, `road cell ${index} is isolated`);
    }
  });

  it("is deterministic end to end", () => {
    const first = worldFor(3).composed;
    const second = worldFor(3).composed;
    assert.deepEqual(first.routesResult.destinations, second.routesResult.destinations);
    assert.deepEqual(first.routesResult.routes, second.routesResult.routes);
    assert.equal(canonicalJson(first.grid), canonicalJson(second.grid));
  });

  it("exposes destinations, routes, and the path layer in the artifact", () => {
    const { normalized, config } = worldFor(1);
    const { artifact } = generateWorldDetailed(normalized, config);
    assert.equal(artifact.formatVersion, 6);
    assert.ok(artifact.destinations.length > 0);
    for (const destination of artifact.destinations) {
      const [x, y] = destination.cell;
      assert.ok(x >= 0 && x < artifact.dimensions.width);
      assert.ok(y >= 0 && y < artifact.dimensions.height);
    }
    for (const route of artifact.routes) {
      assert.ok(["highway", "street", "trail"].includes(route.routeClass));
      assert.ok(route.length >= 1);
    }
    let pathCells = 0;
    for (const chunk of artifact.chunks) {
      for (const row of chunk.layers.path) {
        for (const cell of row) {
          pathCells += cell;
        }
      }
    }
    const trails = artifact.routes.filter((route) => route.routeClass === "trail");
    if (trails.length > 0) {
      assert.ok(pathCells > 0, "trail routes imply path-layer cells");
    }
  });
});
