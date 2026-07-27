/**
 * Game-pack exporter (docs/GAME_INTEGRATION_PLAN.md §3, ratified 2026-07-27).
 *
 * Packs an approved, validated world into the frozen consumer layout a game
 * importer can trust: the engine-neutral artifact, the TileForge-resolved
 * layers, a precomputed walkability bitgrid derived from the PUBLIC loader
 * ladder (so it is parity-proven by construction), a minimap, and a
 * byte-stable manifest naming every file's hash plus the base artifact and
 * adapter identities (the multi-game consumer rule, made mechanical).
 *
 * Determinism contract: identical inputs produce identical bytes. Nothing in
 * a pack carries a timestamp; identity lives in the hashes. The exporter
 * REFUSES rather than writing a partial or unverified pack — callers write
 * files only after this module returns.
 */

import { canonicalJson } from "../core/canonicalJson.js";
import { sha256HexBytes } from "../core/identity.js";
import { TILEFORGE_ADAPTER_VERSION } from "../core/version.js";
import { encodePng } from "../render/png.js";
import { loadWorldArtifact } from "../consumers/typescript/loader.js";
import type { WorldArtifact } from "../generation/generate.js";
import type { NormalizedWorldRecipe } from "../recipe/schema.js";
import type { ValidationReport } from "../validation/validateArtifact.js";
import type { TileForgeMapData } from "../adapters/tileforge/resolve.js";
import type { TmjDocument } from "../adapters/tileforge/tmj.js";

export const GAME_PACK_FORMAT = 1;
export const WALKABILITY_FORMAT = 1;

/** Pack cell bits row-major, LSB-first within each byte (walkable = 1). */
export function packBits(bits: Readonly<Uint8Array>): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i += 1) {
    if (bits[i] !== 0) {
      bytes[i >> 3] = (bytes[i >> 3] as number) | (1 << (i & 7));
    }
  }
  return bytes;
}

/** Read one packed bit (row-major index). */
export function unpackBit(bytes: Readonly<Uint8Array>, index: number): boolean {
  return (((bytes[index >> 3] as number) >> (index & 7)) & 1) === 1;
}

export interface WalkabilitySummary {
  readonly walkabilityFormat: number;
  readonly width: number;
  readonly height: number;
  readonly encoding: "base64-bitpacked-row-major-lsb-first";
  readonly grid: string;
  readonly floodCount: number;
  readonly spawnCell: readonly [number, number];
}

/** 4-neighbour flood fill over a walkability oracle. */
function floodFrom(
  width: number,
  height: number,
  walkable: (index: number) => boolean,
  start: number,
): number {
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  seen[start] = 1;
  queue[tail] = start;
  tail += 1;
  let count = 0;
  while (head < tail) {
    const index = queue[head] as number;
    head += 1;
    count += 1;
    const x = index % width;
    const y = (index - x) / width;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (seen[next] === 0 && walkable(next)) {
        seen[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }
  }
  return count;
}

/**
 * Derive the walkability grid from the artifact through the PUBLIC loader —
 * the same ladder the parity fixture proves cell-identical to the resolved
 * §3 ladder — then verify the packed encoding by re-flooding from the packed
 * bytes. A flood mismatch is a hard failure (plan §3.4, refusal 2).
 */
export function buildWalkability(artifact: WorldArtifact): WalkabilitySummary {
  const loaded = loadWorldArtifact(artifact as unknown);
  if (!loaded.ok) {
    throw new Error(
      "artifact rejected by the public loader:\n" +
        loaded.issues.map((issue) => `  ${issue.path}: ${issue.message}`).join("\n"),
    );
  }
  const world = loaded.world;
  const { width, height } = world.dimensions;
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      bits[y * width + x] = world.walkableAt(x, y) ? 1 : 0;
    }
  }

  // Spawn: the first destination, nudged to the nearest walkable cell — the
  // same rule the traversal harness uses (consumers/typescript/traverse.mjs).
  const start = world.destinations[0];
  if (start === undefined) {
    throw new Error("world has no destinations; refusing to pick a spawn cell");
  }
  let spawn: readonly [number, number] | null = null;
  for (let radius = 0; radius < 8 && spawn === null; radius += 1) {
    for (let dy = -radius; dy <= radius && spawn === null; dy += 1) {
      for (let dx = -radius; dx <= radius && spawn === null; dx += 1) {
        const x = (start.cell[0] as number) + dx;
        const y = (start.cell[1] as number) + dy;
        if (x >= 0 && y >= 0 && x < width && y < height && bits[y * width + x] === 1) {
          spawn = [x, y];
        }
      }
    }
  }
  if (spawn === null) {
    throw new Error(`no walkable cell within 8 of destination ${start.id}; refusing`);
  }
  const spawnIndex = spawn[1] * width + spawn[0];

  const floodCount = floodFrom(width, height, (index) => bits[index] === 1, spawnIndex);
  const packed = packBits(bits);
  const packedFlood = floodFrom(width, height, (index) => unpackBit(packed, index), spawnIndex);
  if (packedFlood !== floodCount) {
    throw new Error(
      `packed-grid flood ${packedFlood} != loader flood ${floodCount}; refusing to export`,
    );
  }
  return {
    walkabilityFormat: WALKABILITY_FORMAT,
    width,
    height,
    encoding: "base64-bitpacked-row-major-lsb-first",
    grid: Buffer.from(packed).toString("base64"),
    floodCount,
    spawnCell: spawn,
  };
}

