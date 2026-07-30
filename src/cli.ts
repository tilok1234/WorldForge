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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  type ResolvedWorldConfig,
} from "./recipe/compile.js";
import { generateWorldDetailed } from "./generation/generate.js";
import { validateArtifact } from "./validation/validateArtifact.js";
import { writeWorldOutputs } from "./artifact/write.js";
import { renderMacroSet } from "./render/macroRender.js";
import { buildContactSheet } from "./render/contactSheet.js";
import { canonicalSha256, sha256HexBytes } from "./core/identity.js";
import {
  importTileForgePackage,
  verifyTileForgePackage,
} from "./package/importPackage.js";
import { resolveToTileForge } from "./adapters/tileforge/resolve.js";
import { loadPinnedManifest } from "./adapters/tileforge/manifest.js";
import { TILEFORGE_ADAPTER_VERSION } from "./core/version.js";
import {
  buildApproval,
  compareWorlds,
  diffRecipes,
  explainRecipe,
  renderRecipeDiff,
  validateBrief,
} from "./authoring/authoring.js";
import type { WorldArtifact } from "./generation/generate.js";
import {
  renderTmjDocument,
  verifyAgainstPackageMap,
  verifyChunkedResolution,
  verifyReferenceRender,
} from "./adapters/tileforge/verifyResolution.js";
import { emitResolvedTmj } from "./adapters/tileforge/emitTmj.js";
import type { TmjDocument } from "./adapters/tileforge/tmj.js";
import { buildGamePack, GAME_PACK_FORMAT } from "./gamepack/export.js";
import { buildStoredZip } from "./gamepack/zip.js";
import {
  checkPublishable,
  packArtifactId,
  packAssetName,
  packName,
  publishPackRelease,
} from "./gamepack/publish.js";
import { loadWorldArtifact } from "./consumers/typescript/loader.js";

/**
 * Destination reachability through the PUBLIC loader — the consumers' own
 * rule (nudge up to 8 cells to walkable, 4-neighbor flood from destination
 * 0). Structures may legally occupy trail ends (the spur leads TO the
 * monument), and the compose-time gate walks corridors without structure
 * knowledge — so a stamp CAN sever a sole corridor without any earlier
 * check noticing (the-eight-lands' plaza fountain did). This gate refuses
 * to ship such a world.
 */
function verifyDestinationReachability(artifact: WorldArtifact): string[] {
  const loaded = loadWorldArtifact(artifact as unknown as Record<string, unknown>);
  if (!loaded.ok) {
    return loaded.issues.map((issue) => `loader: ${issue.path}: ${issue.message}`);
  }
  const world = loaded.world;
  const nudge = (cx: number, cy: number): readonly [number, number] | null => {
    for (let radius = 0; radius < 8; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const x = cx + dx;
          const y = cy + dy;
          if (world.inBounds(x, y) && world.walkableAt(x, y)) return [x, y];
        }
      }
    }
    return null;
  };
  const destinations = artifact.destinations ?? [];
  const first = destinations[0];
  if (first === undefined) return [];
  const origin = nudge(first.cell[0], first.cell[1]);
  if (origin === null) return [`destination ${first.id}: no walkable cell within 8`];
  const { width } = world.dimensions;
  const reached = new Uint8Array(width * world.dimensions.height);
  reached[origin[1] * width + origin[0]] = 1;
  const queue: number[] = [origin[1] * width + origin[0]];
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head] as number;
    const x = index % width;
    const y = (index - x) / width;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!world.inBounds(nx, ny)) continue;
      const next = ny * width + nx;
      if (reached[next] === 0 && world.walkableAt(nx, ny)) {
        reached[next] = 1;
        queue.push(next);
      }
    }
  }
  const errors: string[] = [];
  for (const destination of destinations) {
    const goal = nudge(destination.cell[0], destination.cell[1]);
    if (goal === null || reached[goal[1] * width + goal[0]] === 0) {
      errors.push(
        `destination ${destination.id} (${destination.kind}) at ` +
          `(${destination.cell[0]}, ${destination.cell[1]}) is unreachable from destination ${first.id}`,
      );
    }
  }
  return errors;
}
import type { ResolvedWorld } from "./adapters/tileforge/resolve.js";
import type { GenerationResult } from "./generation/generate.js";

/**
 * Box-averaged preview of a tmj document too large to composite whole:
 * renders horizontal bands (one-cell margin absorbs the sand layer's 16px
 * offset bleed) and folds each into the preview as it goes, so peak memory
 * stays one band instead of the full bitmap.
 */
