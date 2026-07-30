import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { composeWorld } from "../src/generation/composeWorld.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { loadWorldArtifact } from "../src/consumers/typescript/loader.js";
import { PALETTE_INDEX } from "../src/regions/biomes.js";
import { DECOR_TYPES } from "../src/decoration/decorate.js";
import { FENCE_TYPES } from "../src/settlements/farms.js";

function composedFor(seed: number) {
  const validation = validateRecipe({
    recipeFormat: 1,
    seed,
    world: { sizePreset: "tiny", climatePreset: "temperate" },
    budgets: { settlementCount: 3, landmarkCount: 1, primaryRouteCount: 1 },
  });
  assert.ok(validation.ok);
  const normalized = normalizeRecipe(validation.recipe);
  const config = compileRecipe(normalized);
  return { normalized, config, composed: composeWorld(config) };
}

describe("points of interest, phase A", () => {
  it("places spaced, budgeted discoveries deterministically", () => {
    let total = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const { composed, config } = composedFor(seed);
      assert.ok(composed.pois.length <= config.decoration.poiCount, `seed ${seed} budget`);
      total += composed.pois.length;
      for (let i = 0; i < composed.pois.length; i += 1) {
        for (let j = i + 1; j < composed.pois.length; j += 1) {
          const a = composed.pois[i]!;
          const b = composed.pois[j]!;
          assert.ok(
            Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) >= config.decoration.poiSpacing,
            `seed ${seed}: pois ${a.id}/${b.id} too close`,
          );
        }
      }
    }
    assert.ok(total >= 12, `discoveries exist across seeds (${total})`);
    const first = composedFor(3).composed.pois;
    const second = composedFor(3).composed.pois;
    assert.deepEqual(first, second);
  });

  it("keeps POI stamps off traversal-critical cells", () => {
    const { composed } = composedFor(2);
    const { width } = composed;
    const road = PALETTE_INDEX["terrain.packed_road"];
    const cobble = PALETTE_INDEX["terrain.cobble"];
    const poiProps = new Set(
      [
        "prop.campfire", "prop.game_rack", "prop.standing_stone", "prop.runestone",
        "prop.broken_wagon", "prop.bone_pile", "prop.altar", "prop.brazier",
        "prop.gravestones", "prop.lone_grave",
      ].map((key) => DECOR_TYPES.indexOf(key as never) + 1),
    );
    for (let index = 0; index < composed.grid.length; index += 1) {
      if (!poiProps.has(composed.decoration.propLayer[index] as number)) continue;
      assert.ok(composed.grid[index] !== road && composed.grid[index] !== cobble, `POI prop on corridor at ${index}`);
      assert.equal(composed.structureLayer[index], 0, `POI prop on structure at ${index}`);
      assert.equal(composed.routesResult.pathLayer[index], 0, `POI prop on trail at ${index}`);
    }
    void width;
  });

  it("builds graveyards with iron fencing when placed", () => {
    const iron = FENCE_TYPES.indexOf("fence.iron") + 1;
    let sawGraveyard = false;
    for (let seed = 1; seed <= 6 && !sawGraveyard; seed += 1) {
      const { composed } = composedFor(seed);
      const graveyard = composed.pois.find((poi) => poi.type === "poi.graveyard");
      if (graveyard === undefined) continue;
      sawGraveyard = true;
      let ironCells = 0;
      for (const value of composed.farms.fenceLayer) {
        if (value === iron) ironCells += 1;
      }
      assert.ok(ironCells >= 10, `graveyard fencing exists (${ironCells})`);
    }
    assert.ok(sawGraveyard, "at least one seed places a graveyard");
  });

  it("places structure discoveries whose pass cells walk in the loader", () => {
    const PASS: Record<string, readonly number[]> = {
      "structure.cave_mouth": [0, 1],
      "structure.mine_shaft": [2, 3],
      "structure.stone_circle": [1, 4, 7],
      "structure.crypt": [2, 3],
      "structure.ruin": [],
      "structure.giant_skeleton": [5, 6, 7],
      "structure.den": [2, 3],
      // Lone buildings (behavior 41) block fully, like ruins: the POI is
      // the dressing around them, not an interior.
      "structure.house_abandoned": [],
      "structure.cottage": [],
      "structure.hermit_hut": [],
      // Logging camp (behavior 69): the sawmill blocks fully (b49 roster).
      "structure.sawmill": [],
    };
    let checkedStructures = 0;
    for (let seed = 1; seed <= 8 && checkedStructures < 3; seed += 1) {
      const { normalized, config } = composedFor(seed);
      const { artifact } = generateWorldDetailed(normalized, config);
      const loaded = loadWorldArtifact(JSON.parse(JSON.stringify(artifact)));
      assert.ok(loaded.ok);
      for (const poi of loaded.world.pois) {
        if (poi.structure === undefined) continue;
        checkedStructures += 1;
        const pass = PASS[poi.structure.type];
        assert.ok(pass !== undefined, `known pass model for ${poi.structure.type}`);
        for (let sy = 0; sy < poi.structure.h; sy += 1) {
          for (let sx = 0; sx < poi.structure.w; sx += 1) {
            const cellIndex: number = sy * poi.structure.w + sx;
            const expected: boolean = (pass as readonly number[]).includes(cellIndex);
            assert.equal(
              loaded.world.walkableAt(poi.structure.x + sx, poi.structure.y + sy),
              expected,
              `${poi.structure.type} cell ${cellIndex} walkability`,
            );
          }
        }
      }
    }
    assert.ok(checkedStructures > 0, "structure POIs occur across seeds");
  });

  it("stages the lumber crew: sawmill, kit, and the cut edge (behavior 69)", () => {
    let sawCamp = false;
    for (let seed = 1; seed <= 12 && !sawCamp; seed += 1) {
      const { composed, config } = composedFor(seed);
      const camp = composed.pois.find((poi) => poi.type === "poi.logging_camp");
      if (camp === undefined) continue;
      sawCamp = true;
      assert.ok(
        camp.structure !== undefined && camp.structure.type === "structure.sawmill",
        "logging camp without its sawmill",
      );
      const { width, height } = config.world;
      const at = (key: string): number => DECOR_TYPES.indexOf(key as never) + 1;
      let cookfires = 0;
      let logPiles = 0;
      let blocks = 0;
      let stumps = 0;
      for (let dy = -5; dy <= 5; dy += 1) {
        for (let dx = -5; dx <= 5; dx += 1) {
          const x = camp.x + dx;
          const y = camp.y + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const value = composed.decoration.propLayer[y * width + x] as number;
          if (value === at("prop.cookfire")) cookfires += 1;
          if (value === at("prop.log_pile")) logPiles += 1;
          if (value === at("prop.chopping_block")) blocks += 1;
          if (value === at("prop.stump")) stumps += 1;
        }
      }
      assert.ok(cookfires >= 1, "camp cookfire missing");
      assert.ok(logPiles >= 2, "stacked timber missing");
      assert.ok(blocks >= 1, "chopping block missing");
      // treesNear >= 8 at placement and the footprint clears at most 6,
      // so the cut edge always fells at least two.
      assert.ok(stumps >= 2, "the cut edge left no stumps");
    }
    assert.ok(sawCamp, "no tiny seed 1-12 stages a logging camp");
  });

  it("beaches the wreck on a sand arc by open water (behavior 70)", () => {
    let sawCove = false;
    for (let seed = 1; seed <= 24 && !sawCove; seed += 1) {
      const { composed, config } = composedFor(seed);
      const cove = composed.pois.find((poi) => poi.type === "poi.shipwreck_cove");
      if (cove === undefined) continue;
      sawCove = true;
      const { width, height } = config.world;
      const sand = PALETTE_INDEX["terrain.sand"];
      assert.equal(composed.grid[cove.y * width + cove.x], sand, "cove anchor off the sand");
      const at = (key: string): number => DECOR_TYPES.indexOf(key as never) + 1;
      let wrecks = 0;
      let cargo = 0;
      let shore = false;
      for (let dy = -3; dy <= 3; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const x: number = cove.x + dx;
          const y: number = cove.y + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const index = y * width + x;
          const value = composed.decoration.propLayer[index] as number;
          if (value === at("prop.wreck")) wrecks += 1;
          if (value === at("prop.crates") || value === at("prop.loot_pile")) cargo += 1;
          if (composed.hydro.waterKind[index] !== 0 && composed.hydro.isRiver[index] === 0) shore = true;
        }
      }
      assert.equal(wrecks, 1, "the cove has exactly one hull");
      assert.ok(cargo >= 1, "the cargo washed away");
      assert.ok(shore, "a shipwreck needs the water that put it there");
    }
    assert.ok(sawCove, "no tiny seed 1-24 beaches a wreck");
  });

  it("carries pois through the artifact and the public loader", () => {
    const { normalized, config } = composedFor(1);
    const { artifact } = generateWorldDetailed(normalized, config);
    assert.equal(artifact.formatVersion, 8);
    const loaded = loadWorldArtifact(JSON.parse(JSON.stringify(artifact)));
    assert.ok(loaded.ok);
    assert.equal(loaded.world.pois.length, artifact.pois.length);
    for (const poi of loaded.world.pois) {
      assert.ok(loaded.world.inBounds(poi.cell[0], poi.cell[1]));
      assert.ok(poi.type.startsWith("poi."));
    }
  });
});
