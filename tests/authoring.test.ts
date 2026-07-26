import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateRecipe } from "../src/recipe/validate.js";
import { normalizeRecipe, recipeIdentity } from "../src/recipe/normalize.js";
import { compileRecipe } from "../src/recipe/compile.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import {
  approvalMatches,
  buildApproval,
  compareWorlds,
  diffRecipes,
  explainRecipe,
  renderRecipeDiff,
  summarizeWorld,
  validateBrief,
} from "../src/authoring/authoring.js";
import type { WorldRecipe } from "../src/recipe/schema.js";

const BASE: WorldRecipe = {
  recipeFormat: 1,
  seed: 7,
  world: { sizePreset: "tiny", climatePreset: "temperate" },
  budgets: { settlementCount: 3, landmarkCount: 1, primaryRouteCount: 1 },
};

describe("W9 authoring workflow", () => {
  it("validates intent briefs and rejects malformed ones", () => {
    const good = validateBrief({
      briefFormat: 1,
      intent: "A cold coastal world with a fortress guarding the river mouth.",
      constraints: ["keep the accepted seed", "town on the coast"],
      provenance: { author: "user", authoringClient: "chat", date: "2026-07-26" },
    });
    assert.ok(good.ok);
    const bad = validateBrief({ briefFormat: 2, intent: "", extras: true });
    assert.ok(!bad.ok);
    assert.ok(bad.issues.some((issue) => issue.path === "$.briefFormat"));
    assert.ok(bad.issues.some((issue) => issue.path === "$.intent"));
    assert.ok(bad.issues.some((issue) => issue.path === "$.extras"));
  });

  it("explains recipes with identities and every consequential setting", () => {
    const text = explainRecipe(BASE);
    assert.match(text, /seed 7/);
    assert.match(text, /tiny \(64x64/);
    assert.match(text, /3 settlements/);
    assert.match(text, /recipeSha256 [0-9a-f]{64}/);
    assert.match(text, /generation identity [0-9a-f]{64}/);
  });

  it("produces structured, identity-aware recipe diffs", () => {
    const revised: WorldRecipe = {
      ...BASE,
      seed: 7,
      biases: { northElevationPermille: 200 },
      decoration: { densityPermille: 700 },
    };
    const diff = diffRecipes(BASE, revised);
    assert.ok(diff.identityChanges);
    const paths = diff.changes.map((change) => change.path);
    assert.ok(paths.includes("$.biases.northElevationPermille"));
    assert.ok(paths.includes("$.decoration.densityPermille"));
    assert.ok(!paths.includes("$.seed"), "unchanged seed is not reported");
    const text = renderRecipeDiff(diff);
    assert.match(text, /northElevationPermille: 0 -> 200/);
    // A no-op edit normalizes identically and reports no changes.
    const same = diffRecipes(BASE, { ...BASE, biases: {} });
    assert.equal(same.changes.length, 0);
    assert.ok(!same.identityChanges);
  });

  it("summarizes and compares generated candidates", () => {
    const validated = validateRecipe(BASE);
    assert.ok(validated.ok);
    const normalized = normalizeRecipe(validated.recipe);
    const a = generateWorldDetailed(normalized, compileRecipe(normalized)).artifact;
    const otherValidated = validateRecipe({ ...BASE, seed: 8 });
    assert.ok(otherValidated.ok);
    const otherNormalized = normalizeRecipe(otherValidated.recipe);
    const b = generateWorldDetailed(otherNormalized, compileRecipe(otherNormalized)).artifact;
    const summary = summarizeWorld(a);
    assert.ok(summary.propCells > 0, "summary counts decoration");
    const text = compareWorlds(a, b);
    assert.match(text, /A: seed 7/);
    assert.match(text, /B: seed 8/);
    assert.match(text, /settlement plans: \d+ vs \d+/);
    assert.match(text, /terrain\.grass: \d+ vs \d+/);
  });

  it("records approval states the user owns and detects drift", () => {
    const approval = buildApproval(BASE, {
      accept: true,
      baseline: true,
      note: "provisional baseline",
      date: "2026-07-26",
    });
    assert.equal(approval.state, "accepted");
    assert.ok(approval.visualBaseline.approved);
    assert.equal(approval.recipeSha256, recipeIdentity(normalizeRecipe(BASE)));
    assert.match(approval.visualBaseline.generationIdentitySha256 ?? "", /^[0-9a-f]{64}$/);
    assert.ok(approvalMatches(BASE, approval));
    // Any recipe change invalidates the recorded approval.
    assert.ok(!approvalMatches({ ...BASE, seed: 8 }, approval));
  });
});
