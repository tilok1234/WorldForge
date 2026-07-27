import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { composeWorld } from "../src/generation/composeWorld.js";

/**
 * Behavior 47: plaza furniture (fountain, well) never sits on pathLayer.
 * A spur trail may thread the plaza, and in a mountain notch that trail
 * can be the only corridor to a landmark — the-eight-lands' ruined-city
 * spur was severed by a fountain before this rule.
 */
describe("plaza furniture yields the trail", () => {
  it("places no fountain or well on pathLayer cells (seeds 1-4)", () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      const validation = validateRecipe({
        recipeFormat: 1,
        seed,
        world: { sizePreset: "small", climatePreset: "temperate" },
        budgets: { regionCount: 4, settlementCount: 8, primaryRouteCount: 2, landmarkCount: 2 },
      });
      assert.ok(validation.ok);
      const composed = composeWorld(compileRecipe(normalizeRecipe(validation.recipe)));
      const width = composed.width;
      for (const plan of composed.settlementPlans) {
        for (const structure of plan.structures) {
          if (structure.type !== "structure.fountain" && structure.type !== "structure.well") continue;
          for (let dy = 0; dy < structure.height; dy += 1) {
            for (let dx = 0; dx < structure.width; dx += 1) {
              const cell = (structure.y + dy) * width + structure.x + dx;
              assert.equal(
                composed.routesResult.pathLayer[cell],
                0,
                `seed ${seed}: ${structure.type} cell (${structure.x + dx}, ${structure.y + dy}) sits on a trail`,
              );
            }
          }
        }
      }
    }
  });
});