function bandedPreview(
  doc: TmjDocument,
  tileSize: number,
  factor: number,
): { readonly width: number; readonly height: number; readonly rgb: Uint8Array } {
  const bandCells = 64;
  if ((bandCells * tileSize) % factor !== 0) {
    throw new Error(`preview factor ${factor} must divide the band height ${bandCells * tileSize}`);
  }
  const outW = Math.floor((doc.width * tileSize) / factor);
  const outH = Math.floor((doc.height * tileSize) / factor);
  const out = new Uint8Array(outW * outH * 3);
  const sums = new Float64Array(outW * 3);
  const n = factor * factor;
  for (let bandStart = 0; bandStart < doc.height; bandStart += bandCells) {
    const bandEnd = Math.min(doc.height, bandStart + bandCells);
    const renderStart = Math.max(0, bandStart - 1);
    const renderEnd = Math.min(doc.height, bandEnd + 1);
    const sub: TmjDocument = {
      ...doc,
      height: renderEnd - renderStart,
      layers: doc.layers.map((layer) =>
        layer.type === "tilelayer" && layer.data !== undefined
          ? {
              ...layer,
              height: renderEnd - renderStart,
              data: layer.data.slice(renderStart * doc.width, renderEnd * doc.width),
            }
          : layer,
      ),
    };
    const band = renderTmjDocument(sub);
    const cropTopPx = (bandStart - renderStart) * tileSize;
    for (let py = bandStart * tileSize; py < Math.min(bandEnd * tileSize, outH * factor); py += 1) {
      const rowBase = (cropTopPx + (py - bandStart * tileSize)) * band.width * 4;
      for (let px = 0; px < outW * factor; px += 1) {
        const o = Math.trunc(px / factor) * 3;
        const at = rowBase + px * 4;
        sums[o] = (sums[o] as number) + (band.rgba[at] as number);
        sums[o + 1] = (sums[o + 1] as number) + (band.rgba[at + 1] as number);
        sums[o + 2] = (sums[o + 2] as number) + (band.rgba[at + 2] as number);
      }
      if ((py + 1) % factor === 0) {
        const base = Math.trunc(py / factor) * outW * 3;
        for (let x = 0; x < outW; x += 1) {
          out[base + x * 3] = Math.round((sums[x * 3] as number) / n);
          out[base + x * 3 + 1] = Math.round((sums[x * 3 + 1] as number) / n);
          out[base + x * 3 + 2] = Math.round((sums[x * 3 + 2] as number) / n);
        }
        sums.fill(0);
      }
    }
  }
  return { width: outW, height: outH, rgb: out };
}
import { encodePng } from "./render/png.js";
import { CELL_OVERRIDE_SOFT_CAP, type NormalizedWorldRecipe, type WorldRecipe } from "./recipe/schema.js";

const WORLDFORGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const USAGE = `worldforge <command>

  smoke                        run the walking-skeleton pipeline in memory
  validate-recipe <file>       validate a WorldRecipe and print its identity
  resolve <file>               print the canonical ResolvedWorldConfig
  hash <file>                  print recipe, config, and generation hashes
  generate <file> --out <dir>  generate and write a world (guarded output)
  render-macro <file> --out <dir>
                               write macro debug renders (biomes + fields)
                               and the region report
  contact-sheet <file> --out <dir> [--seeds <n>]
                               render n consecutive seeds into one review grid
  import-package <zip> [--id <packageId>] [--label <text>]
                               import a TileForge release package (explicit,
                               one-time; upgrades are a deliberate event)
  verify-package               verify the pinned package against the lock
  resolve-tileforge <file> --out <dir>
                               resolve a world into the pinned package's
                               map-data.json format plus diagnostics
  verify-resolution [<file>]   prove the §2 mask/underlay derivation against
                               the package's own workbench export, then prove
                               chunked resolution matches global resolution
                               for the recipe's world (default: the canonical
                               recipe)
  validate-brief <file>        validate a W9 intent brief (prose + provenance)
  explain-recipe <file>        human-readable explanation of a recipe and its
                               identities
  diff-recipes <a> <b>         structured normalized diff between two recipes
                               (the W9 proposal format)
  compare-worlds <a> <b>       comparison summary of two generated worlds
                               (world.json paths)
  approve-recipe <file> [--baseline] [--note <text>] [--date <iso>]
                               record the user's approval state beside the
                               recipe (<file>.approval.json)
  export-game-pack <file> --out <dir> [--allow-dirty] [--no-release]
                               pack a validated world into the frozen game
                               consumer layout (docs/GAME_INTEGRATION_PLAN.md
                               §3): artifact + resolved layers + walkability
                               bitgrid + minimap + hashed manifest; refuses
                               on any validation failure. Publish gate
                               (planning doc 18 §4): refuses a dirty tree or
                               unpushed HEAD (--allow-dirty = loud dev-only
                               escape, disables the release); a successful
                               gated export then uploads the pack zip as
                               GitHub release <world>-pack-<theme>@b<NN>
                               (--no-release skips the upload)
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
    case "render-macro":
      exitWith(runRenderMacro(argv.slice(1)));
      break;
    case "contact-sheet":
      exitWith(runContactSheet(argv.slice(1)));
      break;
    case "import-package":
      exitWith(runImportPackage(argv.slice(1)));
      break;
    case "verify-package":
      exitWith(runVerifyPackage());
      break;
    case "resolve-tileforge":
      exitWith(runResolveTileForge(argv.slice(1)));
      break;
    case "verify-resolution":
      exitWith(runVerifyResolution(argv[1]));
      break;
    case "validate-brief":
      exitWith(runValidateBrief(argv[1]));
      break;
    case "explain-recipe":
      exitWith(runExplainRecipe(argv[1]));
      break;
    case "diff-recipes":
      exitWith(runDiffRecipes(argv[1], argv[2]));
      break;
    case "compare-worlds":
      exitWith(runCompareWorlds(argv[1], argv[2]));
      break;
    case "approve-recipe":
      exitWith(runApproveRecipe(argv.slice(1)));
      break;
    case "export-game-pack":
      exitWith(runExportGamePack(argv.slice(1)));
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
  const result = generateWorldDetailed(normalized, config);
  const artifact = result.artifact;
  const report = validateArtifact(artifact, { minRegionCells: config.biomes.minRegionCells, authoredCells: authoredCellsOf(config) });
  if (report.status !== "pass" || result.composed.hydro.topologyErrors.length > 0 || result.composed.routesResult.errors.length > 0) {
    process.stderr.write(
      `smoke: FAIL\n${[...report.errors, ...result.composed.hydro.topologyErrors, ...result.composed.routesResult.errors].join("\n")}\n`,
    );
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
  const generated = generateWorldDetailed(normalized, config);
  const artifact = generated.artifact;
  const report = validateArtifact(artifact, { minRegionCells: config.biomes.minRegionCells, authoredCells: authoredCellsOf(config) });
  if (report.status !== "pass" || generated.composed.hydro.topologyErrors.length > 0 || generated.composed.routesResult.errors.length > 0) {
    process.stderr.write(
      `validation FAILED; nothing written\n${[...report.errors, ...generated.composed.hydro.topologyErrors, ...generated.composed.routesResult.errors].join("\n")}\n`,
    );
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
      `generated ${config.world.width}x${config.world.height} world (${artifact.chunks.length} chunks, ${artifact.regions.length} regions)`,
      `generationIdentitySha256: ${artifact.generator.generationIdentitySha256}`,
      ...report.warnings.map((warning) => `warning: ${warning}`),
      ...written.map((path) => `wrote ${path}`),
    ].join("\n") + "\n",
  );
  return 0;
}

function runRenderMacro(argv: readonly string[]): number {
  const parsed = parseFileAndOut(argv, "render-macro");
  if (typeof parsed === "number") {
    return parsed;
  }
  const loaded = loadRecipe(parsed.file);
  if (typeof loaded === "number") {
    return loaded;
  }
  const normalized = normalizeRecipe(loaded);
  const config = compileRecipe(normalized);
  const result = generateWorldDetailed(normalized, config);
  const report = validateArtifact(result.artifact, { minRegionCells: config.biomes.minRegionCells, authoredCells: authoredCellsOf(config) });
  const topologyErrors = [...result.composed.hydro.topologyErrors, ...result.composed.routesResult.errors];
  if (report.status !== "pass" || topologyErrors.length > 0) {
    process.stderr.write(
      `validation FAILED; nothing written\n${[...report.errors, ...topologyErrors].join("\n")}\n`,
    );
    return 1;
  }
  const renders = renderMacroSet(result.composed);
  mkdirSync(parsed.outDir, { recursive: true });
  const files: Array<[string, Buffer | string]> = [
    ["macro-biomes.png", renders.biomes],
    ["macro-hydrology.png", renders.hydrology],
    ["macro-routes.png", renders.routes],
    ["macro-settlements.png", renders.settlements],
    ...(renders.townCrop !== null ? ([["town-detail-4x.png", renders.townCrop]] as Array<[string, Buffer | string]>) : []),
    ["macro-elevation.png", renders.elevation],
    ["macro-moisture.png", renders.moisture],
    ["macro-temperature.png", renders.temperature],
    [
      "regions-report.json",
      canonicalJson({
        generationIdentitySha256: result.artifact.generator.generationIdentitySha256,
        regionCount: result.artifact.regions.length,
        residualSmallRegions: result.composed.residualSmallRegions,
        regions: result.artifact.regions,
        hydrology: {
          ...result.artifact.hydrology,
          riverTraces: result.composed.hydro.riverTraces,
          topologyErrors,
        },
        validation: report,
      }),
    ],
  ];
  for (const [name, data] of files) {
    writeFileSync(join(parsed.outDir, name), data);
    process.stdout.write(`wrote ${join(parsed.outDir, name)}\n`);
  }
  return 0;
}

function runContactSheet(argv: readonly string[]): number {
  let seeds = 16;
  const filtered: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--seeds") {
      seeds = Number(argv[i + 1]);
      i += 1;
    } else {
      filtered.push(argv[i] as string);
    }
  }
  const parsed = parseFileAndOut(filtered, "contact-sheet");
  if (typeof parsed === "number") {
    return parsed;
  }
  const loaded = loadRecipe(parsed.file);
  if (typeof loaded === "number") {
    return loaded;
  }
  const normalized = normalizeRecipe(loaded);
  const sheet = buildContactSheet(normalized, seeds);
  mkdirSync(parsed.outDir, { recursive: true });
  writeFileSync(join(parsed.outDir, "contact-sheet.png"), sheet.png);
  writeFileSync(join(parsed.outDir, "contact-sheet-index.json"), canonicalJson(sheet.index));
  process.stdout.write(
    [
      `rendered ${sheet.index.tiles.length} seeds (${sheet.index.columns}x${sheet.index.rows} grid)`,
      `index sha256: ${canonicalSha256(sheet.index)}`,
      `wrote ${join(parsed.outDir, "contact-sheet.png")}`,
      `wrote ${join(parsed.outDir, "contact-sheet-index.json")}`,
    ].join("\n") + "\n",
  );
  return 0;
}

function parseFileAndOut(
  argv: readonly string[],
  command: string,
): { file: string; outDir: string } | number {
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
    process.stderr.write(`usage: worldforge ${command} <recipe.json> --out <dir>\n`);
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
  return { file, outDir: guard.resolvedPath };
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

function runResolveTileForge(argv: readonly string[]): number {
  const parsed = parseFileAndOut(argv, "resolve-tileforge");
  if (typeof parsed === "number") {
    return parsed;
  }
  const loaded = loadRecipe(parsed.file);
  if (typeof loaded === "number") {
    return loaded;
  }
  const normalized = normalizeRecipe(loaded);
  const config = compileRecipe(normalized);
  const result = generateWorldDetailed(normalized, config);
  const gateErrors = [...result.composed.hydro.topologyErrors, ...result.composed.routesResult.errors];
  if (gateErrors.length > 0) {
    process.stderr.write(`generation FAILED; nothing resolved\n${gateErrors.join("\n")}\n`);
    return 1;
  }
  const reachabilityErrors = verifyDestinationReachability(result.artifact);
  if (reachabilityErrors.length > 0) {
    process.stderr.write(
      `reachability FAILED (public-loader walkability); nothing resolved\n${reachabilityErrors.join("\n")}\n`,
    );
    return 1;
  }
  const resolved = resolveToTileForge(result.composed);
  if (resolved.diagnostics.unresolvedKeys.length > 0) {
    process.stderr.write(
      "resolution FAILED; unresolved semantic keys:\n" +
        resolved.diagnostics.unresolvedKeys.map((key) => `  ${key}`).join("\n") +
        "\n",
    );
    return 1;
  }
  mkdirSync(parsed.outDir, { recursive: true });
  // The engine-neutral artifact rides along so consumers (the TS loader,
  // parity checks) can bind resolved outputs to their base world.
  writeFileSync(join(parsed.outDir, "world.json"), canonicalJson(result.artifact));
  writeFileSync(join(parsed.outDir, "tileforge-map-data.json"), canonicalJson(resolved.mapData));
  writeFileSync(join(parsed.outDir, "tileforge-diagnostics.json"), canonicalJson(resolved.diagnostics));
  // §2.13 authored tmj (tilesets block verbatim from the package) plus a
  // native-scale render through the §4-proven compositor for visual review.
  const emitted = emitResolvedTmj(resolved.mapData, config.seed);
  writeFileSync(join(parsed.outDir, "resolved-map.tmj"), canonicalJson(emitted.doc));
  // Renders past 8192px on a side exceed what browsers will decode (a 512-cell
  // world is 16384px — Chrome refuses the ~1 GB bitmap), so the viewer gets a
  // box-averaged resolved-preview.png. Past 16384px the FULL render itself is
  // unbuildable (a 1024-cell world would need a 2^32-byte rgba buffer), so
  // those worlds band-compose straight into the preview and skip the full
  // render; native-scale review crops come from re-rendering a slice.
  const previewCap = 8192;
  const fullRenderCap = 16384;
  const tileSize = loadPinnedManifest().manifest.tileSize;
  const fullSide = Math.max(emitted.doc.width, emitted.doc.height) * tileSize;
  let renderLine: string;
  let previewLine: string | null = null;
  if (fullSide > fullRenderCap) {
    const factor = Math.ceil(fullSide / previewCap);
    const preview = bandedPreview(emitted.doc, tileSize, factor);
    writeFileSync(join(parsed.outDir, "resolved-preview.png"), encodePng(preview.width, preview.height, preview.rgb));
    renderLine =
      `resolved-render.png skipped: ${emitted.doc.width * tileSize}px exceeds the buildable/decodable cap`;
    previewLine = `wrote ${join(parsed.outDir, "resolved-preview.png")} (${preview.width}x${preview.height}, 1/${factor}, banded)`;
  } else {
    const render = renderTmjDocument(emitted.doc);
    const rgb = new Uint8Array(render.width * render.height * 3);
    for (let p = 0; p < render.width * render.height; p += 1) {
      rgb[p * 3] = render.rgba[p * 4] as number;
      rgb[p * 3 + 1] = render.rgba[p * 4 + 1] as number;
      rgb[p * 3 + 2] = render.rgba[p * 4 + 2] as number;
    }
    writeFileSync(join(parsed.outDir, "resolved-render.png"), encodePng(render.width, render.height, rgb));
    renderLine = `wrote ${join(parsed.outDir, "resolved-render.png")} (${render.width}x${render.height})`;
    const previewFactor = Math.ceil(Math.max(render.width, render.height) / previewCap);
    if (previewFactor > 1) {
      const previewW = Math.floor(render.width / previewFactor);
      const previewH = Math.floor(render.height / previewFactor);
      const preview = new Uint8Array(previewW * previewH * 3);
      const n = previewFactor * previewFactor;
      for (let py = 0; py < previewH; py += 1) {
        for (let px = 0; px < previewW; px += 1) {
          let r = 0, g = 0, b = 0;
          for (let dy = 0; dy < previewFactor; dy += 1) {
            const rowBase = ((py * previewFactor + dy) * render.width + px * previewFactor) * 3;
            for (let dx = 0; dx < previewFactor; dx += 1) {
              r += rgb[rowBase + dx * 3] as number;
              g += rgb[rowBase + dx * 3 + 1] as number;
              b += rgb[rowBase + dx * 3 + 2] as number;
            }
          }
          const out = (py * previewW + px) * 3;
          preview[out] = Math.round(r / n);
          preview[out + 1] = Math.round(g / n);
          preview[out + 2] = Math.round(b / n);
        }
      }
      writeFileSync(join(parsed.outDir, "resolved-preview.png"), encodePng(previewW, previewH, preview));
      previewLine = `wrote ${join(parsed.outDir, "resolved-preview.png")} (${previewW}x${previewH}, 1/${previewFactor})`;
    }
  }
  const sliceManifest = buildSliceManifest(result, resolved);
  writeFileSync(join(parsed.outDir, "tileforge-slice.json"), canonicalJson(sliceManifest));
  process.stdout.write(
    [
      `resolved ${resolved.mapData.mapW}x${resolved.mapData.mapH} world against ${resolved.diagnostics.packageId}`,
      `  meta cells ${resolved.diagnostics.metaCells}, wall cells ${resolved.diagnostics.wallCells}, fords ${resolved.diagnostics.fordDecals}, bridges ${resolved.diagnostics.bridgeStructures}`,
      `  tmj tiles ${emitted.tileCount} across ${Object.keys(emitted.layerCounts).length} layers`,
      `wrote ${join(parsed.outDir, "tileforge-map-data.json")}`,
      `wrote ${join(parsed.outDir, "tileforge-diagnostics.json")}`,
      `wrote ${join(parsed.outDir, "resolved-map.tmj")}`,
      renderLine,
      ...(previewLine === null ? [] : [previewLine]),
      `wrote ${join(parsed.outDir, "tileforge-slice.json")}`,
    ].join("\n") + "\n",
  );
  return 0;
}

/**
 * Slice manifest for game consumers and the viewer: destination and route
 * endpoints in cell coordinates plus the small id->name tables hover
 * inspection needs (CLI-composed; not adapter output). Shared verbatim by
 * resolve-tileforge and export-game-pack so both lanes ship one shape.
 */
function buildSliceManifest(result: GenerationResult, resolved: ResolvedWorld): unknown {
  const w = resolved.mapData.mapW;
  const { manifest: pinned } = loadPinnedManifest();
  const denseTable = (table: readonly string[]): Record<string, string> => {
    const out: Record<string, string> = {};
    for (let id = 0; id < table.length; id += 1) {
      const key = table[id];
      if (key !== undefined) out[String(id)] = key;
    }
    return out;
  };
  return {
    mapW: resolved.mapData.mapW,
    mapH: resolved.mapData.mapH,
    // Consumer-cache identity (W8): resolved outputs name their base world.
    baseGenerationIdentitySha256: result.artifact.generator.generationIdentitySha256,
    baseArtifactFormat: result.artifact.formatVersion,
    tileforgeAdapterVersion: TILEFORGE_ADAPTER_VERSION,
    destinations: result.composed.routesResult.destinations.map((destination) => ({
      id: destination.id,
      kind: destination.kind,
      x: destination.cell % w,
      y: Math.floor(destination.cell / w),
    })),
    routes: result.composed.routesResult.routes.map((route) => ({
      id: route.id,
      routeClass: route.routeClass,
      fromX: route.fromCell % w,
      fromY: Math.floor(route.fromCell / w),
      toX: route.toCell % w,
      toY: Math.floor(route.toCell / w),
    })),
    pois: result.composed.pois.map((poi) => ({ id: poi.id, type: poi.type, x: poi.x, y: poi.y })),
    materials: denseTable(pinned.materialFamilyById),
    decals: denseTable(pinned.decalFamilyById),
    roadTypes: denseTable(pinned.roadFamilyByType),
    wallTypes: denseTable(pinned.wallFamilyByType),
    structures: Object.fromEntries(
      [...pinned.structureById].map(([id, def]) => [String(id), def.name]),
    ),
  };
}

/**
 * export-game-pack (docs/GAME_INTEGRATION_PLAN.md §3.4): generate, validate,
 * resolve, then pack. Every refusal happens before the first byte is
 * written; the pack lands complete or not at all.
 */
function runExportGamePack(argv: readonly string[]): number {
  const allowDirty = argv.includes("--allow-dirty");
  const noRelease = argv.includes("--no-release");
  const parsed = parseFileAndOut(
    argv.filter((arg) => arg !== "--allow-dirty" && arg !== "--no-release"),
    "export-game-pack",
  );
  if (typeof parsed === "number") {
    return parsed;
  }
  // Publish gate (planning doc 18 §4, accepted 2026-07-30): a delivered pack
  // must be reproducible from a pushed commit, so the exporter refuses a
  // dirty tree or an unpushed HEAD before any generation work starts.
  const gate = checkPublishable(WORLDFORGE_ROOT);
  if (!gate.ok) {
    if (!allowDirty) {
      process.stderr.write(
        [
          "publish gate REFUSED (planning doc 18 §4): a pack must be reproducible from a pushed commit.",
          ...gate.reasons.map((reason) => `  ${reason}`),
          "fix: commit and push, then re-export.",
          "dev-only escape: --allow-dirty (loud, and the release upload is disabled).",
        ].join("\n") + "\n",
      );
      return 1;
    }
    process.stderr.write(
      "publish gate BYPASSED (--allow-dirty): DEV EXPORT ONLY — this pack is not reproducible" +
        " from a pushed commit and will NOT be uploaded as a release.\n",
    );
  }
  const loaded = loadRecipe(parsed.file);
  if (typeof loaded === "number") {
    return loaded;
  }
  const normalized = normalizeRecipe(loaded);
  const config = compileRecipe(normalized);
  const result = generateWorldDetailed(normalized, config);
  const gateErrors = [...result.composed.hydro.topologyErrors, ...result.composed.routesResult.errors];
  if (gateErrors.length > 0) {
    process.stderr.write(`generation FAILED; nothing packed\n${gateErrors.join("\n")}\n`);
    return 1;
  }
  const report = validateArtifact(result.artifact, { minRegionCells: config.biomes.minRegionCells, authoredCells: authoredCellsOf(config) });
  if (report.status !== "pass") {
    process.stderr.write(`validation FAILED; nothing packed\n${report.errors.join("\n")}\n`);
    return 1;
  }
  const packReachabilityErrors = verifyDestinationReachability(result.artifact);
  if (packReachabilityErrors.length > 0) {
    process.stderr.write(
      `reachability FAILED (public-loader walkability); nothing packed\n${packReachabilityErrors.join("\n")}\n`,
    );
    return 1;
  }
  const resolved = resolveToTileForge(result.composed);
  if (resolved.diagnostics.unresolvedKeys.length > 0) {
    process.stderr.write(
      "resolution FAILED; unresolved semantic keys:\n" +
        resolved.diagnostics.unresolvedKeys.map((key) => `  ${key}`).join("\n") +
        "\n",
    );
    return 1;
  }
  const emitted = emitResolvedTmj(resolved.mapData, config.seed);
  const { lock } = loadPinnedManifest();
  // The typed manifest omits the minimap table; read it from the pinned
  // package fixture directly (read-only, hash-verified via the lock above).
  const rawManifest = JSON.parse(
    readFileSync(
      join(WORLDFORGE_ROOT, ...lock.packagePath.split("/"), "tileforge-manifest.json"),
      "utf8",
    ),
  ) as { mappings: { minimap: Record<string, string> } };

  const worldName = (parsed.file.split(/[\\/]/).pop() as string).replace(/\.json$/, "");
  let pack;
  try {
    pack = buildGamePack({
      worldName,
      artifact: result.artifact,
      normalizedRecipe: normalized,
      report,
      mapData: resolved.mapData,
      tmjDocument: emitted.doc,
      sliceManifest: buildSliceManifest(result, resolved),
      minimapColors: rawManifest.mappings.minimap,
      theme: lock.theme,
    });
  } catch (error) {
    process.stderr.write(`pack refused: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  mkdirSync(join(parsed.outDir, "resolved"), { recursive: true });
  for (const file of pack.files) {
    writeFileSync(join(parsed.outDir, file.path), file.bytes);
  }
  process.stdout.write(
    [
      `packed ${worldName}: ${result.artifact.dimensions.width}x${result.artifact.dimensions.height} world, ${pack.files.length} files`,
      `  baseArtifactSha256: ${pack.manifest["baseArtifactSha256"]}`,
      `  walkable flood ${pack.walkability.floodCount} from spawn [${pack.walkability.spawnCell.join(", ")}]`,
      ...pack.files.map((file) => `wrote ${join(parsed.outDir, file.path)}`),
    ].join("\n") + "\n",
  );

  // Release transport (planning doc 18 §4.4): a gated export uploads the
  // pack as a deterministic zip on a GitHub release tagged with the artifact
  // id, notes carrying the source commit and content hashes. The pack files
  // above are already on disk either way; a failed upload exits non-zero so
  // the miss is loud, never silent.
  if (noRelease) {
    process.stdout.write("release upload: skipped (--no-release)\n");
    return 0;
  }
  if (!gate.ok) {
    process.stdout.write("release upload: skipped (--allow-dirty dev export)\n");
    return 0;
  }
  const identity = {
    worldName,
    theme: lock.theme,
    behaviorVersion: result.artifact.generator.generatorBehaviorVersion,
  };
  const manifestFile = pack.files.find((file) => file.path === "manifest.json");
  if (manifestFile === undefined) {
    process.stderr.write("release upload FAILED: pack has no manifest.json\n");
    return 1;
  }
  const zipBytes = buildStoredZip(
    pack.files.map((file) => ({ path: `${packName(identity)}/${file.path}`, bytes: file.bytes })),
  );
  const releaseDir = join(WORLDFORGE_ROOT, "outputs", "releases");
  mkdirSync(releaseDir, { recursive: true });
  const zipPath = join(releaseDir, packAssetName(identity));
  writeFileSync(zipPath, zipBytes);
  const outcome = publishPackRelease(
    {
      identity,
      sourceCommit: gate.headCommit,
      packFormat: GAME_PACK_FORMAT,
      tileforgeAdapterVersion: TILEFORGE_ADAPTER_VERSION,
      tileforgePackageId: (pack.manifest["tileforge"] as { packageId: string }).packageId,
      baseArtifactSha256: pack.manifest["baseArtifactSha256"] as string,
      manifestSha256: sha256HexBytes(manifestFile.bytes),
      zipSha256: sha256HexBytes(zipBytes),
      fileCount: pack.files.length,
      floodCount: pack.walkability.floodCount,
      spawnCell: pack.walkability.spawnCell,
    },
    zipPath,
    WORLDFORGE_ROOT,
  );
  if (outcome.status === "created") {
    process.stdout.write(
      `release: published ${packArtifactId(identity)} (${zipBytes.length} bytes, zip sha256 ` +
        `${sha256HexBytes(zipBytes)})\n  ${outcome.url}\n`,
    );
    return 0;
  }
  if (outcome.status === "verified-existing") {
    process.stdout.write(
      `release: ${packArtifactId(identity)} already published — manifestSha256 verified identical\n`,
    );
    return 0;
  }
  process.stderr.write(`release upload FAILED (pack files are written): ${outcome.message}\n`);
  return 1;
}

