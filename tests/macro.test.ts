import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { channel } from "../src/core/channels.js";
import { fbmPermille, northGradientPermille, valueNoisePermille } from "../src/fields/valueNoise.js";
import { BIOME_KEYS, WORLD_PALETTE, classifyCell } from "../src/regions/biomes.js";
import { composeWorld } from "../src/generation/composeWorld.js";
import { buildContactSheet } from "../src/render/contactSheet.js";
import { encodePng } from "../src/render/png.js";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { validateArtifact } from "../src/validation/validateArtifact.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { canonicalJson } from "../src/core/canonicalJson.js";
import { buildMacroSamples, buildTinyBiomePng } from "../src/testing/macroSamples.js";
import { compareToGolden } from "../src/testing/golden.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function tinyWorld(seed = 1) {
  const validation = validateRecipe({
    recipeFormat: 1,
    seed,
    world: { sizePreset: "tiny", climatePreset: "temperate" },
  });
  assert.ok(validation.ok);
  const normalized = normalizeRecipe(validation.recipe);
  const config = compileRecipe(normalized);
  return { normalized, config };
}

describe("value noise", () => {
  const ch = channel(7, "test.noise");

  it("stays in [0, 1000) and equals the corner hash at lattice points", () => {
    for (let x = -20; x <= 20; x += 7) {
      for (let y = -20; y <= 20; y += 5) {
        const value = valueNoisePermille(ch, x, y, 3, 1);
        assert.ok(value >= 0 && value < 1000);
      }
    }
    assert.equal(valueNoisePermille(ch, 16, 24, 3, 1), ch.hashAt(2, 3, 1) % 1000);
  });

  it("fbm respects weights and is deterministic", () => {
    const octaves = [
      { cellSizeLog2: 4, weightPermille: 600 },
      { cellSizeLog2: 3, weightPermille: 400 },
    ];
    const a = fbmPermille(ch, 5, 9, octaves);
    const b = fbmPermille(ch, 5, 9, octaves);
    assert.equal(a, b);
    assert.ok(a >= 0 && a < 1000);
  });

  it("applies the north gradient symmetrically", () => {
    assert.equal(northGradientPermille(0, 64, 300), 150);
    assert.equal(northGradientPermille(63, 64, 300), -150);
    assert.equal(northGradientPermille(0, 64, 0), 0);
    assert.equal(northGradientPermille(0, 1, 300), 0);
  });
});

describe("biome classification and regions", () => {
  const thresholds = {
    rockElevationMin: 780,
    snowTemperatureMax: 250,
    mudMoistureMin: 750,
    mudElevationMax: 400,
    dryMoistureMax: 300,
    dryTemperatureMin: 550,
  };

  it("classifies threshold edges in strict rule order", () => {
    assert.equal(BIOME_KEYS[classifyCell(780, 0, 0, thresholds)], "terrain.rock");
    assert.equal(BIOME_KEYS[classifyCell(779, 500, 249, thresholds)], "terrain.snow");
    assert.equal(BIOME_KEYS[classifyCell(400, 750, 250, thresholds)], "terrain.mud");
    assert.equal(BIOME_KEYS[classifyCell(401, 750, 250, thresholds)], "terrain.grass");
    assert.equal(BIOME_KEYS[classifyCell(500, 299, 550, thresholds)], "terrain.dry_grass");
    assert.equal(BIOME_KEYS[classifyCell(500, 300, 550, thresholds)], "terrain.grass");
  });

  it("produces confetti-free regions that exactly cover the tiny world", () => {
    const { config } = tinyWorld();
    const composed = composeWorld(config);
    let total = 0;
    for (const region of composed.regions) {
      assert.ok(region.cellCount > 1, `region ${region.id} is one-cell confetti`);
      total += region.cellCount;
    }
    assert.equal(total, config.world.width * config.world.height);
  });

  it("reproduces the same macro map for the same seed", () => {
    const { config } = tinyWorld(42);
    const first = composeWorld(config);
    const second = composeWorld(config);
    assert.equal(canonicalJson(first.grid), canonicalJson(second.grid));
    assert.deepEqual(first.regions, second.regions);
  });

  it("generates a validating artifact with regions and macro palette", () => {
    const { normalized, config } = tinyWorld();
    const result = generateWorldDetailed(normalized, config);
    const report = validateArtifact(result.artifact, {
      minRegionCells: config.biomes.minRegionCells,
    });
    assert.equal(report.status, "pass", report.errors.join("; "));
    assert.deepEqual(result.artifact.semanticPalette, [...WORLD_PALETTE]);
    assert.ok(result.artifact.regions.length > 0);
  });
});

describe("renders", () => {
  it("encodes deterministic PNGs with correct headers", () => {
    const rgb = new Uint8Array([255, 0, 0, 0, 255, 0]);
    const png = encodePng(2, 1, rgb);
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(png.readUInt32BE(16), 2, "IHDR width");
    assert.equal(png.readUInt32BE(20), 1, "IHDR height");
    assert.deepEqual(encodePng(2, 1, rgb), png);
    assert.throws(() => encodePng(2, 2, rgb), /bytes/);
  });

  it("builds a deterministic contact sheet with a complete index", () => {
    const { normalized } = tinyWorld(9);
    const first = buildContactSheet(normalized, 4);
    const second = buildContactSheet(normalized, 4);
    assert.deepEqual(first.index, second.index);
    assert.deepEqual(first.png, second.png);
    assert.equal(first.index.tiles.length, 4);
    assert.deepEqual(
      first.index.tiles.map((tile) => tile.seed),
      [9, 10, 11, 12],
    );
  });
});

describe("macro golden fixtures", () => {
  it("reproduces the committed macro samples byte-for-byte", () => {
    const comparison = compareToGolden(ROOT, "fixtures/golden/macro-samples.json", buildMacroSamples());
    assert.ok(comparison.expectedCanonical !== null, "run tools/update-golden.ts and commit");
    assert.ok(comparison.matches, "macro output drifted from the committed golden samples");
  });

  it("reproduces the committed tiny biome render byte-for-byte", () => {
    const expected = readFileSync(join(ROOT, "fixtures", "golden", "tiny-biomes.png"));
    assert.deepEqual(buildTinyBiomePng(), expected);
  });
});
