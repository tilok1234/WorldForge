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

  it("hard seams stay sharper than blended, and the frontier wanders", () => {
    const hard = buildMacroFields(compiled({ ...BASE, zones: TWO_ZONES }).config);
    const blended = buildMacroFields(
      compiled({ ...BASE, zones: { ...TWO_ZONES, seams: "blended" } }).config,
    );
    const width = 64;
    // Per row, find the biggest single-cell temperature step and where it
    // sits. Hard mode (behavior 44: wandering frontier + 2-cell settle
    // blur) must remain sharper than blended, and the frontier column must
    // vary across rows instead of running ruler-straight down the grid line.
    const rowMaxStep = (fields: { temperature: readonly number[] }, y: number) => {
      let best = 0;
      let at = 0;
      for (let x = 17; x < width - 16; x += 1) {
        const step = Math.abs(
          (fields.temperature[y * width + x] as number) - (fields.temperature[y * width + x - 1] as number),
        );
        if (step > best) {
          best = step;
          at = x;
        }
      }
      return { best, at };
    };
    let hardSharper = 0;
    const frontier = new Set<number>();
    for (let y = 6; y < 60; y += 3) {
      const h = rowMaxStep(hard, y);
      const b = rowMaxStep(blended, y);
      if (h.best > b.best) hardSharper += 1;
      frontier.add(h.at);
    }
    assert.ok(hardSharper >= 14, `hard sharper in ${hardSharper}/18 rows`);
    assert.ok(frontier.size >= 4, `frontier wanders across ${frontier.size} columns`);
    // And far inside a zone core the character survives blending.
    const y = 32;
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

describe("anchor-shaped zones (behavior 45)", () => {
  const ANCHORED = {
    layout: "anchors",
    seams: "hard",
    entries: [
      { anchor: [10, 10], weight: 1000, temperaturePermille: -400 },
      { anchor: [54, 54], weight: 1000, temperaturePermille: 300 },
    ],
  };

  it("territory belongs to the nearest anchor", () => {
    const { config } = compiled({ ...BASE, zones: ANCHORED });
    const fields = buildMacroFields(config);
    const width = 64;
    const nearCold = fields.temperature[12 * width + 12] as number;
    const nearHot = fields.temperature[52 * width + 52] as number;
    assert.ok(nearCold < nearHot, `cold near cold anchor (${nearCold} < ${nearHot})`);
  });

  it("weight enlarges a zone's territory", () => {
    const light = compiled({ ...BASE, zones: ANCHORED }).config;
    const heavy = compiled({
      ...BASE,
      zones: {
        ...ANCHORED,
        entries: [
          { anchor: [10, 10], weight: 3000, temperaturePermille: -400 },
          { anchor: [54, 54], weight: 1000, temperaturePermille: 300 },
        ],
      },
    }).config;
    const count = (config: typeof light): number => {
      const fields = buildMacroFields(config);
      let cold = 0;
      for (const value of fields.temperature) if (value < 300) cold += 1;
      return cold;
    };
    assert.ok(count(heavy) > count(light), "heavier anchor claims more cold land");
  });

  it("requires an anchor per entry and rejects grid fields", () => {
    const missing = validateRecipe({
      ...BASE,
      zones: { layout: "anchors", seams: "hard", entries: [{ temperaturePermille: 1 }, { anchor: [4, 4] }] },
    });
    assert.ok(!missing.ok);
    assert.match(JSON.stringify(missing.issues), /requires an anchor cell/);
    const gridded = validateRecipe({
      ...BASE,
      zones: { layout: "anchors", grid: [2, 1], seams: "hard", entries: [{ anchor: [4, 4] }, { anchor: [50, 50] }] },
    });
    assert.ok(!gridded.ok);
    assert.match(JSON.stringify(gridded.issues), /not used by the anchors layout/);
  });
});
