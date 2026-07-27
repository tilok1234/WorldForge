import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateRecipe } from "../src/recipe/validate.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { compileRecipe } from "../src/recipe/compile.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { validateArtifact } from "../src/validation/validateArtifact.js";
import { loadWorldArtifact } from "../src/consumers/typescript/loader.js";

/** A minimal valid per-recipe stamp: a 5x5 gravel platform. */
const TEST_STAMP = {
  stampFormat: 1,
  type: "recipe.test-site",
  footprint: { width: 5, height: 5 },
  anchor: { x: 2, y: 2 },
  entrance: { x: 2, y: 4 },
  substrate: { maxSlopePermille: 160 },
  blendRadius: 1,
  legend: { o: { material: "terrain.gravel" } },
  cells: ["ooooo", "ooooo", "ooooo", "ooooo", "ooooo"],
};

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
  budgets: { settlementCount: 3, landmarkCount: 1, primaryRouteCount: 1 },
};

describe("authored placement: pins", () => {
  // The free solver's choice for this seed anchors the pin tests: pinning
  // exactly there must succeed, and `near` around it must land in radius.
  const free = generate({ ...BASE, landmarks: [{ type: "ancient_fortress" }] });
  const freeAnchor = free.result.artifact.destinations.find((d) => d.kind === "landmark_candidate");
  assert.ok(freeAnchor !== undefined);
  const [ax, ay] = freeAnchor.cell;

  it("places a landmark exactly at a valid pinned cell", () => {
    const { result } = generate({
      ...BASE,
      landmarks: [{ type: "ancient_fortress", at: [ax, ay] }],
    });
    assert.deepEqual(result.composed.routesResult.errors, []);
    const anchor = result.artifact.destinations.find((d) => d.kind === "landmark_candidate");
    assert.deepEqual(anchor?.cell, [ax, ay]);
    assert.equal(result.artifact.landmarks.length, 1);
  });

  it("fails a pin on the world edge with a named error, never relocating", () => {
    const { result } = generate({
      ...BASE,
      landmarks: [{ type: "ancient_fortress", at: [0, 0] }],
    });
    assert.equal(result.artifact.landmarks.length, 0);
    assert.match(
      result.composed.routesResult.errors.join("\n"),
      /pinned at \(0, 0\): footprint constraints fail/,
    );
  });

  it("honors a near constraint within its radius", () => {
    const { result } = generate({
      ...BASE,
      landmarks: [{ type: "ancient_fortress", near: { cell: [ax, ay], radius: 8 } }],
    });
    assert.deepEqual(result.composed.routesResult.errors, []);
    const anchor = result.artifact.destinations.find((d) => d.kind === "landmark_candidate");
    assert.ok(anchor !== undefined);
    const dx = Math.abs((anchor.cell[0] as number) - ax);
    const dy = Math.abs((anchor.cell[1] as number) - ay);
    assert.ok(Math.max(dx, dy) <= 8, `anchor ${anchor.cell} within 8 of (${ax}, ${ay})`);
  });

  it("rejects at + relation as mutually exclusive at validation", () => {
    const validation = validateRecipe({
      ...BASE,
      landmarks: [{ type: "ancient_fortress", at: [ax, ay], relation: "coastal" }],
    });
    assert.ok(!validation.ok);
    assert.match(validation.issues.map((i) => i.message).join("\n"), /mutually exclusive/);
  });

  it("rejects out-of-bounds pins with the world size in the message", () => {
    const validation = validateRecipe({
      ...BASE,
      landmarks: [{ type: "ancient_fortress", at: [64, 3] }],
    });
    assert.ok(!validation.ok);
    assert.match(validation.issues.map((i) => i.message).join("\n"), /64x64/);
  });
});

