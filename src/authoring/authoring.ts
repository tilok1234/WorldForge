/**
 * W9 authoring workflow (docs/AI_AUTHORING_MODEL.md). The AI (or any
 * authoring client) drafts and revises RECIPES; these tools make that loop
 * inspectable: a validated intent-brief format with provenance, a
 * human-readable recipe explanation, structured recipe diffs, a comparison
 * summary for two generated candidates, and recorded approval states.
 * Nothing here calls a model or touches generated cells — accepted recipes
 * regenerate offline, and every proposed change is visible as a diff.
 */

import { validateRecipe, type RecipeIssue } from "../recipe/validate.js";
import { normalizeRecipe, recipeIdentity } from "../recipe/normalize.js";
import { compileRecipe, generationIdentity } from "../recipe/compile.js";
import type { NormalizedWorldRecipe, WorldRecipe } from "../recipe/schema.js";
import type { WorldArtifact } from "../generation/generate.js";

// ---------------------------------------------------------------------------
// Intent briefs

/** Natural-language intent plus provenance; never a generation input. */
export interface IntentBrief {
  readonly briefFormat: 1;
  /** The user's creative intent, in their own words. */
  readonly intent: string;
  /** Hard requirements the draft must satisfy, one sentence each. */
  readonly constraints?: readonly string[];
  readonly provenance?: {
    readonly author?: string;
    readonly authoringClient?: string;
    readonly date?: string;
  };
}

export function validateBrief(input: unknown): { ok: true; brief: IntentBrief } | { ok: false; issues: RecipeIssue[] } {
  const issues: RecipeIssue[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, issues: [{ path: "$", message: "brief must be a JSON object" }] };
  }
  const raw = input as Record<string, unknown>;
  const known = ["briefFormat", "intent", "constraints", "provenance"];
  for (const key of Object.keys(raw)) {
    if (!known.includes(key)) {
      issues.push({ path: `$.${key}`, message: `unknown field "${key}"` });
    }
  }
  if (raw["briefFormat"] !== 1) {
    issues.push({ path: "$.briefFormat", message: "briefFormat must be 1" });
  }
  if (typeof raw["intent"] !== "string" || (raw["intent"] as string).trim().length === 0) {
    issues.push({ path: "$.intent", message: "intent must be a non-empty string" });
  }
  const constraints = raw["constraints"];
  if (constraints !== undefined) {
    if (!Array.isArray(constraints) || constraints.some((entry) => typeof entry !== "string")) {
      issues.push({ path: "$.constraints", message: "constraints must be an array of strings" });
    }
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, brief: input as IntentBrief };
}

// ---------------------------------------------------------------------------
// Recipe explanation

