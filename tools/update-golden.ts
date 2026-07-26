/**
 * Deliberate baseline updater. Regenerates the committed golden fixtures under
 * fixtures/worlds/ from the golden recipes. Run only when a generator behavior
 * change has been approved (docs/AGENTS.md: do not silently update baselines).
 *
 *   npm run build && node dist/tools/update-golden.js
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { canonicalJson } from "../src/core/canonicalJson.js";
import { buildKernelVectors } from "../src/testing/kernelVectors.js";
import { buildMacroSamples, buildTinyBiomePng } from "../src/testing/macroSamples.js";
import { buildResolveDiagnostics } from "../src/testing/macroSamples.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { normalizeRecipe, recipeIdentity } from "../src/recipe/normalize.js";
import {
  compileRecipe,
  generationIdentity,
  resolvedConfigIdentity,
} from "../src/recipe/compile.js";
import { generateWorld } from "../src/generation/generate.js";
import { validateArtifact } from "../src/validation/validateArtifact.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RECIPES_DIR = join(ROOT, "fixtures", "recipes");
const WORLDS_DIR = join(ROOT, "fixtures", "worlds");

/** Golden recipes: tiny gets a full byte-golden artifact, both get hashes. */
const GOLDEN = [
  { name: "tiny-temperate", fullArtifact: true },
  { name: "small-cold-coastal", fullArtifact: false },
] as const;

const expectedHashes: Record<string, Record<string, string>> = {};

for (const { name, fullArtifact } of GOLDEN) {
  const raw: unknown = JSON.parse(readFileSync(join(RECIPES_DIR, `${name}.json`), "utf8"));
  const validation = validateRecipe(raw);
  if (!validation.ok) {
    throw new Error(`golden recipe ${name} is invalid: ${JSON.stringify(validation.issues)}`);
  }
  const normalized = normalizeRecipe(validation.recipe);
  const config = compileRecipe(normalized);
  const artifact = generateWorld(normalized, config);
  const report = validateArtifact(artifact);
  if (report.status !== "pass") {
    throw new Error(`golden world ${name} failed validation: ${report.errors.join("; ")}`);
  }
  expectedHashes[name] = {
    recipeSha256: recipeIdentity(normalized),
    resolvedConfigSha256: resolvedConfigIdentity(config),
    generationIdentitySha256: generationIdentity(normalized, config),
  };
  if (fullArtifact) {
    const outDir = join(WORLDS_DIR, name);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "world.json"), canonicalJson(artifact), { encoding: "utf8" });
    process.stdout.write(`updated ${join(outDir, "world.json")}\n`);
  }
}

mkdirSync(WORLDS_DIR, { recursive: true });
writeFileSync(join(WORLDS_DIR, "expected-hashes.json"), canonicalJson(expectedHashes), {
  encoding: "utf8",
});
process.stdout.write(`updated ${join(WORLDS_DIR, "expected-hashes.json")}\n`);

const GOLDEN_DIR = join(ROOT, "fixtures", "golden");
mkdirSync(GOLDEN_DIR, { recursive: true });
writeFileSync(join(GOLDEN_DIR, "kernel-vectors.json"), canonicalJson(buildKernelVectors()), {
  encoding: "utf8",
});
process.stdout.write(`updated ${join(GOLDEN_DIR, "kernel-vectors.json")}\n`);

writeFileSync(join(GOLDEN_DIR, "macro-samples.json"), canonicalJson(buildMacroSamples()), {
  encoding: "utf8",
});
process.stdout.write(`updated ${join(GOLDEN_DIR, "macro-samples.json")}\n`);

writeFileSync(join(GOLDEN_DIR, "tiny-biomes.png"), buildTinyBiomePng());
process.stdout.write(`updated ${join(GOLDEN_DIR, "tiny-biomes.png")}\n`);

writeFileSync(join(GOLDEN_DIR, "tileforge-resolve.json"), canonicalJson(buildResolveDiagnostics()));
process.stdout.write(`updated ${join(GOLDEN_DIR, "tileforge-resolve.json")}\n`);
