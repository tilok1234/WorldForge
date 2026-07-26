import { canonicalSha256 } from "../core/identity.js";
import {
  BUDGET_RANGES,
  DECORATION_RANGES,
  RECIPE_FORMAT,
  type NormalizedWorldRecipe,
  type WorldRecipe,
} from "./schema.js";

/**
 * Deterministic normalization: every optional field becomes an explicit value.
 * Two recipes describing the same world normalize to identical objects, so the
 * canonical hash of the result is the recipe's identity regardless of key
 * order or which authoring client wrote it.
 */
export function normalizeRecipe(recipe: WorldRecipe): NormalizedWorldRecipe {
  return {
    recipeFormat: RECIPE_FORMAT,
    seed: recipe.seed,
    world: {
      sizePreset: recipe.world.sizePreset,
      climatePreset: recipe.world.climatePreset,
    },
    biases: {
      northElevationPermille: recipe.biases?.northElevationPermille ?? 0,
      temperaturePermille: recipe.biases?.temperaturePermille ?? 0,
      moisturePermille: recipe.biases?.moisturePermille ?? 0,
    },
    budgets: {
      regionCount: recipe.budgets?.regionCount ?? BUDGET_RANGES.regionCount.default,
      settlementCount: recipe.budgets?.settlementCount ?? BUDGET_RANGES.settlementCount.default,
      primaryRouteCount:
        recipe.budgets?.primaryRouteCount ?? BUDGET_RANGES.primaryRouteCount.default,
      landmarkCount: recipe.budgets?.landmarkCount ?? BUDGET_RANGES.landmarkCount.default,
    },
    toggles: {},
    landmarks: (recipe.landmarks ?? []).map((request) => ({
      type: request.type,
      relation: request.relation ?? null,
    })),
    decoration: {
      densityPermille:
        recipe.decoration?.densityPermille ?? DECORATION_RANGES.densityPermille.default,
    },
  };
}

export function recipeIdentity(normalized: NormalizedWorldRecipe): string {
  return canonicalSha256(normalized);
}