/** One file of a pack, ready to write. */
export interface PackFile {
  readonly path: string;
  readonly bytes: Buffer;
}

export interface GamePackInput {
  /** Recipe name for the manifest (by convention the recipe file basename). */
  readonly worldName: string;
  readonly artifact: WorldArtifact;
  readonly normalizedRecipe: NormalizedWorldRecipe;
  readonly report: ValidationReport;
  readonly mapData: TileForgeMapData;
  readonly tmjDocument: TmjDocument;
  /** The CLI-composed slice manifest (destinations, routes, id tables). */
  readonly sliceManifest: unknown;
  /** The pinned package's minimap colors: material id -> "#rrggbb". */
  readonly minimapColors: Readonly<Record<string, string>>;
  /** The pinned package theme, from the dependency lock. */
  readonly theme: string;
}

export interface GamePackResult {
  readonly files: readonly PackFile[];
  readonly manifest: Record<string, unknown>;
  readonly walkability: WalkabilitySummary;
}

/** Render the 1px-per-cell minimap from the resolved material grid. */
export function renderMinimap(
  mapData: TileForgeMapData,
  minimapColors: Readonly<Record<string, string>>,
): Buffer {
  const { mapW, mapH, mat } = mapData;
  const rgb = new Uint8Array(mapW * mapH * 3);
  for (let index = 0; index < mapW * mapH; index += 1) {
    const hex = minimapColors[String(mat[index])];
    if (hex === undefined) {
      throw new Error(`material id ${mat[index]} has no minimap color; refusing`);
    }
    rgb[index * 3] = Number.parseInt(hex.slice(1, 3), 16);
    rgb[index * 3 + 1] = Number.parseInt(hex.slice(3, 5), 16);
    rgb[index * 3 + 2] = Number.parseInt(hex.slice(5, 7), 16);
  }
  return encodePng(mapW, mapH, rgb);
}

/**
 * Assemble the full pack in memory. Throws (writes nothing) on any refusal:
 * failing validation report, loader rejection, flood mismatch, missing
 * minimap color, or missing TileForge identity.
 */
export function buildGamePack(input: GamePackInput): GamePackResult {
  if (input.report.status !== "pass") {
    throw new Error("refusing to pack a world whose validation report is failing");
  }
  const pinned = input.artifact.dependencies.tileforge;
  if (pinned === null || pinned === undefined) {
    throw new Error("artifact carries no pinned TileForge identity; refusing to pack");
  }

  const walkability = buildWalkability(input.artifact);

  const worldBytes = Buffer.from(canonicalJson(input.artifact), "utf8");
  const content: Array<[string, Buffer]> = [
    ["world.json", worldBytes],
    ["normalized-recipe.json", Buffer.from(canonicalJson(input.normalizedRecipe), "utf8")],
    ["validation-report.json", Buffer.from(canonicalJson(input.report), "utf8")],
    ["resolved/resolved-map.tmj", Buffer.from(canonicalJson(input.tmjDocument), "utf8")],
    ["resolved/tileforge-map-data.json", Buffer.from(canonicalJson(input.mapData), "utf8")],
    ["resolved/tileforge-slice.json", Buffer.from(canonicalJson(input.sliceManifest), "utf8")],
    ["walkability.json", Buffer.from(canonicalJson(walkability), "utf8")],
    ["minimap.png", renderMinimap(input.mapData, input.minimapColors)],
  ];

  const files: Record<string, string> = {};
  for (const [path, bytes] of content) {
    files[path] = sha256HexBytes(bytes);
  }
  const generator = input.artifact.generator;
  const manifest: Record<string, unknown> = {
    pack: "worldforge-game-pack",
    packFormat: GAME_PACK_FORMAT,
    world: input.worldName,
    artifactFormat: input.artifact.formatVersion,
    baseArtifactSha256: sha256HexBytes(worldBytes),
    adapter: { tileforge: TILEFORGE_ADAPTER_VERSION },
    generator: {
      name: generator.name,
      version: generator.version,
      seed: generator.seed,
      behaviorVersion: generator.generatorBehaviorVersion,
      recipeCompilerVersion: generator.recipeCompilerVersion,
      recipeSha256: generator.recipeSha256,
      resolvedConfigSha256: generator.resolvedConfigSha256,
      generationIdentitySha256: generator.generationIdentitySha256,
    },
    tileforge: {
      packageId: pinned.packageId,
      theme: input.theme,
      packageSha256: pinned.packageSha256,
      manifestSha256: pinned.manifestSha256,
    },
    dimensions: input.artifact.dimensions,
    walkability: {
      format: walkability.walkabilityFormat,
      floodCount: walkability.floodCount,
      spawnCell: walkability.spawnCell,
    },
    files,
  };

  return {
    files: [
      { path: "manifest.json", bytes: Buffer.from(canonicalJson(manifest), "utf8") },
      ...content.map(([path, bytes]) => ({ path, bytes })),
    ],
    manifest,
    walkability,
  };
}