function runVerifyResolution(file: string | undefined): number {
  const truth = verifyAgainstPackageMap();
  process.stdout.write(
    `workbench truth test (${truth.mapW}x${truth.mapH}, forge-derived tiles vs our §2 derivation):\n`,
  );
  for (const layer of truth.layers) {
    const status = layer.mismatches === 0 ? "match" : `${layer.mismatches} MISMATCHES`;
    process.stdout.write(
      `  ${layer.layer.padEnd(15)} ${String(layer.storedPlaced).padStart(5)} tiles  ${status}\n`,
    );
    for (const sample of layer.samples) {
      process.stdout.write(`    ${sample}\n`);
    }
    for (const note of layer.notes ?? []) {
      process.stdout.write(`    note: ${note}\n`);
    }
  }
  if (!truth.ok) {
    process.stderr.write("truth test FAILED: derivation is not forge-identical\n");
    return 1;
  }

  const render = verifyReferenceRender();
  process.stdout.write(
    `§4 step 1 reference render (stored gids, frame 0): ${render.width}x${render.height}, ` +
      `${render.differingPixels}/${render.totalPixels} differing pixels ` +
      `${render.ok ? "— zero-diff pass" : "— FAIL"}\n`,
  );
  if (!render.ok) {
    for (const sample of render.samples) {
      process.stdout.write(`    ${sample}\n`);
    }
    const debugDir = join(WORLDFORGE_ROOT, "outputs", "w7-acceptance");
    mkdirSync(debugDir, { recursive: true });
    const rgb = new Uint8Array(render.width * render.height * 3);
    for (let p = 0; p < render.width * render.height; p += 1) {
      rgb[p * 3] = render.rgba[p * 4] as number;
      rgb[p * 3 + 1] = render.rgba[p * 4 + 1] as number;
      rgb[p * 3 + 2] = render.rgba[p * 4 + 2] as number;
    }
    const debugPath = join(debugDir, "stored-gid-render.png");
    writeFileSync(debugPath, encodePng(render.width, render.height, rgb));
    process.stderr.write(`reference render FAILED; our composite written to ${debugPath}\n`);
    return 1;
  }

  const recipePath =
    file ?? join(WORLDFORGE_ROOT, "fixtures", "recipes", "small-cold-coastal.json");
  const loaded = loadRecipe(recipePath);
  if (typeof loaded === "number") {
    return loaded;
  }
  const normalized = normalizeRecipe(loaded);
  const config = compileRecipe(normalized);
  const result = generateWorldDetailed(normalized, config);
  const gateErrors = [...result.composed.hydro.topologyErrors, ...result.composed.routesResult.errors];
  if (gateErrors.length > 0) {
    process.stderr.write(`generation FAILED; nothing verified\n${gateErrors.join("\n")}\n`);
    return 1;
  }
  const resolved = resolveToTileForge(result.composed);
  if (resolved.diagnostics.unresolvedKeys.length > 0) {
    process.stderr.write("resolution FAILED; unresolved semantic keys\n");
    return 1;
  }
  let ok = true;
  for (const [chunkW, chunkH] of [
    [16, 16],
    [32, 32],
  ] as const) {
    const seams = verifyChunkedResolution(resolved.mapData, chunkW, chunkH);
    const status = seams.ok ? "match" : `${seams.mismatches} MISMATCHES`;
    process.stdout.write(
      `seam test ${resolved.mapData.mapW}x${resolved.mapData.mapH} world, ` +
        `${chunkW}x${chunkH} chunks (halo ${seams.halo}): ${seams.chunksChecked} chunks, ` +
        `${seams.cellsCompared} comparisons, ${status}\n`,
    );
    for (const sample of seams.samples) {
      process.stdout.write(`    ${sample}\n`);
    }
    ok = ok && seams.ok;
  }
  if (!ok) {
    process.stderr.write("seam test FAILED: chunked resolution diverges from global\n");
    return 1;
  }
  process.stdout.write("resolution verification: pass\n");
  return 0;
}