/** Human-readable explanation of a recipe and its identities. */
export function explainRecipe(recipe: WorldRecipe): string {
  const normalized = normalizeRecipe(recipe);
  const config = compileRecipe(normalized);
  const lines: string[] = [];
  lines.push(`seed ${normalized.seed} — every regeneration of this recipe is byte-identical`);
  lines.push(
    `world: ${normalized.world.sizePreset} (${config.world.width}x${config.world.height} cells, ` +
      `${config.world.chunkWidth}-cell chunks), climate ${normalized.world.climatePreset}`,
  );
  const biases: string[] = [];
  if (normalized.biases.northElevationPermille !== 0) {
    biases.push(`terrain rises ${normalized.biases.northElevationPermille}‰ toward the north`);
  }
  if (normalized.biases.temperaturePermille !== 0) {
    biases.push(`temperature shifted ${normalized.biases.temperaturePermille}‰`);
  }
  if (normalized.biases.moisturePermille !== 0) {
    biases.push(`moisture shifted ${normalized.biases.moisturePermille}‰`);
  }
  lines.push(`biases: ${biases.length > 0 ? biases.join("; ") : "none"}`);
  lines.push(
    `budgets: ${normalized.budgets.settlementCount} settlements, ` +
      `${normalized.budgets.primaryRouteCount} primary routes, ` +
      `${normalized.budgets.landmarkCount} landmarks, region target ${normalized.budgets.regionCount}`,
  );
  if (normalized.landmarks.length > 0) {
    for (const landmark of normalized.landmarks) {
      lines.push(
        `landmark: ${landmark.type}` +
          (landmark.relation !== null ? ` placed ${landmark.relation.replace(/_/g, " ")}` : ""),
      );
    }
  }
  lines.push(`decoration density ${normalized.decoration.densityPermille}‰ (400 is the natural baseline)`);
  lines.push(`recipeSha256 ${recipeIdentity(normalized)}`);
  lines.push(`generation identity ${generationIdentity(normalized, config)}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Structured recipe diffs

export interface RecipeDiffEntry {
  readonly path: string;
  readonly from: unknown;
  readonly to: unknown;
}

export interface RecipeDiff {
  readonly changes: readonly RecipeDiffEntry[];
  readonly fromRecipeSha256: string;
  readonly toRecipeSha256: string;
  readonly identityChanges: boolean;
}

/** Structured, normalized-field diff — the W9 proposal format. */
export function diffRecipes(from: WorldRecipe, to: WorldRecipe): RecipeDiff {
  const a = normalizeRecipe(from);
  const b = normalizeRecipe(to);
  const changes: RecipeDiffEntry[] = [];
  const walk = (path: string, left: unknown, right: unknown): void => {
    if (typeof left !== typeof right || typeof left !== "object" || left === null || right === null) {
      if (JSON.stringify(left) !== JSON.stringify(right)) {
        changes.push({ path, from: left, to: right });
      }
      return;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      if (JSON.stringify(left) !== JSON.stringify(right)) {
        changes.push({ path, from: left, to: right });
      }
      return;
    }
    const keys = new Set([...Object.keys(left), ...Object.keys(right as object)]);
    for (const key of [...keys].sort()) {
      walk(`${path}.${key}`, (left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]);
    }
  };
  walk("$", a as unknown, b as unknown);
  const fromSha = recipeIdentity(a);
  const toSha = recipeIdentity(b);
  return {
    changes,
    fromRecipeSha256: fromSha,
    toRecipeSha256: toSha,
    identityChanges: fromSha !== toSha,
  };
}

export function renderRecipeDiff(diff: RecipeDiff): string {
  if (diff.changes.length === 0) {
    return "no changes — the recipes normalize identically";
  }
  const lines = diff.changes.map(
    (change) => `${change.path}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`,
  );
  lines.push(`recipe identity: ${diff.fromRecipeSha256.slice(0, 12)}… -> ${diff.toRecipeSha256.slice(0, 12)}…`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Candidate comparison

export interface WorldSummary {
  readonly generationIdentitySha256: string;
  readonly seed: number;
  readonly dimensions: string;
  readonly biomeCells: Readonly<Record<string, number>>;
  readonly settlements: number;
  readonly structures: number;
  readonly routes: number;
  readonly routeCells: number;
  readonly propCells: number;
  readonly decalCells: number;
  readonly cropCells: number;
  readonly riverCells: number;
}

export function summarizeWorld(artifact: WorldArtifact): WorldSummary {
  const biomeCells: Record<string, number> = {};
  let structures = 0;
  let propCells = 0;
  let decalCells = 0;
  let cropCells = 0;
  let riverCells = 0;
  let routeCells = 0;
  for (const chunk of artifact.chunks) {
    for (let y = 0; y < chunk.layers.material.length; y += 1) {
      const materialRow = chunk.layers.material[y] as readonly number[];
      for (let x = 0; x < materialRow.length; x += 1) {
        const key = artifact.semanticPalette[materialRow[x] as number] as string;
        biomeCells[key] = (biomeCells[key] ?? 0) + 1;
        if ((chunk.layers.structure[y] as readonly number[])[x] !== 0) structures += 1;
        if ((chunk.layers.prop[y] as readonly number[])[x] !== 0) propCells += 1;
        if ((chunk.layers.decal[y] as readonly number[])[x] !== 0) decalCells += 1;
        if ((chunk.layers.crop[y] as readonly number[])[x] !== 0) cropCells += 1;
        if ((chunk.layers.river[y] as readonly number[])[x] !== 0) riverCells += 1;
        if ((chunk.layers.path[y] as readonly number[])[x] !== 0) routeCells += 1;
        if (key === "terrain.packed_road" || key === "terrain.cobble") routeCells += 1;
      }
    }
  }
  return {
    generationIdentitySha256: artifact.generator.generationIdentitySha256,
    seed: artifact.generator.seed,
    dimensions: `${artifact.dimensions.width}x${artifact.dimensions.height}`,
    biomeCells,
    settlements: artifact.settlements.length,
    structures,
    routes: artifact.routes.length,
    routeCells,
    propCells,
    decalCells,
    cropCells,
    riverCells,
  };
}

export function compareWorlds(a: WorldArtifact, b: WorldArtifact): string {
  const left = summarizeWorld(a);
  const right = summarizeWorld(b);
  const lines: string[] = [];
  lines.push(`A: seed ${left.seed}, ${left.dimensions}, identity ${left.generationIdentitySha256.slice(0, 12)}…`);
  lines.push(`B: seed ${right.seed}, ${right.dimensions}, identity ${right.generationIdentitySha256.slice(0, 12)}…`);
  const number = (label: string, x: number, y: number): void => {
    const delta = y - x;
    lines.push(`${label}: ${x} vs ${y}${delta === 0 ? "" : ` (${delta > 0 ? "+" : ""}${delta})`}`);
  };
  number("settlement plans", left.settlements, right.settlements);
  number("points of interest", a.pois.length, b.pois.length);
  number("structure cells", left.structures, right.structures);
  number("routes", left.routes, right.routes);
  number("route/street cells", left.routeCells, right.routeCells);
  number("river cells", left.riverCells, right.riverCells);
  number("prop cells", left.propCells, right.propCells);
  number("decal cells", left.decalCells, right.decalCells);
  number("crop cells", left.cropCells, right.cropCells);
  const biomes = new Set([...Object.keys(left.biomeCells), ...Object.keys(right.biomeCells)]);
  for (const biome of [...biomes].sort()) {
    number(biome, left.biomeCells[biome] ?? 0, right.biomeCells[biome] ?? 0);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Approval states

/** Sidecar approval record for a recipe (user authority; tools only record). */
export interface RecipeApproval {
  readonly approvalFormat: 1;
  readonly recipeSha256: string;
  readonly state: "draft" | "accepted";
  readonly visualBaseline: {
    readonly approved: boolean;
    readonly generationIdentitySha256?: string;
    readonly note?: string;
    readonly date?: string;
  };
}

export function buildApproval(
  recipe: WorldRecipe,
  options: { readonly accept: boolean; readonly baseline: boolean; readonly note?: string; readonly date?: string },
): RecipeApproval {
  const normalized: NormalizedWorldRecipe = normalizeRecipe(recipe);
  const config = compileRecipe(normalized);
  const approval: RecipeApproval = {
    approvalFormat: 1,
    recipeSha256: recipeIdentity(normalized),
    state: options.accept ? "accepted" : "draft",
    visualBaseline: {
      approved: options.baseline,
      ...(options.baseline ? { generationIdentitySha256: generationIdentity(normalized, config) } : {}),
      ...(options.note !== undefined ? { note: options.note } : {}),
      ...(options.date !== undefined ? { date: options.date } : {}),
    },
  };
  return approval;
}

/** True when the approval record matches the recipe as it stands now. */
export function approvalMatches(recipe: WorldRecipe, approval: RecipeApproval): boolean {
  return approval.recipeSha256 === recipeIdentity(normalizeRecipe(recipe));
}

export { validateRecipe };
