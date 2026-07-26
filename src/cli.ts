#!/usr/bin/env node
/**
 * WorldForge command-line entry point (Milestone W0A).
 *
 *   smoke                          run the walking-skeleton pipeline in memory
 *   validate-recipe <file>         validate and print the recipe identity
 *   resolve <file>                 print the canonical ResolvedWorldConfig
 *   hash <file>                    print all identity hashes for a recipe
 *   generate <file> --out <dir>    run the pipeline and write world outputs
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { canonicalJson } from "./core/canonicalJson.js";
import { guardOutputRoot } from "./core/pathGuard.js";
import { validateRecipe } from "./recipe/validate.js";
import { normalizeRecipe, recipeIdentity } from "./recipe/normalize.js";
import {
  compileRecipe,
  generationIdentity,
  resolvedConfigIdentity,
} from "./recipe/compile.js";
import { generateWorld } from "./generation/generate.js";
import { validateArtifact } from "./validation/validateArtifact.js";
import { writeWorldOutputs } from "./artifact/write.js";
import {
  importTileForgePackage,
  verifyTileForgePackage,
} from "./package/importPackage.js";
import type { NormalizedWorldRecipe, WorldRecipe } from "./recipe/schema.js";

const WORLDFORGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const USAGE = `worldforge <command>

  smoke                        run the walking-skeleton pipeline in memory
  validate-recipe <file>       validate a WorldRecipe and print its identity
  resolve <file>               print the canonical ResolvedWorldConfig
  hash <file>                  print recipe, config, and generation hashes
  generate <file> --out <dir>  generate and write a world (guarded output)
  import-package <zip> [--id <packageId>] [--label <text>]
                               import a TileForge release package (explicit,
                               one-time; upgrades are a deliberate event)
  verify-package               verify the pinned package against the lock
`;

main(process.argv.slice(2));

function main(argv: readonly string[]): void {
  const command = argv[0];
  switch (command) {
    case "smoke":
      exitWith(runSmoke());
      break;
    case "validate-recipe":
      exitWith(runValidate(argv[1]));
      break;
    case "resolve":
      exitWith(runResolve(argv[1]));
      break;
    case "hash":
      exitWith(runHash(argv[1]));
      break;
    case "generate":
      exitWith(runGenerate(argv.slice(1)));
      break;
    case "import-package":
      exitWith(runImportPackage(argv.slice(1)));
      break;
    case "verify-package":
      exitWith(runVerifyPackage());
      break;
    case undefined:
    case "help":
    case "--help":
      process.stdout.write(USAGE);
      exitWith(command === undefined ? 2 : 0);
      break;
    default:
      process.stderr.write(`unknown command "${command}"\n\n${USAGE}`);
      exitWith(2);
  }
}

function runSmoke(): number {
  const recipe: WorldRecipe = {
    recipeFormat: 1,
    seed: 1,
    world: { sizePreset: "tiny", climatePreset: "temperate" },
  };
  const normalized = normalizeRecipe(recipe);
  const config = compileRecipe(normalized);
  const artifact = generateWorld(normalized, config);
  const report = validateArtifact(artifact);
  if (report.status !== "pass") {
    process.stderr.write(`smoke: FAIL\n${report.errors.join("\n")}\n`);
    return 1;
  }
  process.stdout.write(
    [
      "smoke: pass",
      `world: ${config.world.width}x${config.world.height}, ${artifact.chunks.length} chunks`,
      `recipeSha256: ${artifact.generator.recipeSha256}`,
      `resolvedConfigSha256: ${artifact.generator.resolvedConfigSha256}`,
      `generationIdentitySha256: ${artifact.generator.generationIdentitySha256}`,
    ].join("\n") + "\n",
  );
  return 0;
}

function runValidate(file: string | undefined): number {
  const loaded = loadRecipe(file);
  if (typeof loaded === "number") {
    return loaded;
  }
  process.stdout.write(`valid\nrecipeSha256: ${recipeIdentity(normalizeRecipe(loaded))}\n`);
  return 0;
}

function runResolve(file: string | undefined): number {
  const loaded = loadRecipe(file);
  if (typeof loaded === "number") {
    return loaded;
  }
  process.stdout.write(canonicalJson(compileRecipe(normalizeRecipe(loaded))));
  return 0;
}

function runHash(file: string | undefined): number {
  const loaded = loadRecipe(file);
  if (typeof loaded === "number") {
    return loaded;
  }
  const normalized: NormalizedWorldRecipe = normalizeRecipe(loaded);
  const config = compileRecipe(normalized);
  process.stdout.write(
    [
      `recipeSha256: ${recipeIdentity(normalized)}`,
      `resolvedConfigSha256: ${resolvedConfigIdentity(config)}`,
      `generationIdentitySha256: ${generationIdentity(normalized, config)}`,
    ].join("\n") + "\n",
  );
  return 0;
}

function runGenerate(argv: readonly string[]): number {
  const positional: string[] = [];
  let outDir: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      outDir = argv[i + 1];
      i += 1;
    } else if (arg !== undefined) {
      positional.push(arg);
    }
  }
  const file = positional[0];
  if (file === undefined || outDir === undefined) {
    process.stderr.write("usage: worldforge generate <recipe.json> --out <dir>\n");
    return 2;
  }

  const guard = guardOutputRoot(outDir, {
    worldforgeRoot: WORLDFORGE_ROOT,
    forbiddenRoots: loadForbiddenRoots(),
  });
  if (!guard.allowed) {
    process.stderr.write(`output path rejected: ${guard.reason}\n  ${guard.resolvedPath}\n`);
    return 1;
  }

  const loaded = loadRecipe(file);
  if (typeof loaded === "number") {
    return loaded;
  }
  const normalized = normalizeRecipe(loaded);
  const config = compileRecipe(normalized);
  const artifact = generateWorld(normalized, config);
  const report = validateArtifact(artifact);
  if (report.status !== "pass") {
    process.stderr.write(`validation FAILED; nothing written\n${report.errors.join("\n")}\n`);
    return 1;
  }
  const written = writeWorldOutputs(guard.resolvedPath, {
    artifact,
    normalizedRecipe: normalized,
    resolvedConfig: config,
    report,
  });
  process.stdout.write(
    [
      `generated ${config.world.width}x${config.world.height} world (${artifact.chunks.length} chunks)`,
      `generationIdentitySha256: ${artifact.generator.generationIdentitySha256}`,
      ...written.map((path) => `wrote ${path}`),
    ].join("\n") + "\n",
  );
  return 0;
}

function runImportPackage(argv: readonly string[]): number {
  const positional: string[] = [];
  let packageId: string | undefined;
  let sourceLabel: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--id") {
      packageId = argv[i + 1];
      i += 1;
    } else if (arg === "--label") {
      sourceLabel = argv[i + 1];
      i += 1;
    } else if (arg !== undefined) {
      positional.push(arg);
    }
  }
  const zipPath = positional[0];
  if (zipPath === undefined) {
    process.stderr.write("usage: worldforge import-package <zip> [--id <packageId>] [--label <text>]\n");
    return 2;
  }
  try {
    const result = importTileForgePackage({
      zipPath,
      worldforgeRoot: WORLDFORGE_ROOT,
      ...(packageId === undefined ? {} : { packageId }),
      ...(sourceLabel === undefined ? {} : { sourceLabel }),
    });
    process.stdout.write(
      [
        `imported ${result.packageId}`,
        `  ${result.fileCount} files, ${result.totalBytes} bytes`,
        `  package dir: ${result.packageDir}`,
        `  lock: ${result.lockPath}`,
        `  contentSha256: ${result.lock.contentSha256}`,
        ...result.warnings.map((warning) => `  warning: ${warning}`),
      ].join("\n") + "\n",
    );
    return 0;
  } catch (error) {
    process.stderr.write(`import failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function runVerifyPackage(): number {
  const result = verifyTileForgePackage(WORLDFORGE_ROOT);
  if (result.ok) {
    process.stdout.write("package fixture matches the dependency lock\n");
    return 0;
  }
  process.stderr.write(
    "package verification FAILED:\n" +
      result.problems.map((problem) => `  ${problem}`).join("\n") +
      "\n",
  );
  return 1;
}

/**
 * Machine-local guard configuration (gitignored). Registers absolute paths the
 * guard must always refuse, e.g. the user's TileForge checkout. See
 * worldforge.local.example.json.
 */
