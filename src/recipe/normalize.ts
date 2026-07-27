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
      // Not every map should be this populated: density is an authoring
      // choice. Balanced is the default; the canonical world pins dense.
      densityPreset: recipe.world.densityPreset ?? "balanced",
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
      at: request.at === undefined ? null : [request.at[0], request.at[1]],
      near:
        request.near === undefined
          ? null
          : { cell: [request.near.cell[0], request.near.cell[1]], radius: request.near.radius },
    })),
    // Settlement entries normalize to their EFFECTIVE rank (explicit rank or
    // the entry's index, behavior 38) and then sort by it, so an explicit
    // rank equal to the default produces the identical identity.
    settlements: (recipe.settlements ?? [])
      .map((request, index) => ({
        at: request.at === undefined ? null : [request.at[0], request.at[1]] as readonly [number, number],
        near:
          request.near === undefined
            ? null
            : { cell: [request.near.cell[0], request.near.cell[1]] as readonly [number, number], radius: request.near.radius },
        rank: request.rank ?? index,
      }))
      .sort((a, b) => a.rank - b.rank),
    decoration: {
      densityPermille:
        recipe.decoration?.densityPermille ?? DECORATION_RANGES.densityPermille.default,
    },
    // Authored stamps sort by name and overrides by cell (row-major) so the
    // normalized identity never depends on authoring order.
    authoredStamps: [...(recipe.authoredStamps ?? [])]
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .map((entry) => ({ name: entry.name, stamp: entry.stamp })),
    cellOverrides: [...(recipe.cellOverrides ?? [])]
      .sort((a, b) => a.cell[1] - b.cell[1] || a.cell[0] - b.cell[0])
      .map((override) => ({
        cell: [override.cell[0], override.cell[1]],
        material: override.material ?? null,
        clearProp: override.clearProp ?? false,
        clearDecal: override.clearDecal ?? false,
      })),
  };
}

export function recipeIdentity(normalized: NormalizedWorldRecipe): string {
  return canonicalSha256(normalized);
}
