import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { composeWorld } from "../src/generation/composeWorld.js";
import { DECAL_TYPES, DECOR_TYPES } from "../src/decoration/decorate.js";
import { PALETTE_INDEX, WORLD_PALETTE } from "../src/regions/biomes.js";
import { WATER_NONE } from "../src/hydrology/hydrology.js";

function composedFor(seed: number, densityPermille?: number) {
  const validation = validateRecipe({
    recipeFormat: 1,
    seed,
    world: { sizePreset: "tiny", climatePreset: "temperate" },
    budgets: { settlementCount: 3, landmarkCount: 1, primaryRouteCount: 1 },
    ...(densityPermille === undefined ? {} : { decoration: { densityPermille } }),
  });
  assert.ok(validation.ok, JSON.stringify(validation));
  return composeWorld(compileRecipe(normalizeRecipe(validation.recipe)));
}

describe("decoration stage 1", () => {
  it("is deterministic and never mutates the underlying world", () => {
    const first = composedFor(5);
    const second = composedFor(5);
    assert.deepEqual(first.decoration, second.decoration);
    const bare = composedFor(5, 0);
    assert.equal(bare.decoration.propCount, 0);
    // Decoration off/on: terrain, routes, structures identical.
    assert.deepEqual(bare.grid, first.grid);
    assert.deepEqual(bare.structureLayer, first.structureLayer);
    assert.deepEqual(bare.routesResult.routes, first.routesResult.routes);
  });

  it("populates the world and scales with the density knob", () => {
    const normal = composedFor(5);
    const lush = composedFor(5, 800);
    assert.ok(normal.decoration.propCount > 200, `props placed (${normal.decoration.propCount})`);
    assert.ok(normal.decoration.overlayCount > 50, `overlays placed (${normal.decoration.overlayCount})`);
    assert.ok(
      lush.decoration.propCount > normal.decoration.propCount,
      "density 800 places more than 400",
    );
  });

  it("keeps every prop off traversal-critical and structural cells", () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      const composed = composedFor(seed);
      const { width } = composed;
      const road = PALETTE_INDEX["terrain.packed_road"];
      const cobble = PALETTE_INDEX["terrain.cobble"];
      const crossings = new Set<number>();
      for (const route of composed.routesResult.routes) {
        for (const crossing of route.crossings) crossings.add(crossing.cell);
      }
      const entrances = new Set<number>();
      for (const plan of composed.settlementPlans) {
        for (const structure of plan.structures) {
          entrances.add(structure.entranceY * width + structure.entranceX);
        }
      }
      for (const plan of composed.landmarkPlans) {
        entrances.add(plan.entranceY * width + plan.entranceX);
      }
      for (let index = 0; index < composed.decoration.propLayer.length; index += 1) {
        if (composed.decoration.propLayer[index] === 0) continue;
        const material = composed.grid[index] as number;
        assert.ok(material !== road && material !== cobble, `prop on corridor at ${index}`);
        assert.equal(composed.routesResult.pathLayer[index], 0, `prop on trail at ${index}`);
        assert.equal(composed.structureLayer[index], 0, `prop on structure at ${index}`);
        assert.ok(!crossings.has(index), `prop on crossing at ${index}`);
        assert.ok(!entrances.has(index), `prop on entrance at ${index}`);
      }
    }
  });

  it("honors substrate rules for overlays, aquatic decals, and species", () => {
    const composed = composedFor(2);
    const grass = PALETTE_INDEX["terrain.grass"];
    const dryGrass = PALETTE_INDEX["terrain.dry_grass"];
    const rock = PALETTE_INDEX["terrain.rock"];
    const lilypads = DECAL_TYPES.indexOf("decal.lilypads") + 1;
    const puddles = DECAL_TYPES.indexOf("decal.puddles") + 1;
    const mud = PALETTE_INDEX["terrain.mud"];
    const swamp = PALETTE_INDEX["terrain.swamp"];
    for (let index = 0; index < composed.grid.length; index += 1) {
      const material = composed.grid[index] as number;
      if (composed.decoration.tallGrassLayer[index] === 1) {
        assert.ok(material === grass || material === dryGrass, "tall grass substrate");
      }
      if (composed.decoration.mossLayer[index] === 1) {
        assert.equal(material, rock, "moss substrate");
      }
      const decal = composed.decoration.decalLayer[index];
      if (decal === lilypads) {
        assert.ok(composed.hydro.waterKind[index] !== WATER_NONE, "lilypads on water");
      }
      if (decal === puddles) {
        assert.ok(material === mud || material === swamp, "puddles on wet ground");
      }
      const prop = composed.decoration.propLayer[index] as number;
      if (prop !== 0) {
        const key = DECOR_TYPES[prop - 1] as string;
        const biome = WORLD_PALETTE[material] as string;
        const aquatic = ["prop.reeds", "prop.cattails", "prop.rowboat", "prop.buoy"];
        if (biome.startsWith("water.")) {
          assert.ok(aquatic.includes(key), `${key} stays off open water`);
        }
      }
    }
  });

  it("varies forest density in patches rather than uniform scatter", () => {
    const composed = composedFor(3);
    const { width, height } = composed;
    // Count trees per 16x16 block; a patchy forest has empty blocks AND
    // dense blocks, a uniform scatter has neither.
    const treeKeys = new Set(
      ["prop.oak", "prop.birch", "prop.pine"].map((key) => DECOR_TYPES.indexOf(key as never) + 1),
    );
    const grass = PALETTE_INDEX["terrain.grass"];
    let empty = 0;
    let dense = 0;
    let blocks = 0;
    for (let by = 0; by + 16 <= height; by += 16) {
      for (let bx = 0; bx + 16 <= width; bx += 16) {
        let trees = 0;
        let grassCells = 0;
        for (let y = by; y < by + 16; y += 1) {
          for (let x = bx; x < bx + 16; x += 1) {
            const index = y * width + x;
            if (composed.grid[index] === grass) grassCells += 1;
            if (treeKeys.has(composed.decoration.propLayer[index] as number)) trees += 1;
          }
        }
        if (grassCells < 180) continue; // only mostly-grass blocks are comparable
        blocks += 1;
        if (trees <= 12) empty += 1;
        if (trees >= 40) dense += 1;
      }
    }
    // Measured on the tuned curve (seed 3): blocks span 4..123 trees — open
    // meadows with lone trees against closed forest cores near 50% occupancy.
    assert.ok(blocks >= 8, `enough grass blocks to measure (${blocks})`);
    assert.ok(empty > 0, "meadow blocks exist");
    assert.ok(dense > 0, "forest-core blocks exist");
  });
});
