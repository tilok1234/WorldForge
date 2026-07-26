import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalJson } from "../src/core/canonicalJson.js";
import { normalizeRecipe, recipeIdentity } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";

const VALID_TINY = {
  recipeFormat: 1,
  seed: 1,
  world: { sizePreset: "tiny", climatePreset: "temperate" },
};

function expectInvalid(input: unknown, pathFragment: string, messageFragment?: string): void {
  const result = validateRecipe(input);
  assert.equal(result.ok, false, `expected invalid: ${JSON.stringify(input)}`);
  if (result.ok) {
    return;
  }
  const hit = result.issues.find((issue) => issue.path.includes(pathFragment));
  assert.ok(hit, `expected an issue at ${pathFragment}, got ${JSON.stringify(result.issues)}`);
  if (messageFragment !== undefined) {
    assert.ok(
      hit.message.includes(messageFragment),
      `expected "${messageFragment}" in "${hit.message}"`,
    );
  }
}

describe("recipe validation", () => {
  it("accepts the minimal tiny recipe", () => {
    assert.equal(validateRecipe(VALID_TINY).ok, true);
  });

  it("accepts the full W0 vocabulary", () => {
    const result = validateRecipe({
      recipeFormat: 1,
      seed: 103991,
      world: { sizePreset: "small", climatePreset: "cold_coastal" },
      biases: { northElevationPermille: 350, temperaturePermille: -400, moisturePermille: 200 },
      budgets: { regionCount: 4, settlementCount: 5, primaryRouteCount: 2, landmarkCount: 1 },
    });
    assert.equal(result.ok, true);
  });

  it("rejects unknown root fields", () => {
    expectInvalid({ ...VALID_TINY, frobnicate: true }, "$.frobnicate", "unknown field");
  });

  it("rejects premature vocabulary and malformed landmark requests", () => {
    // constraints remains future vocabulary with the staged explanation.
    expectInvalid({ ...VALID_TINY, constraints: {} }, "$.constraints", "W0 recipe vocabulary");
    // landmarks is W5 vocabulary now; malformed entries fail on their merits.
    expectInvalid(
      { ...VALID_TINY, landmarks: [{ relation: "across_river_from_main_town" }] },
      "$.landmarks[0]",
    );
    expectInvalid(
      {
        ...VALID_TINY,
        budgets: { landmarkCount: 1 },
        landmarks: [{ type: "ancient_fortress", relation: "beside_the_sea" }],
      },
      "$.landmarks[0].relation",
    );
  });

  it("rejects wrong recipeFormat, bad seeds, and bad presets", () => {
    expectInvalid({ ...VALID_TINY, recipeFormat: 2 }, "$.recipeFormat");
    expectInvalid({ ...VALID_TINY, seed: 1.5 }, "$.seed", "integer");
    expectInvalid({ ...VALID_TINY, seed: -1 }, "$.seed", "between");
    expectInvalid({ ...VALID_TINY, seed: 4294967296 }, "$.seed", "between");
    expectInvalid(
      { ...VALID_TINY, world: { sizePreset: "huge", climatePreset: "temperate" } },
      "$.world.sizePreset",
    );
    expectInvalid({ recipeFormat: 1, seed: 1 }, "$.world");
  });

  it("rejects out-of-range or unknown biases, budgets, and toggles", () => {
    expectInvalid({ ...VALID_TINY, biases: { temperaturePermille: 1001 } }, "$.biases", "between");
    expectInvalid({ ...VALID_TINY, biases: { tempPermille: 0 } }, "$.biases.tempPermille");
    expectInvalid({ ...VALID_TINY, budgets: { regionCount: 0 } }, "$.budgets.regionCount");
    expectInvalid({ ...VALID_TINY, budgets: { questCount: 1 } }, "$.budgets.questCount");
    expectInvalid({ ...VALID_TINY, toggles: { debug: true } }, "$.toggles.debug", "no toggles");
  });

  it("rejects non-object recipes", () => {
    expectInvalid([], "$");
    expectInvalid("recipe", "$");
    expectInvalid(null, "$");
  });
});

describe("recipe normalization", () => {
  it("applies every default explicitly", () => {
    const validation = validateRecipe(VALID_TINY);
    assert.ok(validation.ok);
    const normalized = normalizeRecipe(validation.recipe);
    assert.deepEqual(normalized.biases, {
      northElevationPermille: 0,
      temperaturePermille: 0,
      moisturePermille: 0,
    });
    assert.deepEqual(normalized.budgets, {
      regionCount: 4,
      settlementCount: 0,
      primaryRouteCount: 0,
      landmarkCount: 0,
    });
    assert.deepEqual(normalized.toggles, {});
  });

  it("produces identical bytes and identity regardless of authoring key order", () => {
    const scrambled = JSON.parse(
      '{"world": {"climatePreset": "temperate", "sizePreset": "tiny"}, "seed": 1, "recipeFormat": 1}',
    ) as unknown;
    const a = validateRecipe(VALID_TINY);
    const b = validateRecipe(scrambled);
    assert.ok(a.ok && b.ok);
    const normalA = normalizeRecipe(a.recipe);
    const normalB = normalizeRecipe(b.recipe);
    assert.equal(canonicalJson(normalA), canonicalJson(normalB));
    assert.equal(recipeIdentity(normalA), recipeIdentity(normalB));
  });
});
