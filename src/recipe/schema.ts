/**
 * W0 WorldRecipe vocabulary (docs/AI_AUTHORING_MODEL.md, "Staged vocabulary").
 *
 * Fields exist here only when the schema, validator, and staged rules allow
 * them at this milestone: seed, named presets, integer permille biases,
 * budgets, and toggles (of which W0 defines none). Relational and named-entity
 * vocabulary is rejected until its solver milestone.
 */

export const RECIPE_FORMAT = 1;

export const SIZE_PRESET_NAMES = ["tiny", "small"] as const;
export type SizePreset = (typeof SIZE_PRESET_NAMES)[number];

export const CLIMATE_PRESET_NAMES = ["temperate", "cold_coastal"] as const;
export type ClimatePreset = (typeof CLIMATE_PRESET_NAMES)[number];

export const SEED_MIN = 0;
export const SEED_MAX = 4294967295; // uint32

export const PERMILLE_MIN = -1000;
export const PERMILLE_MAX = 1000;

export const BIAS_FIELD_NAMES = [
  "northElevationPermille",
  "temperaturePermille",
  "moisturePermille",
] as const;
export type BiasField = (typeof BIAS_FIELD_NAMES)[number];

export const BUDGET_RANGES = {
  regionCount: { min: 1, max: 16, default: 4 },
  settlementCount: { min: 0, max: 16, default: 0 },
  primaryRouteCount: { min: 0, max: 8, default: 0 },
  landmarkCount: { min: 0, max: 8, default: 0 },
} as const;
export type BudgetField = keyof typeof BUDGET_RANGES;
export const BUDGET_FIELD_NAMES = Object.keys(BUDGET_RANGES).sort() as readonly BudgetField[];

/** W0 defines no toggles; the object may be present but must be empty. */
export const TOGGLE_NAMES: readonly string[] = [];

/** Author-facing recipe as accepted from disk or an authoring client. */
export interface WorldRecipe {
  readonly recipeFormat: typeof RECIPE_FORMAT;
  readonly seed: number;
  readonly world: {
    readonly sizePreset: SizePreset;
    readonly climatePreset: ClimatePreset;
  };
  readonly biases?: { readonly [key in BiasField]?: number };
  readonly budgets?: { readonly [key in BudgetField]?: number };
  readonly toggles?: { readonly [key: string]: boolean };
}

/** Recipe after deterministic normalization: every default made explicit. */
export interface NormalizedWorldRecipe {
  readonly recipeFormat: typeof RECIPE_FORMAT;
  readonly seed: number;
  readonly world: {
    readonly sizePreset: SizePreset;
    readonly climatePreset: ClimatePreset;
  };
  readonly biases: { readonly [key in BiasField]: number };
  readonly budgets: { readonly [key in BudgetField]: number };
  readonly toggles: { readonly [key: string]: boolean };
}

/**
 * Known future vocabulary, refused with a staged-vocabulary explanation rather
 * than a generic unknown-field error.
 */
export const FUTURE_VOCABULARY = new Set([
  "geography",
  "regions",
  "hydrology",
  "routes",
  "settlements",
  "landmarks",
  "structures",
  "decoration",
  "constraints",
]);