describe("authored placement: per-recipe stamps", () => {
  it("places a declared recipe stamp like any library landmark", () => {
    const { result } = generate({
      ...BASE,
      landmarks: [{ type: "recipe.test-site" }],
      authoredStamps: [{ name: "test-site", stamp: TEST_STAMP }],
    });
    assert.deepEqual(result.composed.routesResult.errors, []);
    assert.equal(result.artifact.landmarks.length, 1);
    assert.equal(result.artifact.landmarks[0]?.type, "recipe.test-site");
  });

  it("rejects a landmark naming an undeclared recipe stamp", () => {
    const validation = validateRecipe({
      ...BASE,
      landmarks: [{ type: "recipe.missing" }],
    });
    assert.ok(!validation.ok);
    assert.match(validation.issues.map((i) => i.message).join("\n"), /names no declared authored stamp/);
  });

  it("runs inline stamps through the fixture parser's checks", () => {
    const validation = validateRecipe({
      ...BASE,
      landmarks: [{ type: "recipe.bad" }],
      authoredStamps: [
        { name: "bad", stamp: { ...TEST_STAMP, type: "recipe.bad", legend: { o: { material: "not.a.material" } } } },
      ],
    });
    assert.ok(!validation.ok);
    assert.match(validation.issues.map((i) => i.message).join("\n"), /unknown material/);
  });
});

describe("authored placement: cell overrides", () => {
  it("applies material overrides and prop clears, visible to the public loader", () => {
    const base = generate({ ...BASE });
    const loadedBase = loadWorldArtifact(base.result.artifact as unknown);
    assert.ok(loadedBase.ok);
    const world = loadedBase.world;
    const { width, height } = world.dimensions;

    // Find a plain grass cell and a blocking-prop cell to override.
    let grassCell: readonly [number, number] | null = null;
    let propCell: readonly [number, number] | null = null;
    for (let y = 4; y < height - 4 && (grassCell === null || propCell === null); y += 1) {
      for (let x = 4; x < width - 4 && (grassCell === null || propCell === null); x += 1) {
        if (
          grassCell === null &&
          world.materialAt(x, y) === "terrain.grass" &&
          world.propAt(x, y) === null &&
          world.structureAt(x, y) === null
        ) {
          grassCell = [x, y];
        }
        if (propCell === null && world.propAt(x, y) !== null && !world.walkableAt(x, y) && world.structureAt(x, y) === null) {
          propCell = [x, y];
        }
      }
    }
    assert.ok(grassCell !== null && propCell !== null);

    const { result } = generate({
      ...BASE,
      cellOverrides: [
        { cell: grassCell, material: "terrain.gravel" },
        { cell: propCell, clearProp: true },
      ],
    });
    const loaded = loadWorldArtifact(result.artifact as unknown);
    assert.ok(loaded.ok);
    assert.equal(loaded.world.materialAt(grassCell[0], grassCell[1]), "terrain.gravel");
    assert.equal(loaded.world.propAt(propCell[0], propCell[1]), null);
  });

  it("excuses an isolated authored cell from the confetti gate, but only when declared", () => {
    const { result, config } = generate({
      ...BASE,
      cellOverrides: [{ cell: [32, 32], material: "terrain.cobble" }],
    });
    const undeclared = validateArtifact(result.artifact, {
      minRegionCells: config.biomes.minRegionCells,
    });
    const declared = validateArtifact(result.artifact, {
      minRegionCells: config.biomes.minRegionCells,
      authoredCells: [[32, 32]],
    });
    // The isolated cobble cell is a one-cell region either way; only the
    // declared authored cell turns the error into a warning.
    if (undeclared.status === "fail") {
      assert.match(undeclared.errors.join("\n"), /one-cell biome confetti/);
      assert.equal(declared.status, "pass");
      assert.match(declared.warnings.join("\n"), /one-cell authored override/);
    } else {
      // Seed placed the override beside same-material cells: still a pass,
      // and the declared variant must agree.
      assert.equal(declared.status, "pass");
    }
  });

  it("rejects water materials and duplicate cells at validation", () => {
    const validation = validateRecipe({
      ...BASE,
      cellOverrides: [
        { cell: [10, 10], material: "water.deep" },
        { cell: [11, 10], clearProp: true },
        { cell: [11, 10], clearDecal: true },
        { cell: [12, 10] },
      ],
    });
    assert.ok(!validation.ok);
    const messages = validation.issues.map((i) => i.message).join("\n");
    assert.match(messages, /hydrology owns water/);
    assert.match(messages, /duplicate override for cell 11,10/);
    assert.match(messages, /must set material, clearProp, or clearDecal/);
  });
});
