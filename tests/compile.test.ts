import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalJson } from "../src/core/canonicalJson.js";
import {
  compileRecipe,
  generationIdentity,
  resolvedConfigIdentity,
} from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import type { NormalizedWorldRecipe } from "../src/recipe/schema.js";

function normalized(seed: number, sizePreset: "tiny" | "small", climatePreset: "temperate" | "cold_coastal"): NormalizedWorldRecipe {
  const validation = validateRecipe({
    recipeFormat: 1,
    seed,
    world: { sizePreset, climatePreset },
  });
  assert.ok(validation.ok);
  return normalizeRecipe(validation.recipe);
}

describe("recipe compiler", () => {
  it("expands size presets into explicit divisible dimensions", () => {
    const tiny = compileRecipe(normalized(1, "tiny", "temperate"));
    assert.deepEqual(tiny.world, { width: 64, height: 64, chunkWidth: 16, chunkHeight: 16 });
    const small = compileRecipe(normalized(1, "small", "cold_coastal"));
    assert.deepEqual(small.world, { width: 256, height: 256, chunkWidth: 32, chunkHeight: 32 });
  });

  it("expands climate presets and carries biases separately", () => {
    const config = compileRecipe(normalized(1, "small", "cold_coastal"));
    assert.equal(config.climate.baseTemperaturePermille, -150);
    assert.equal(config.climate.baseMoisturePermille, 80);
    assert.equal(config.climate.coastalInfluencePermille, 500);
    assert.equal(config.climate.temperatureBiasPermille, 0);
  });

  it("keeps the dependency state explicit and lists the W2 passes", () => {
    const config = compileRecipe(normalized(1, "tiny", "temperate"));
    assert.equal(config.dependencies.tileforge, null);
    assert.deepEqual(config.passes, ["macro.fields", "hydrology.water", "regions.biomes", "routes.graph"]);
    assert.equal(config.resolvedConfigFormat, 4);
    assert.equal(config.water.seaLevelPermille, 310);
    assert.equal(config.macroFields.temperatureLapse.startElevationPermille, 500);
    assert.equal(config.routes.streetWidth, 2);
    assert.equal(config.routes.highwayWidth, 3);
    assert.equal(config.macroFields.temperature.offsetPermille, 0);
    assert.equal(config.biomes.minRegionCells, 12);
  });

  it("feeds climate presets and biases into the field specs", () => {
    const config = compileRecipe(normalized(1, "small", "cold_coastal"));
    assert.equal(config.macroFields.temperature.offsetPermille, -150);
    assert.equal(config.macroFields.moisture.offsetPermille, 80);
    assert.equal(config.macroFields.elevation.northGradientPermille, 0);
    assert.equal(config.biomes.minRegionCells, 80);
  });

  it("is deterministic: same recipe, byte-identical config and hashes", () => {
    const a = compileRecipe(normalized(7, "tiny", "temperate"));
    const b = compileRecipe(normalized(7, "tiny", "temperate"));
    assert.equal(canonicalJson(a), canonicalJson(b));
    assert.equal(resolvedConfigIdentity(a), resolvedConfigIdentity(b));
  });

  it("changes generation identity when the seed changes", () => {
    const n7 = normalized(7, "tiny", "temperate");
    const n8 = normalized(8, "tiny", "temperate");
    assert.notEqual(
      generationIdentity(n7, compileRecipe(n7)),
      generationIdentity(n8, compileRecipe(n8)),
    );
  });
});
