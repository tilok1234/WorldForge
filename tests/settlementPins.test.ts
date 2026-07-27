import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateRecipe } from "../src/recipe/validate.js";
import { normalizeRecipe, recipeIdentity } from "../src/recipe/normalize.js";
import { compileRecipe } from "../src/recipe/compile.js";
import { generateWorldDetailed } from "../src/generation/generate.js";

function generate(recipe: unknown) {
  const validation = validateRecipe(recipe);
  assert.ok(validation.ok, JSON.stringify(validation.ok ? [] : validation.issues));
  const normalized = normalizeRecipe(validation.recipe);
  const config = compileRecipe(normalized);
  const result = generateWorldDetailed(normalized, config);
  return { result, config };
}

const BASE = {
  recipeFormat: 1,
  seed: 5,
  world: { sizePreset: "tiny", climatePreset: "temperate" },
  budgets: { settlementCount: 3, landmarkCount: 0, primaryRouteCount: 1 },
};

describe("settlement pins: rank order (behavior 37)", () => {
  // The free solver's choices for this seed anchor the pin tests: those
  // cells are proven settleable, so pinning there must succeed.
  const free = generate({ ...BASE });
  const freeSettlements = free.result.artifact.settlements;
  assert.ok(freeSettlements.length >= 2, "seed must place at least two free settlements");
  const capitalCell = (freeSettlements[0] as (typeof freeSettlements)[number]).anchor;
  const otherCell = (freeSettlements[1] as (typeof freeSettlements)[number]).anchor;

  it("pin order is rank order: the first pin authors the capital", () => {
    // Pin rank 0 to the cell the free solver ranked SECOND: the crown must
    // follow the pin, not the score.
    const { result } = generate({
      ...BASE,
      settlements: [{ at: [otherCell[0], otherCell[1]] }],
    });
    assert.deepEqual(result.composed.routesResult.errors, []);
    const crowned = result.artifact.settlements[0] as (typeof result.artifact.settlements)[number];
    assert.deepEqual(crowned.anchor, [otherCell[0], otherCell[1]]);
    assert.equal(crowned.id, 0);
    assert.equal(crowned.kind, "city");
  });

  it("free competition fills the ranks behind the pins", () => {
    const { result } = generate({
      ...BASE,
      settlements: [{ at: [capitalCell[0], capitalCell[1]] }],
    });
    assert.deepEqual(result.composed.routesResult.errors, []);
    assert.equal(result.artifact.settlements.length, freeSettlements.length);
  });

  it("honors a near constraint within its radius", () => {
    const { result } = generate({
      ...BASE,
      settlements: [{ near: { cell: [capitalCell[0], capitalCell[1]], radius: 6 } }],
    });
    assert.deepEqual(result.composed.routesResult.errors, []);
    const anchor = (result.artifact.settlements[0] as (typeof result.artifact.settlements)[number]).anchor;
    const dx = Math.abs((anchor[0] as number) - (capitalCell[0] as number));
    const dy = Math.abs((anchor[1] as number) - (capitalCell[1] as number));
    assert.ok(Math.max(dx, dy) <= 6, `anchor ${anchor} within 6 of ${capitalCell}`);
  });

  it("fails an unsettleable pin with a named error, never relocating", () => {
    // (0, 0) is on the world rim, which the candidate pass excludes.
    const { result } = generate({ ...BASE, settlements: [{ at: [0, 0] }] });
    assert.match(
      result.composed.routesResult.errors.join("\n"),
      /settlement rank 0 pinned at \(0, 0\): cell is not settleable/,
    );
  });

  it("fails crowded pins with a named spacing error", () => {
    const { result } = generate({
      ...BASE,
      settlements: [
        { at: [capitalCell[0], capitalCell[1]] },
        { at: [capitalCell[0], capitalCell[1]] },
      ],
    });
    assert.match(
      result.composed.routesResult.errors.join("\n"),
      /settlement rank 1 pinned at .*: too close to another pinned settlement/,
    );
  });

  it("an unsatisfiable near search names its window", () => {
    const { result } = generate({
      ...BASE,
      settlements: [
        { at: [capitalCell[0], capitalCell[1]] },
        // Radius 1 around the pinned capital: everything is inside spacing.
        { near: { cell: [capitalCell[0], capitalCell[1]], radius: 1 } },
      ],
    });
    assert.match(
      result.composed.routesResult.errors.join("\n"),
      /settlement rank 1 found no settleable site within 1 of/,
    );
  });
});

describe("settlement pins: recipe vocabulary", () => {
  it("normalization includes the settlements section in the identity", () => {
    const bare = normalizeRecipe(
      (validateRecipe({ ...BASE }) as { ok: true; recipe: never }).recipe,
    );
    const pinned = normalizeRecipe(
      (validateRecipe({ ...BASE, settlements: [{ at: [10, 10] }] }) as { ok: true; recipe: never }).recipe,
    );
    assert.deepEqual(bare.settlements, []);
    assert.deepEqual(pinned.settlements, [{ at: [10, 10], near: null }]);
    assert.notEqual(recipeIdentity(bare), recipeIdentity(pinned));
  });

  it("compiles rank-ordered settlementSpecs", () => {
    const validation = validateRecipe({
      ...BASE,
      settlements: [{ at: [10, 10] }, { near: { cell: [40, 40], radius: 8 } }],
    });
    assert.ok(validation.ok);
    const config = compileRecipe(normalizeRecipe(validation.recipe));
    assert.deepEqual(config.settlementSpecs, [
      { at: [10, 10], near: null },
      { at: null, near: { cell: [40, 40], radius: 8 } },
    ]);
  });

  it("rejects an entry with both at and near", () => {
    const validation = validateRecipe({
      ...BASE,
      settlements: [{ at: [10, 10], near: { cell: [10, 10], radius: 4 } }],
    });
    assert.ok(!validation.ok);
    assert.match(JSON.stringify(validation.issues), /at and near are mutually exclusive/);
  });

  it("rejects an empty entry (entry order is rank order)", () => {
    const validation = validateRecipe({ ...BASE, settlements: [{}] });
    assert.ok(!validation.ok);
    assert.match(JSON.stringify(validation.issues), /exactly one of at or near is required/);
  });

  it("rejects more entries than the settlement budget", () => {
    const validation = validateRecipe({
      ...BASE,
      settlements: [{ at: [10, 10] }, { at: [40, 40] }, { at: [20, 40] }, { at: [40, 20] }],
    });
    assert.ok(!validation.ok);
    assert.match(JSON.stringify(validation.issues), /exceed budgets.settlementCount \(3\)/);
  });

  it("rejects out-of-world pin coordinates with a named path", () => {
    const validation = validateRecipe({ ...BASE, settlements: [{ at: [999, 10] }] });
    assert.ok(!validation.ok);
    assert.match(JSON.stringify(validation.issues), /settlements\[0\].at/);
  });
});
