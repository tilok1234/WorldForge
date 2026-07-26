import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson } from "../core/canonicalJson.js";
import type { ResolvedWorldConfig } from "../recipe/compile.js";
import type { NormalizedWorldRecipe } from "../recipe/schema.js";
import type { WorldArtifact } from "../generation/generate.js";
import type { ValidationReport } from "../validation/validateArtifact.js";

export interface WorldOutputBundle {
  readonly artifact: WorldArtifact;
  readonly normalizedRecipe: NormalizedWorldRecipe;
  readonly resolvedConfig: ResolvedWorldConfig;
  readonly report: ValidationReport;
}

/**
 * Write a validated world to an already-guarded output directory. Callers must
 * run the path guard first and must not call this with a failing report
 * (docs/AGENTS.md, "Safe write rules": publish only after validation).
 */
export function writeWorldOutputs(outDir: string, bundle: WorldOutputBundle): string[] {
  if (bundle.report.status !== "pass") {
    throw new Error("refusing to write a world whose validation report is failing");
  }
  mkdirSync(outDir, { recursive: true });
  const files: Array<[string, unknown]> = [
    ["world.json", bundle.artifact],
    ["normalized-recipe.json", bundle.normalizedRecipe],
    ["resolved-config.json", bundle.resolvedConfig],
    ["validation-report.json", bundle.report],
  ];
  const written: string[] = [];
  for (const [name, value] of files) {
    const path = join(outDir, name);
    writeFileSync(path, canonicalJson(value), { encoding: "utf8" });
    written.push(path);
  }
  return written;
}
