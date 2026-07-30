import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { generateWorld, type WorldArtifact } from "../src/generation/generate.js";
import { validateArtifact } from "../src/validation/validateArtifact.js";

function tinyArtifact(): WorldArtifact {
  const validation = validateRecipe({
    recipeFormat: 1,
    seed: 1,
    world: { sizePreset: "tiny", climatePreset: "temperate" },
  });
  assert.ok(validation.ok);
  const normalized = normalizeRecipe(validation.recipe);
  return generateWorld(normalized, compileRecipe(normalized));
}

/* Structured clone into a mutable any-shape so tests can corrupt artifacts. */
function corruptible(artifact: WorldArtifact): any {
  return JSON.parse(JSON.stringify(artifact));
}

describe("artifact validation", () => {
  it("passes a freshly generated walking-skeleton world", () => {
    const report = validateArtifact(tinyArtifact());
    assert.equal(report.status, "pass");
    assert.deepEqual(report.errors, []);
  });

  it("fails when a chunk is missing", () => {
    const bad = corruptible(tinyArtifact());
    bad.chunks.pop();
    const report = validateArtifact(bad as WorldArtifact);
    assert.equal(report.status, "fail");
    assert.ok(report.errors.some((error) => error.includes("exactly once")));
  });

  it("fails when a chunk coordinate repeats", () => {
    const bad = corruptible(tinyArtifact());
    bad.chunks[1].coord = [0, 0];
    const report = validateArtifact(bad as WorldArtifact);
    assert.equal(report.status, "fail");
    assert.ok(report.errors.some((error) => error.includes("more than once")));
  });

  it("fails on wrong row width and out-of-range palette indices", () => {
    const truncated = corruptible(tinyArtifact());
    truncated.chunks[0].layers.material[0].pop();
    assert.equal(validateArtifact(truncated as WorldArtifact).status, "fail");

    const outOfRange = corruptible(tinyArtifact());
    outOfRange.chunks[0].layers.material[0][0] = 99;
    assert.equal(validateArtifact(outOfRange as WorldArtifact).status, "fail");
  });

  it("accepts the b57 city-lane path value and refuses beyond it", () => {
    // The 0..1 pin predated behavior 57 and refused the FIRST styled pack
    // export (path 2 = city lane band); canonical, the only world packed
    // before, is style-free and never carried one.
    const laned = corruptible(tinyArtifact());
    laned.chunks[0].layers.path[0][0] = 2;
    assert.equal(validateArtifact(laned as WorldArtifact).status, "pass");

    const beyond = corruptible(tinyArtifact());
    beyond.chunks[0].layers.path[0][0] = 3;
    const report = validateArtifact(beyond as WorldArtifact);
    assert.equal(report.status, "fail");
    assert.ok(report.errors.some((error) => error.includes("path value 3")));
  });

  it("fails on malformed identity hashes and empty palettes", () => {
    const badHash = corruptible(tinyArtifact());
    badHash.generator.recipeSha256 = "not-a-hash";
    assert.equal(validateArtifact(badHash as WorldArtifact).status, "fail");

    const noPalette = corruptible(tinyArtifact());
    noPalette.semanticPalette = [];
    assert.equal(validateArtifact(noPalette as WorldArtifact).status, "fail");
  });
});