function runValidateBrief(file: string | undefined): number {
  if (file === undefined) {
    process.stderr.write("usage: worldforge validate-brief <brief.json>\n");
    return 2;
  }
  const result = validateBrief(JSON.parse(readFileSync(file, "utf8")));
  if (!result.ok) {
    for (const issue of result.issues) {
      process.stderr.write(`${issue.path}: ${issue.message}\n`);
    }
    return 1;
  }
  process.stdout.write(
    `valid brief: "${result.brief.intent.slice(0, 72)}${result.brief.intent.length > 72 ? "…" : ""}"\n` +
      `constraints: ${result.brief.constraints?.length ?? 0}\n`,
  );
  return 0;
}

function runExplainRecipe(file: string | undefined): number {
  const loaded = loadRecipe(file);
  if (typeof loaded === "number") {
    return loaded;
  }
  process.stdout.write(explainRecipe(loaded) + "\n");
  return 0;
}

function runDiffRecipes(fileA: string | undefined, fileB: string | undefined): number {
  if (fileA === undefined || fileB === undefined) {
    process.stderr.write("usage: worldforge diff-recipes <from.json> <to.json>\n");
    return 2;
  }
  const from = loadRecipe(fileA);
  if (typeof from === "number") return from;
  const to = loadRecipe(fileB);
  if (typeof to === "number") return to;
  process.stdout.write(renderRecipeDiff(diffRecipes(from, to)) + "\n");
  return 0;
}

