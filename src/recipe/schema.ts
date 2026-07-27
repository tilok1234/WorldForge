/**
 * W0 WorldRecipe vocabulary (docs/AI_AUTHORING_MODEL.md, "Staged vocabulary").
 *
 * Fields exist here only when the schema, validator, and staged rules allow
 * them at this milestone: seed, named presets, integer permille biases,
 * budgets, and toggles (of which W0 defines none). Relational and named-entity
 * vocabulary is rejected until its solver milestone.
 */

export const RECIPE_FORMAT = 1;

export const SIZE_PRESET_NAMES = ["tiny", "small", "medium", "large"] as const;
export type SizePreset = (typeof SIZE_PRESET_NAMES)[number];

export const CLIMATE_PRESET_NAMES = [
  "temperate",
  "cold_coastal",
  "arid_steppe",
  "wet_lowland",
  "frozen_north",
] as const;
export type ClimatePresetX = never;

/** How populated a world is: structures, roads, props, discoveries. */
export const DENSITY_PRESET_NAMES = ["sparse", "balanced", "dense"] as const;
export type DensityPreset = (typeof DENSITY_PRESET_NAMES)[number];
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
  // Caps sized for the large (1024-cell) preset: a 1M-cell world needs
  // more than 16 settlements to read settled (raised with recipe.presets 5).
  settlementCount: { min: 0, max: 32, default: 0 },
  primaryRouteCount: { min: 0, max: 12, default: 0 },
  landmarkCount: { min: 0, max: 12, default: 0 },
} as const;
export type BudgetField = keyof typeof BUDGET_RANGES;
export const BUDGET_FIELD_NAMES = Object.keys(BUDGET_RANGES).sort() as readonly BudgetField[];

/** Decoration vocabulary (stage 1): ambient density around a 400 baseline. */
export const DECORATION_RANGES = {
  densityPermille: { min: 0, max: 1000, default: 400 },
} as const;
export type DecorationField = keyof typeof DECORATION_RANGES;
export const DECORATION_FIELD_NAMES = Object.keys(DECORATION_RANGES).sort() as readonly DecorationField[];

export const LANDMARK_TYPES = ["ancient_fortress", "ruined_city", "world_tree", "crystal_spire", "lighthouse", "hunters_lodge", "mountain_hamlet"] as const;
export type LandmarkType = (typeof LANDMARK_TYPES)[number];

/** Per-recipe stamp types are namespaced "recipe.<name>". */
export const RECIPE_STAMP_PREFIX = "recipe.";
export const STAMP_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export const RELATION_KINDS = ["across_river_from_town", "near_town", "far_from_town", "high_ground", "coastal", "remote_corner"] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];

/**
 * World side length per size preset, duplicated from the recipe compiler's
 * preset table so pin coordinates validate early with a named path. A compile
 * test asserts the two tables agree (tests/compile.test.ts).
 */
export const SIZE_PRESET_CELLS: { readonly [key in SizePreset]: number } = {
  tiny: 64,
  small: 256,
  medium: 512,
  large: 1024,
};

export const NEAR_RADIUS_MIN = 1;
export const NEAR_RADIUS_MAX = 64;

/** Soft cap on cell overrides — warn-only by ratified decision (plan §6.4). */
export const CELL_OVERRIDE_SOFT_CAP = 64;

export interface CellRef {
  readonly 0: number;
  readonly 1: number;
  readonly length: 2;
}

export interface LandmarkRequest {
  /** A fixture type or "recipe.<name>" naming a declared authored stamp. */
  readonly type: LandmarkType | string;
  readonly relation?: RelationKind;
  /** Pinned anchor cell [x, y]; excludes relation and near. */
  readonly at?: readonly [number, number];
  /** Constrained anchor search; excludes relation and at. */
  readonly near?: { readonly cell: readonly [number, number]; readonly radius: number };
}

export interface NormalizedLandmarkRequest {
  readonly type: LandmarkType | string;
  readonly relation: RelationKind | null;
  readonly at: readonly [number, number] | null;
  readonly near: { readonly cell: readonly [number, number]; readonly radius: number } | null;
}

/** An inline authored stamp: stampFormat 1, type "recipe.<name>". */
export interface AuthoredStampEntry {
  readonly name: string;
  readonly stamp: unknown;
}

/**
 * A designer's spot decision on one cell. material never names water (water
 * meaning belongs to hydrology); clears remove the decorated prop/decal.
 */
export interface CellOverride {
  readonly cell: readonly [number, number];
  readonly material?: string;
  readonly clearProp?: boolean;
  readonly clearDecal?: boolean;
}

export interface NormalizedCellOverride {
  readonly cell: readonly [number, number];
  readonly material: string | null;
  readonly clearProp: boolean;
  readonly clearDecal: boolean;
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
    readonly densityPreset?: DensityPreset;
  };
  readonly biases?: { readonly [key in BiasField]?: number };
  readonly budgets?: { readonly [key in BudgetField]?: number };
  readonly toggles?: { readonly [key: string]: boolean };
  /** W5 relational vocabulary: one entry per requested landmark. */
  readonly landmarks?: readonly LandmarkRequest[];
  /** Decoration stage 1: ambient vegetation/ground-cover density. */
  readonly decoration?: { readonly [key in DecorationField]?: number };
  /** Authored placement (behavior 36): per-recipe stamps for one-off sites. */
  readonly authoredStamps?: readonly AuthoredStampEntry[];
  /** Authored placement (behavior 36): sparse spot decisions on cells. */
  readonly cellOverrides?: readonly CellOverride[];
}

/** Recipe after deterministic normalization: every default made explicit. */
export interface NormalizedWorldRecipe {
  readonly recipeFormat: typeof RECIPE_FORMAT;
  readonly seed: number;
  readonly world: {
    readonly sizePreset: SizePreset;
    readonly climatePreset: ClimatePreset;
    readonly densityPreset: DensityPreset;
  };
  readonly biases: { readonly [key in BiasField]: number };
  readonly budgets: { readonly [key in BudgetField]: number };
  readonly toggles: { readonly [key: string]: boolean };
  readonly landmarks: readonly NormalizedLandmarkRequest[];
  readonly decoration: { readonly [key in DecorationField]: number };
  readonly authoredStamps: readonly AuthoredStampEntry[];
  readonly cellOverrides: readonly NormalizedCellOverride[];
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
