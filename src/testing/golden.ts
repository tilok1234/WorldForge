/**
 * Fixture snapshot framework (Milestone W1). A golden fixture is the canonical
 * JSON of a value, committed under fixtures/. Tests compare byte-for-byte;
 * baselines change only through tools/update-golden.ts after an approved
 * behavior change — never silently (docs/AGENTS.md, "Visual approval").
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson } from "../core/canonicalJson.js";

export interface GoldenComparison {
  readonly matches: boolean;
  readonly expectedPath: string;
  readonly actualCanonical: string;
  readonly expectedCanonical: string | null;
}

/** Compare a value against a committed golden fixture (path relative to repo root). */
export function compareToGolden(repoRoot: string, relativePath: string, value: unknown): GoldenComparison {
  const expectedPath = join(repoRoot, relativePath);
  const actualCanonical = canonicalJson(value);
  let expectedCanonical: string | null = null;
  try {
    expectedCanonical = readFileSync(expectedPath, "utf8");
  } catch {
    expectedCanonical = null;
  }
  return {
    matches: expectedCanonical === actualCanonical,
    expectedPath,
    actualCanonical,
    expectedCanonical,
  };
}