function runCompareWorlds(fileA: string | undefined, fileB: string | undefined): number {
  if (fileA === undefined || fileB === undefined) {
    process.stderr.write("usage: worldforge compare-worlds <a/world.json> <b/world.json>\n");
    return 2;
  }
  const a = JSON.parse(readFileSync(fileA, "utf8")) as WorldArtifact;
  const b = JSON.parse(readFileSync(fileB, "utf8")) as WorldArtifact;
  process.stdout.write(compareWorlds(a, b) + "\n");
  return 0;
}

function runApproveRecipe(argv: readonly string[]): number {
  const positional: string[] = [];
  let baseline = false;
  let note: string | undefined;
  let date: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--baseline") baseline = true;
    else if (arg === "--note" && argv[i + 1] !== undefined) {
      note = argv[i + 1] as string;
      i += 1;
    } else if (arg === "--date" && argv[i + 1] !== undefined) {
      date = argv[i + 1] as string;
      i += 1;
    } else if (arg !== undefined) positional.push(arg);
  }
  const file = positional[0];
  const loaded = loadRecipe(file);
  if (typeof loaded === "number") {
    return loaded;
  }
  const approval = buildApproval(loaded, {
    accept: true,
    baseline,
    ...(note !== undefined ? { note } : {}),
    ...(date !== undefined ? { date } : {}),
  });
  const target = `${file}.approval.json`;
  writeFileSync(target, canonicalJson(approval));
  process.stdout.write(
    `recorded: recipe accepted${baseline ? " + visual baseline approved" : ""}\n` +
      `recipeSha256 ${approval.recipeSha256}\nwrote ${target}\n`,
  );
  return 0;
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
  // Warn-only by ratified decision (docs/GAME_INTEGRATION_PLAN.md §6.4):
  // the override lane is for spot decisions, not bulk editing.
  const overrideCount = validation.recipe.cellOverrides?.length ?? 0;
  if (overrideCount > CELL_OVERRIDE_SOFT_CAP) {
    process.stderr.write(
      `warning: ${overrideCount} cell overrides exceed the soft cap of ${CELL_OVERRIDE_SOFT_CAP}\n`,
    );
  }
  return validation.recipe;
}


/** Material-override cells for the validator's authored-singleton exemption. */
function authoredCellsOf(config: ResolvedWorldConfig): ReadonlyArray<readonly [number, number]> {
  return config.authoring.cellOverrides
    .filter((override) => override.material !== null)
    .map((override) => [override.cell[0], override.cell[1]] as const);
}

function exitWith(code: number): void {
  process.exitCode = code;
}
