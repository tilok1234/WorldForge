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
} from "./recipe/compile.js";
import { generateWorldDetailed } from "./generation/generate.js";
import { validateArtifact } from "./validation/validateArtifact.js";
import { writeWorldOutputs } from "./artifact/write.js";
import { renderMacroSet } from "./render/macroRender.js";
import { buildContactSheet } from "./render/contactSheet.js";
import { canonicalSha256 } from "./core/identity.js";
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
import { encodePng } from "./render/png.js";
import type { NormalizedWorldRecipe, WorldRecipe } from "./recipe/schema.js";

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
  const report = validateArtifact(artifact, { minRegionCells: config.biomes.minRegionCells });
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
  const report = validateArtifact(artifact, { minRegionCells: config.biomes.minRegionCells });
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
  const report = validateArtifact(result.artifact, { minRegionCells: config.biomes.minRegionCells });
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
  const render = renderTmjDocument(emitted.doc);
  const rgb = new Uint8Array(render.width * render.height * 3);
  for (let p = 0; p < render.width * render.height; p += 1) {
    rgb[p * 3] = render.rgba[p * 4] as number;
    rgb[p * 3 + 1] = render.rgba[p * 4 + 1] as number;
    rgb[p * 3 + 2] = render.rgba[p * 4 + 2] as number;
  }
  writeFileSync(join(parsed.outDir, "resolved-render.png"), encodePng(render.width, render.height, rgb));
  // Renders past 8192px on a side exceed what browsers will decode (a 512-cell
  // world is 16384px — Chrome refuses the ~1 GB bitmap), so the viewer gets a
  // box-averaged preview alongside the full-detail evidence render.
  const previewCap = 8192;
  const previewFactor = Math.ceil(Math.max(render.width, render.height) / previewCap);
  let previewLine: string | null = null;
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
  // Slice manifest for game consumers and the viewer: destination and route
  // endpoints in cell coordinates plus the small id->name tables hover
  // inspection needs (CLI-composed; not adapter output).
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
  const sliceManifest = {
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
  writeFileSync(join(parsed.outDir, "tileforge-slice.json"), canonicalJson(sliceManifest));
  process.stdout.write(
    [
      `resolved ${resolved.mapData.mapW}x${resolved.mapData.mapH} world against ${resolved.diagnostics.packageId}`,
      `  meta cells ${resolved.diagnostics.metaCells}, wall cells ${resolved.diagnostics.wallCells}, fords ${resolved.diagnostics.fordDecals}, bridges ${resolved.diagnostics.bridgeStructures}`,
      `  tmj tiles ${emitted.tileCount} across ${Object.keys(emitted.layerCounts).length} layers`,
      `wrote ${join(parsed.outDir, "tileforge-map-data.json")}`,
      `wrote ${join(parsed.outDir, "tileforge-diagnostics.json")}`,
      `wrote ${join(parsed.outDir, "resolved-map.tmj")}`,
      `wrote ${join(parsed.outDir, "resolved-render.png")} (${render.width}x${render.height})`,
      ...(previewLine === null ? [] : [previewLine]),
      `wrote ${join(parsed.outDir, "tileforge-slice.json")}`,
    ].join("\n") + "\n",
  );
  return 0;
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
  return validation.recipe;
}

function exitWith(code: number): void {
  process.exitCode = code;
}
