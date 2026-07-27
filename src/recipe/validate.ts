import {
  DENSITY_PRESET_NAMES,
  BIAS_FIELD_NAMES,
  DECORATION_FIELD_NAMES,
  DECORATION_RANGES,
  LANDMARK_TYPES,
  RELATION_KINDS,
  BUDGET_FIELD_NAMES,
  BUDGET_RANGES,
  CLIMATE_PRESET_NAMES,
  FUTURE_VOCABULARY,
  PERMILLE_MAX,
  PERMILLE_MIN,
  RECIPE_FORMAT,
  SEED_MAX,
  SEED_MIN,
  SIZE_PRESET_NAMES,
  TOGGLE_NAMES,
  type WorldRecipe,
} from "./schema.js";

export interface RecipeIssue {
  readonly path: string;
  readonly message: string;
}

export type RecipeValidation =
  | { readonly ok: true; readonly recipe: WorldRecipe }
  | { readonly ok: false; readonly issues: readonly RecipeIssue[] };

const ROOT_FIELDS = ["recipeFormat", "seed", "world", "biases", "budgets", "toggles", "landmarks", "decoration"];
const WORLD_FIELDS = ["sizePreset", "climatePreset", "densityPreset"];

export function validateRecipe(input: unknown): RecipeValidation {
  const issues: RecipeIssue[] = [];

  if (!isPlainObject(input)) {
    return failure([{ path: "$", message: "recipe must be a JSON object" }]);
  }

  for (const key of Object.keys(input)) {
    if (ROOT_FIELDS.includes(key)) {
      continue;
    }
    issues.push({
      path: `$.${key}`,
      message: FUTURE_VOCABULARY.has(key)
        ? `"${key}" is not part of the W0 recipe vocabulary; relational and named-entity fields arrive with their generator milestone (docs/AI_AUTHORING_MODEL.md, "Staged vocabulary")`
        : `unknown field "${key}"`,
    });
  }

  if (input["recipeFormat"] !== RECIPE_FORMAT) {
    issues.push({
      path: "$.recipeFormat",
      message: `recipeFormat must be ${RECIPE_FORMAT}`,
    });
  }

  checkInteger(issues, input, "seed", "$.seed", SEED_MIN, SEED_MAX, true);

  const world = input["world"];
  if (!isPlainObject(world)) {
    issues.push({ path: "$.world", message: "world must be an object" });
  } else {
    for (const key of Object.keys(world)) {
      if (!WORLD_FIELDS.includes(key)) {
        issues.push({ path: `$.world.${key}`, message: `unknown field "${key}"` });
      }
    }
    checkEnum(issues, world, "sizePreset", "$.world.sizePreset", SIZE_PRESET_NAMES);
    checkEnum(issues, world, "climatePreset", "$.world.climatePreset", CLIMATE_PRESET_NAMES);
    if (world["densityPreset"] !== undefined) {
      checkEnum(issues, world, "densityPreset", "$.world.densityPreset", DENSITY_PRESET_NAMES);
    }
  }

  const biases = input["biases"];
  if (biases !== undefined) {
    if (!isPlainObject(biases)) {
      issues.push({ path: "$.biases", message: "biases must be an object" });
    } else {
      for (const key of Object.keys(biases)) {
        if (!(BIAS_FIELD_NAMES as readonly string[]).includes(key)) {
          issues.push({ path: `$.biases.${key}`, message: `unknown field "${key}"` });
          continue;
        }
        checkInteger(issues, biases, key, `$.biases.${key}`, PERMILLE_MIN, PERMILLE_MAX, true);
      }
    }
  }

  const budgets = input["budgets"];
  if (budgets !== undefined) {
    if (!isPlainObject(budgets)) {
      issues.push({ path: "$.budgets", message: "budgets must be an object" });
    } else {
      for (const key of Object.keys(budgets)) {
        if (!(BUDGET_FIELD_NAMES as readonly string[]).includes(key)) {
          issues.push({ path: `$.budgets.${key}`, message: `unknown field "${key}"` });
          continue;
        }
        const range = BUDGET_RANGES[key as keyof typeof BUDGET_RANGES];
        checkInteger(issues, budgets, key, `$.budgets.${key}`, range.min, range.max, true);
      }
    }
  }

  const decoration = input["decoration"];
  if (decoration !== undefined) {
    if (!isPlainObject(decoration)) {
      issues.push({ path: "$.decoration", message: "decoration must be an object" });
    } else {
      for (const key of Object.keys(decoration)) {
        if (!(DECORATION_FIELD_NAMES as readonly string[]).includes(key)) {
          issues.push({ path: `$.decoration.${key}`, message: `unknown field "${key}"` });
          continue;
        }
        const range = DECORATION_RANGES[key as keyof typeof DECORATION_RANGES];
        checkInteger(issues, decoration, key, `$.decoration.${key}`, range.min, range.max, true);
      }
    }
  }

  const toggles = input["toggles"];
  if (toggles !== undefined) {
    if (!isPlainObject(toggles)) {
      issues.push({ path: "$.toggles", message: "toggles must be an object" });
    } else {
      for (const key of Object.keys(toggles)) {
        if (!TOGGLE_NAMES.includes(key)) {
          issues.push({
            path: `$.toggles.${key}`,
            message: `unknown toggle "${key}" (W0 defines no toggles)`,
          });
        } else if (typeof toggles[key] !== "boolean") {
          issues.push({ path: `$.toggles.${key}`, message: "toggle must be a boolean" });
        }
      }
    }
  }

  const landmarks = input["landmarks"];
  if (landmarks !== undefined) {
    if (!Array.isArray(landmarks)) {
      issues.push({ path: "$.landmarks", message: "landmarks must be an array" });
    } else {
      if (landmarks.length > 8) {
        issues.push({ path: "$.landmarks", message: "at most 8 landmark requests are supported" });
      }
      const budgetsValue = input["budgets"];
      const landmarkBudget =
        budgetsValue !== undefined && isPlainObject(budgetsValue) && typeof budgetsValue["landmarkCount"] === "number"
          ? (budgetsValue["landmarkCount"] as number)
          : BUDGET_RANGES.landmarkCount.default;
      if (landmarks.length > landmarkBudget) {
        issues.push({
          path: "$.landmarks",
          message: `${landmarks.length} landmark requests exceed budgets.landmarkCount (${landmarkBudget})`,
        });
      }
      landmarks.forEach((entry, position) => {
        if (!isPlainObject(entry)) {
          issues.push({ path: `$.landmarks[${position}]`, message: "must be an object" });
          return;
        }
        for (const key of Object.keys(entry)) {
          if (key !== "type" && key !== "relation") {
            issues.push({ path: `$.landmarks[${position}].${key}`, message: `unknown field "${key}"` });
          }
        }
        checkEnum(issues, entry, "type", `$.landmarks[${position}].type`, LANDMARK_TYPES);
        if (entry["relation"] !== undefined) {
          checkEnum(issues, entry, "relation", `$.landmarks[${position}].relation`, RELATION_KINDS);
        }
      });
    }
  }

  if (issues.length > 0) {
    return failure(issues);
  }
  return { ok: true, recipe: input as unknown as WorldRecipe };
}

function failure(issues: readonly RecipeIssue[]): RecipeValidation {
  return { ok: false, issues: [...issues].sort((a, b) => (a.path < b.path ? -1 : 1)) };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function checkEnum(
  issues: RecipeIssue[],
  container: Record<string, unknown>,
  key: string,
  path: string,
  allowed: readonly string[],
): void {
  const value = container[key];
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({ path, message: `must be one of: ${allowed.join(", ")}` });
  }
}

function checkInteger(
  issues: RecipeIssue[],
  container: Record<string, unknown>,
  key: string,
  path: string,
  min: number,
  max: number,
  required: boolean,
): void {
  const value = container[key];
  if (value === undefined) {
    if (required && !(key in container)) {
      issues.push({ path, message: "required field is missing" });
    } else if (key in container) {
      issues.push({ path, message: "must be an integer, not undefined/null" });
    }
    return;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    issues.push({ path, message: "must be an integer" });
    return;
  }
  if (value < min || value > max) {
    issues.push({ path, message: `must be between ${min} and ${max}` });
  }
}
