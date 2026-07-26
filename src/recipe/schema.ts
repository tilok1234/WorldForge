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

/** Decoration vocabulary (stage 1): ambient density around a 400 baseline. */
export const DECORATION_RANGES = {
  densityPermille: { min: 0, max: 1000, default: 400 },
} as const;
export type DecorationField = keyof typeof DECORATION_RANGES;
export const DECORATION_FIELD_NAMES = Object.keys(DECORATION_RANGES).sort() as readonly DecorationField[];

export const LANDMARK_TYPES = ["ancient_fortress", "ruined_city", "world_tree", "crystal_spire", "lighthouse", "hunters_lodge"] as const;
export type LandmarkType = (typeof LANDMARK_TYPES)[number];

export const RELATION_KINDS = ["across_river_from_town", "near_town", "far_from_town", "high_ground", "coastal", "remote_corner"] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];

export interface LandmarkRequest {
  readonly type: LandmarkType;
  readonly relation?: RelationKind;
}

export interface NormalizedLandmarkRequest {
  readonly type: LandmarkType;
  readonly relation: RelationKind | null;
}

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
  /** W5 relational vocabulary: one entry per requested landmark. */
  readonly landmarks?: readonly LandmarkRequest[];
  /** Decoration stage 1: ambient vegetation/ground-cover density. */
  readonly decoration?: { readonly [key in DecorationField]?: number };
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
  readonly landmarks: readonly NormalizedLandmarkRequest[];
  readonly decoration: { readonly [key in DecorationField]: number };
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
  "structures",
  "constraints",
]);
