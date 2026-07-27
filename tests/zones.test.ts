import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateRecipe } from "../src/recipe/validate.js";
import { normalizeRecipe, recipeIdentity } from "../src/recipe/normalize.js";
import { compileRecipe } from "../src/recipe/compile.js";
import { buildMacroFields } from "../src/fields/macroFields.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { PALETTE_INDEX } from "../src/regions/biomes.js";

const BASE = {
  recipeFormat: 1,
  seed: 11,
  world: { sizePreset: "tiny", climatePreset: "temperate" },
  budgets: { settlementCount: 2, primaryRouteCount: 1, landmarkCount: 0 },
};

/** Two zones side by side: hard-frozen west, parched east. */
const TWO_ZONES = {
  grid: [2, 1],
  seams: "hard",
  entries: [
    { temperaturePermille: -400, moisturePermille: 60 },
    { temperaturePermille: 250, moisturePermille: -250 },
  ],
};

function compiled(recipe: unknown) {
  const validation = validateRecipe(recipe);
  assert.ok(validation.ok, JSON.stringify(validation.ok ? [] : validation.issues));
  const normalized = normalizeRecipe(validation.recipe);
  return { normalized, config: compileRecipe(normalized) };
}

describe("zone composition (behavior 43)", () => {
  it("hard seams give each zone its climate character", () => {
    const { config } = compiled({ ...BASE, zones: TWO_ZONES });
    const fields = buildMacroFields(config);
    const { width, height } = config.world;
    let westColder = 0;
    let samples = 0;
    for (let y = 8; y < height - 8; y += 8) {
      for (let x = 4; x < width / 2 - 8; x += 8) {
        const west = fields.temperature[y * width + x] as number;
        const east = fields.temperature[y * width + (x + Math.trunc(width / 2))] as number;
        samples += 1;
        if (west < east) westColder += 1;
      }
    }
    assert.ok(westColder / samples > 0.9, `west colder in ${westColder}/${samples} samples`);
  });

  it("blended seams grade the border instead of stepping it", () => {
    const hard = buildMacroFields(compiled({ ...BASE, zones: TWO_ZONES }).config);
    const blended = buildMacroFields(
      compiled({ ...BASE, zones: { ...TWO_ZONES, seams: "blended" } }).config,
    );
    const { width } = { width: 64 };
    const y = 32;
    // At the seam column the hard map steps the full offset difference;
    // the blended map must be strictly gentler there.
    const seam = width / 2;
    const hardStep = Math.abs(
      (hard.temperature[y * width + seam] as number) - (hard.temperature[y * width + seam - 1] as number),
    );
    const blendedStep = Math.abs(
      (blended.temperature[y * width + seam] as number) -
        (blended.temperature[y * width + seam - 1] as number),
    );
    assert.ok(blendedStep < hardStep, `blended step ${blendedStep} < hard step ${hardStep}`);
    // And far inside a zone core the character survives blending.
    const westCore = blended.temperature[y * width + 8] as number;
    const eastCore = blended.temperature[y * width + width - 8] as number;
    assert.ok(westCore < eastCore, "zone cores keep their character under blending");
  });

  it("a zoned tiny world grows snow west and dry grass east", () => {
    const { normalized, config } = compiled({ ...BASE, zones: TWO_ZONES });
    const { artifact } = generateWorldDetailed(normalized, config);
    const { width, height, chunkWidth, chunkHeight } = artifact.dimensions;
    const counts = { westSnow: 0, eastSnow: 0, westDry: 0, eastDry: 0 };
    const snow = PALETTE_INDEX["terrain.snow"];
    const dry = PALETTE_INDEX["terrain.dry_grass"];
    for (const chunk of artifact.chunks) {
      const baseX = (chunk.coord[0] as number) * chunkWidth;
      const baseY = (chunk.coord[1] as number) * chunkHeight;
      chunk.layers.material.forEach((row, yy) => {
        row.forEach((value, xx) => {
          const west = baseX + xx < width / 2;
          if (value === snow) counts[west ? "westSnow" : "eastSnow"] += 1;
          if (value === dry) counts[west ? "westDry" : "eastDry"] += 1;
        });
      });
    }
    assert.ok(counts.westSnow > counts.eastSnow, `snow west ${counts.westSnow} > east ${counts.eastSnow}`);
    assert.ok(counts.eastDry > counts.westDry, `dry east ${counts.eastDry} > west ${counts.westDry}`);
    assert.ok(height > 0);
  });

  it("zones join the recipe identity", () => {
    const bare = compiled({ ...BASE }).normalized;
    const zoned = compiled({ ...BASE, zones: TWO_ZONES }).normalized;
    assert.equal(bare.zones, null);
    assert.notEqual(recipeIdentity(bare), recipeIdentity(zoned));
  });

  it("rejects a grid the world does not divide by", () => {
    const validation = validateRecipe({ ...BASE, zones: { ...TWO_ZONES, grid: [3, 1], entries: [{}, {}, {}] } });
    assert.ok(!validation.ok);
    assert.match(JSON.stringify(validation.issues), /must divide evenly/);
  });

  it("rejects a wrong entry count with the expected number", () => {
    const validation = validateRecipe({ ...BASE, zones: { ...TWO_ZONES, entries: [{}] } });
    assert.ok(!validation.ok);
    assert.match(JSON.stringify(validation.issues), /expected 2 entries/);
  });

  it("rejects an unknown seam mode", () => {
    const validation = validateRecipe({ ...BASE, zones: { ...TWO_ZONES, seams: "soft" } });
    assert.ok(!validation.ok);
    assert.match(JSON.stringify(validation.issues), /blended.*hard/);
  });
});