function loadForbiddenRoots(): string[] {
  const localConfigPath = join(WORLDFORGE_ROOT, "worldforge.local.json");
  if (!existsSync(localConfigPath)) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(localConfigPath, "utf8"));
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      Array.isArray((parsed as Record<string, unknown>)["forbiddenOutputRoots"])
    ) {
      return ((parsed as Record<string, unknown>)["forbiddenOutputRoots"] as unknown[]).filter(
        (entry): entry is string => typeof entry === "string",
      );
    }
  } catch (error) {
    process.stderr.write(`warning: ignoring unreadable worldforge.local.json (${String(error)})\n`);
  }
  return [];
}

function loadRecipe(file: string | undefined): WorldRecipe | number {
  if (file === undefined) {
    process.stderr.write("missing recipe file argument\n");
    return 2;
  }
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    process.stderr.write(`cannot read ${file}: ${String(error)}\n`);
    return 1;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    process.stderr.write(`${file} is not valid JSON: ${String(error)}\n`);
    return 1;
  }
  const validation = validateRecipe(parsed);
  if (!validation.ok) {
    process.stderr.write(
      `invalid recipe ${file}:\n` +
        validation.issues.map((issue) => `  ${issue.path}: ${issue.message}`).join("\n") +
        "\n",
    );
    return 1;
  }
  return validation.recipe;
}

function exitWith(code: number): void {
  process.exitCode = code;
}
