import {
  DENSITY_PRESET_NAMES,
  BIAS_FIELD_NAMES,
  DECORATION_FIELD_NAMES,
  DECORATION_RANGES,
  LANDMARK_TYPES,
  NEAR_RADIUS_MAX,
  NEAR_RADIUS_MIN,
  RECIPE_STAMP_PREFIX,
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
  SIZE_PRESET_CELLS,
  SIZE_PRESET_NAMES,
  STAMP_NAME_PATTERN,
  TOGGLE_NAMES,
  type SizePreset,
  type WorldRecipe,
} from "./schema.js";
import { parseStampDefinition } from "../settlements/landmarks.js";
import { WORLD_PALETTE } from "../regions/biomes.js";

export interface RecipeIssue {
  readonly path: string;
  readonly message: string;
}

export type RecipeValidation =
  | { readonly ok: true; readonly recipe: WorldRecipe }
  | { readonly ok: false; readonly issues: readonly RecipeIssue[] };

const ROOT_FIELDS = ["recipeFormat", "seed", "world", "biases", "budgets", "toggles", "landmarks", "settlements", "decoration", "authoredStamps", "cellOverrides"];
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
      if (landmarks.length > BUDGET_RANGES.landmarkCount.max) {
        issues.push({
          path: "$.landmarks",
          message: `at most ${BUDGET_RANGES.landmarkCount.max} landmark requests are supported`,
        });
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
      const declaredStampNames = collectStampNames(input["authoredStamps"]);
      const worldSize = sizeOf(input);
      landmarks.forEach((entry, position) => {
        if (!isPlainObject(entry)) {
          issues.push({ path: `$.landmarks[${position}]`, message: "must be an object" });
          return;
        }
        for (const key of Object.keys(entry)) {
          if (key !== "type" && key !== "relation" && key !== "at" && key !== "near") {
            issues.push({ path: `$.landmarks[${position}].${key}`, message: `unknown field "${key}"` });
          }
        }
        const type = entry["type"];
        if (typeof type === "string" && type.startsWith(RECIPE_STAMP_PREFIX)) {
          const name = type.slice(RECIPE_STAMP_PREFIX.length);
          if (!declaredStampNames.has(name)) {
            issues.push({
              path: `$.landmarks[${position}].type`,
              message: `"${type}" names no declared authored stamp (see $.authoredStamps)`,
            });
          }
        } else {
          checkEnum(issues, entry, "type", `$.landmarks[${position}].type`, LANDMARK_TYPES);
        }
        // A landmark is placed by exactly one mechanism: pin, constrained
        // search, relation, or free competition — never a mix.
        const mechanisms = ["at", "near", "relation"].filter((key) => entry[key] !== undefined);
        if (mechanisms.length > 1) {
          issues.push({
            path: `$.landmarks[${position}]`,
            message: `at, near, and relation are mutually exclusive (got ${mechanisms.join(" + ")})`,
          });
        }
        if (entry["relation"] !== undefined) {
          checkEnum(issues, entry, "relation", `$.landmarks[${position}].relation`, RELATION_KINDS);
        }
        if (entry["at"] !== undefined) {
          checkCell(issues, entry["at"], `$.landmarks[${position}].at`, worldSize);
        }
        const near = entry["near"];
        if (near !== undefined) {
          if (!isPlainObject(near)) {
            issues.push({ path: `$.landmarks[${position}].near`, message: "must be an object" });
          } else {
            for (const key of Object.keys(near)) {
              if (key !== "cell" && key !== "radius") {
                issues.push({ path: `$.landmarks[${position}].near.${key}`, message: `unknown field "${key}"` });
              }
            }
            checkCell(issues, near["cell"], `$.landmarks[${position}].near.cell`, worldSize);
            checkInteger(issues, near, "radius", `$.landmarks[${position}].near.radius`, NEAR_RADIUS_MIN, NEAR_RADIUS_MAX, true);
          }
        }
      });
    }
  }

  const settlements = input["settlements"];
  if (settlements !== undefined) {
    if (!Array.isArray(settlements)) {
      issues.push({ path: "$.settlements", message: "settlements must be an array" });
    } else {
      const budgetsValue = input["budgets"];
      const settlementBudget =
        budgetsValue !== undefined && isPlainObject(budgetsValue) && typeof budgetsValue["settlementCount"] === "number"
          ? (budgetsValue["settlementCount"] as number)
          : BUDGET_RANGES.settlementCount.default;
      if (settlements.length > settlementBudget) {
        issues.push({
          path: "$.settlements",
          message: `${settlements.length} settlement entries exceed budgets.settlementCount (${settlementBudget})`,
        });
      }
      const worldSize = sizeOf(input);
      const claimedRanks = new Map<number, number>();
      settlements.forEach((entry, position) => {
        if (!isPlainObject(entry)) {
          issues.push({ path: `$.settlements[${position}]`, message: "must be an object" });
          return;
        }
        for (const key of Object.keys(entry)) {
          if (key !== "at" && key !== "near" && key !== "rank") {
            issues.push({ path: `$.settlements[${position}].${key}`, message: `unknown field "${key}"` });
          }
        }
        // Effective rank (behavior 38): explicit claim or the entry's index.
        // Ranks address budget slots, so every claim must be unique and
        // inside the settlement budget.
        if (entry["rank"] !== undefined) {
          checkInteger(issues, entry, "rank", `$.settlements[${position}].rank`, 0, Math.max(0, settlementBudget - 1), true);
        }
        const effectiveRank = typeof entry["rank"] === "number" ? (entry["rank"] as number) : position;
        const earlier = claimedRanks.get(effectiveRank);
        if (earlier !== undefined) {
          issues.push({
            path: `$.settlements[${position}]`,
            message: `rank ${effectiveRank} is already claimed by entry ${earlier} (explicit rank or entry index)`,
          });
        } else {
          claimedRanks.set(effectiveRank, position);
        }
        // Entry order is rank order, so every entry must constrain its rank
        // by exactly one mechanism: pin or constrained search.
        const mechanisms = ["at", "near"].filter((key) => entry[key] !== undefined);
        if (mechanisms.length !== 1) {
          issues.push({
            path: `$.settlements[${position}]`,
            message:
              mechanisms.length === 0
                ? "exactly one of at or near is required (entry order is rank order; omit the entry to leave the rank free)"
                : "at and near are mutually exclusive",
          });
        }
        if (entry["at"] !== undefined) {
          checkCell(issues, entry["at"], `$.settlements[${position}].at`, worldSize);
        }
        const near = entry["near"];
        if (near !== undefined) {
          if (!isPlainObject(near)) {
            issues.push({ path: `$.settlements[${position}].near`, message: "must be an object" });
          } else {
            for (const key of Object.keys(near)) {
              if (key !== "cell" && key !== "radius") {
                issues.push({ path: `$.settlements[${position}].near.${key}`, message: `unknown field "${key}"` });
              }
            }
            checkCell(issues, near["cell"], `$.settlements[${position}].near.cell`, worldSize);
            checkInteger(issues, near, "radius", `$.settlements[${position}].near.radius`, NEAR_RADIUS_MIN, NEAR_RADIUS_MAX, true);
          }
        }
      });
    }
  }

  const authoredStamps = input["authoredStamps"];
  if (authoredStamps !== undefined) {
    if (!Array.isArray(authoredStamps)) {
      issues.push({ path: "$.authoredStamps", message: "authoredStamps must be an array" });
    } else {
      const seen = new Set<string>();
      authoredStamps.forEach((entry, position) => {
        if (!isPlainObject(entry)) {
          issues.push({ path: `$.authoredStamps[${position}]`, message: "must be an object" });
          return;
        }
        for (const key of Object.keys(entry)) {
          if (key !== "name" && key !== "stamp") {
            issues.push({ path: `$.authoredStamps[${position}].${key}`, message: `unknown field "${key}"` });
          }
        }
        const name = entry["name"];
        if (typeof name !== "string" || !STAMP_NAME_PATTERN.test(name)) {
          issues.push({
            path: `$.authoredStamps[${position}].name`,
            message: "name must be lowercase-kebab ([a-z][a-z0-9-]*)",
          });
          return;
        }
        if (seen.has(name)) {
          issues.push({ path: `$.authoredStamps[${position}].name`, message: `duplicate stamp name "${name}"` });
          return;
        }
        seen.add(name);
        // The inline definition goes through exactly the fixture parser: same
        // legend, material, and structure checks as the committed library.
        try {
          parseStampDefinition(entry["stamp"], `${RECIPE_STAMP_PREFIX}${name}`);
        } catch (error) {
          issues.push({
            path: `$.authoredStamps[${position}].stamp`,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }
  }

  const cellOverrides = input["cellOverrides"];
  if (cellOverrides !== undefined) {
    if (!Array.isArray(cellOverrides)) {
      issues.push({ path: "$.cellOverrides", message: "cellOverrides must be an array" });
    } else {
      const worldSize = sizeOf(input);
      const seenCells = new Set<string>();
      cellOverrides.forEach((entry, position) => {
        if (!isPlainObject(entry)) {
          issues.push({ path: `$.cellOverrides[${position}]`, message: "must be an object" });
          return;
        }
        for (const key of Object.keys(entry)) {
          if (key !== "cell" && key !== "material" && key !== "clearProp" && key !== "clearDecal") {
            issues.push({ path: `$.cellOverrides[${position}].${key}`, message: `unknown field "${key}"` });
          }
        }
        checkCell(issues, entry["cell"], `$.cellOverrides[${position}].cell`, worldSize);
        if (Array.isArray(entry["cell"]) && entry["cell"].length === 2) {
          const key = `${entry["cell"][0]},${entry["cell"][1]}`;
          if (seenCells.has(key)) {
            issues.push({ path: `$.cellOverrides[${position}].cell`, message: `duplicate override for cell ${key}` });
          }
          seenCells.add(key);
        }
        const material = entry["material"];
        if (material !== undefined) {
          if (typeof material !== "string" || !(WORLD_PALETTE as readonly string[]).includes(material)) {
            issues.push({
              path: `$.cellOverrides[${position}].material`,
              message: "must be a semantic palette key",
            });
          } else if (material.startsWith("water.")) {
            // Water meaning belongs to hydrology; a material override cannot
            // invent or remove water without desyncing the river/water layers.
            issues.push({
              path: `$.cellOverrides[${position}].material`,
              message: "water materials cannot be overridden onto cells (hydrology owns water)",
            });
          }
        }
        for (const flag of ["clearProp", "clearDecal"] as const) {
          if (entry[flag] !== undefined && entry[flag] !== true) {
            issues.push({ path: `$.cellOverrides[${position}].${flag}`, message: "must be true when present" });
          }
        }
        if (material === undefined && entry["clearProp"] === undefined && entry["clearDecal"] === undefined) {
          issues.push({
            path: `$.cellOverrides[${position}]`,
            message: "override must set material, clearProp, or clearDecal",
          });
        }
      });
    }
  }

  if (issues.length > 0) {
    return failure(issues);
  }
  return { ok: true, recipe: input as unknown as WorldRecipe };
}

/** World side length for pin/override bounds, when the size preset parses. */
function sizeOf(input: Record<string, unknown>): number | null {
  const world = input["world"];
  if (!isPlainObject(world)) {
    return null;
  }
  const preset = world["sizePreset"];
  if (typeof preset !== "string" || !(SIZE_PRESET_NAMES as readonly string[]).includes(preset)) {
    return null;
  }
  return SIZE_PRESET_CELLS[preset as SizePreset];
}

function collectStampNames(authoredStamps: unknown): Set<string> {
  const names = new Set<string>();
  if (Array.isArray(authoredStamps)) {
    for (const entry of authoredStamps) {
      if (isPlainObject(entry) && typeof entry["name"] === "string") {
        names.add(entry["name"]);
      }
    }
  }
  return names;
}

/** A cell is [x, y] of in-bounds integers (bounds skipped if size unknown). */
function checkCell(
  issues: RecipeIssue[],
  value: unknown,
  path: string,
  worldSize: number | null,
): void {
  if (!Array.isArray(value) || value.length !== 2 || value.some((v) => typeof v !== "number" || !Number.isSafeInteger(v))) {
    issues.push({ path, message: "must be a [x, y] pair of integers" });
    return;
  }
  const [x, y] = value as [number, number];
  if (x < 0 || y < 0 || (worldSize !== null && (x >= worldSize || y >= worldSize))) {
    issues.push({
      path,
      message: worldSize === null ? "coordinates must be non-negative" : `coordinates must be within the ${worldSize}x${worldSize} world`,
    });
  }
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
