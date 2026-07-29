/**
 * Game-pack exporter (docs/GAME_INTEGRATION_PLAN.md §3, ratified 2026-07-27).
 *
 * Packs an approved, validated world into the frozen consumer layout a game
 * importer can trust: the engine-neutral artifact, the TileForge-resolved
 * layers, a precomputed walkability bitgrid — the PUBLIC loader ladder
 * (parity-proven by construction) with the pack-level semantics on top
 * (the moss-walks ruling and the WYSIWYG art-outline stamp; see
 * buildWalkability and stampStructuresSolid) — a minimap, and a
 * byte-stable manifest naming
 * every file's hash plus the base artifact and adapter identities (the
 * multi-game consumer rule, made mechanical).
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
import { loadWorldArtifact, STRUCTURE_PASS_CELLS } from "../consumers/typescript/loader.js";
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
): { readonly count: number; readonly seen: Uint8Array } {
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
  return { count, seen };
}

/** An atomic structure placement's footprint, in world cells. */
export interface PlacementRect {
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The placements whose ART outline stamps solid at pack level: settlement
 * structures and structure-bearing POIs, every type — a placement's pass
 * cells (the loader's STRUCTURE_PASS_CELLS: gate arches, cave mouths, den
 * and crypt doors, the dock's deck) are skipped at stamp time instead of
 * whole types being skipped, so collision equals the drawn opening exactly.
 * Landmark stamps are deliberately EXCLUDED — they are open-air compounds
 * whose gates, wall breaches, and interior lanes are validated-reachable
 * playable space (behavior 47 exists to keep them open). Bridges never
 * appear here (route crossings are not placements) and stay walkable.
 */
export function collectStructureRects(artifact: WorldArtifact): PlacementRect[] {
  const rects: PlacementRect[] = [];
  for (const settlement of artifact.settlements) {
    for (const structure of settlement.structures) {
      rects.push({
        type: structure.type,
        x: structure.cell[0],
        y: structure.cell[1],
        w: structure.footprint[0],
        h: structure.footprint[1],
      });
    }
  }
  for (const poi of artifact.pois) {
    if (poi.structure !== undefined) {
      rects.push({
        type: poi.structure.type,
        x: poi.structure.x,
        y: poi.structure.y,
        w: poi.structure.w,
        h: poi.structure.h,
      });
    }
  }
  return rects;
}

/**
 * WYSIWYG structure stamping (docs/GAME_INTEGRATION_PLAN.md §3.3, designer
 * ruling 2026-07-29, screenshot-confirmed): a building's collision equals
 * its ART OUTLINE — every footprint cell stamps non-walkable EXCEPT the
 * type's declared pass cells, where the art itself draws an opening or a
 * walkway (gate arches, cave mouths, den and crypt doors, the stone
 * circle's gaps, the dock's deck). House types declare no pass cells, so
 * houses are exactly as solid as they look, doors included.
 *
 * Nothing beyond the art seals. The slit and thread campaigns of the
 * porosity era are REVERTED by the same ruling: a one-wide grass strip
 * between two houses renders as ground, so it is legal walking ground —
 * the player-sprite overdraw that motivated sealing is fixed game-side by
 * y-sorted structure rendering. Mutates `bits`; returns the flipped cell
 * indexes in row-major scan order (deterministic by construction) plus the
 * stamped-solid mask (footprint cells minus pass cells).
 */
export function stampStructuresSolid(
  bits: Uint8Array,
  width: number,
  height: number,
  rects: readonly PlacementRect[],
): {
  readonly rectStamped: number[];
  readonly mask: Uint8Array;
} {
  const mask = new Uint8Array(width * height);
  for (const rect of rects) {
    const pass = STRUCTURE_PASS_CELLS[rect.type];
    for (let sy = 0; sy < rect.h; sy += 1) {
      for (let sx = 0; sx < rect.w; sx += 1) {
        if (pass !== undefined && pass.includes(sy * rect.w + sx)) continue;
        const x = rect.x + sx;
        const y = rect.y + sy;
        if (x >= 0 && y >= 0 && x < width && y < height) {
          mask[y * width + x] = 1;
        }
      }
    }
  }
  const rectStamped: number[] = [];
  for (let index = 0; index < width * height; index += 1) {
    if (mask[index] === 1 && bits[index] === 1) {
      bits[index] = 0;
      rectStamped.push(index);
    }
  }
  return { rectStamped, mask };
}

/**
 * Named WYSIWYG exceptions: cells where the shipped pack may deliberately
 * disagree with the what-you-see rule. Every entry is a RECORDED designer
 * decision with its ruling date — never a silent seal. Empty today, and the
 * goal is that it stays empty: the whole seal arc ended with the ruling
 * that what you see is where you can walk.
 */
export const WYSIWYG_EXCEPTIONS: ReadonlyArray<{
  readonly cell: readonly [number, number];
  readonly ruling: string;
}> = [];

/**
 * Derive the walkability grid from the artifact through the PUBLIC loader —
 * the same ladder the parity fixture proves cell-identical to the resolved
 * §3 ladder — then apply the pack-level semantics on top: the moss-walks
 * ruling and the WYSIWYG art-outline stamp (see stampStructuresSolid).
 * The packed encoding is verified by re-flooding from the packed bytes; a
 * flood mismatch is a hard failure (plan §3.4, refusal 2).
 *
 * The WYSIWYG gate (designer ruling 2026-07-29) audits the result in both
 * directions against an independent per-cell recomputation: no walkable
 * cell may render as non-ground (walkable = the ladder's ground semantics,
 * a declared pass-cell opening, or ruled moss carpet), and no cell that
 * renders as plain ground may be solid (the only solids on ground are art
 * footprints). Cells stamping ground solid must appear in
 * WYSIWYG_EXCEPTIONS with a recorded ruling; anything else refuses the
 * export. Cut-off ground pockets (a courtyard behind a now-solid door) are
 * NOT sealed or refused — they render as ground, so they stay walkable,
 * merely unreachable, exactly like any off-shore island.
 *
 * Moss-walks ruling (2026-07-28, designer-verified in play): flat foliage
 * that blocks movement is an unreadable promise, so bare moss carpet on
 * LEVEL-0 rock — the adapter's own cliff quantization, the flat apron
 * where a rock mass meets open land with no rendered cliff face — is
 * walkable in the pack. Moss stays solid where anything raised sits on or
 * under it: up the terraced peaks (level >= 1, behind cliff faces), under
 * a blocking prop (trees, boulders), under a structure tile, or on stream
 * water.
 */
export function buildWalkability(
  artifact: WorldArtifact,
  mapData: Pick<TileForgeMapData, "elev">,
): WalkabilitySummary {
  const loaded = loadWorldArtifact(artifact as unknown);
  if (!loaded.ok) {
    throw new Error(
      "artifact rejected by the public loader:\n" +
        loaded.issues.map((issue) => `  ${issue.path}: ${issue.message}`).join("\n"),
    );
  }
  const world = loaded.world;
  const { width, height } = world.dimensions;
  if (mapData.elev.length !== width * height) {
    throw new Error(
      `resolved elev grid is ${mapData.elev.length} cells, expected ${width * height}; refusing`,
    );
  }
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      bits[y * width + x] = world.walkableAt(x, y) ? 1 : 0;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (
        bits[index] === 0 &&
        world.mossAt(x, y) &&
        world.materialAt(x, y) === "terrain.rock" &&
        (mapData.elev[index] as number) === 0 &&
        world.structureAt(x, y) === null &&
        world.propAt(x, y) === null &&
        world.fenceAt(x, y) === null &&
        world.riverTierAt(x, y) === 0
      ) {
        bits[index] = 1;
      }
    }
  }

  const { mask } = stampStructuresSolid(bits, width, height, collectStructureRects(artifact));

  // Spawn: the first destination, nudged to the nearest walkable cell — the
  // same rule the traversal harness uses (consumers/typescript/traverse.mjs),
  // searched on the STAMPED grid so the spawn survives its own pack.
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
  const flood = floodFrom(width, height, (index) => bits[index] === 1, spawnIndex);

  // The WYSIWYG gate (hard, both directions): recompute the expected bit
  // for every cell from first principles — the public ladder's verdict, the
  // moss-carpet ruling, and the art-outline mask — and refuse the export on
  // any disagreement. Direction one, no walkable cell renders as non-ground:
  // bits may only be 1 where the recomputation walks. Direction two, no
  // plain-ground render is solid: bits may only be 0 where the art stamps
  // or the ladder itself blocks; a cell sealed for any OTHER reason must be
  // a named entry in WYSIWYG_EXCEPTIONS. This is the regression tripwire
  // for the whole seal arc — any future campaign that flips cells beyond
  // the art outline fires it immediately.
  {
    const exceptions = new Set<number>(
      WYSIWYG_EXCEPTIONS.map((entry) => entry.cell[1] * width + entry.cell[0]),
    );
    const mismatches: number[] = [];
    for (let y = 0; y < height && mismatches.length < 6; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const mossCarpet =
          world.mossAt(x, y) &&
          world.materialAt(x, y) === "terrain.rock" &&
          (mapData.elev[index] as number) === 0 &&
          world.structureAt(x, y) === null &&
          world.propAt(x, y) === null &&
          world.fenceAt(x, y) === null &&
          world.riverTierAt(x, y) === 0;
        const expected =
          (world.walkableAt(x, y) || mossCarpet) && mask[index] !== 1 ? 1 : 0;
        if ((bits[index] as number) !== expected && !exceptions.has(index)) {
          mismatches.push(index);
          if (mismatches.length >= 6) break;
        }
      }
    }
    if (mismatches.length > 0) {
      const samples = mismatches
        .map((index) => `(${index % width}, ${(index - (index % width)) / width})`)
        .join(", ");
      throw new Error(
        `WYSIWYG gate: walkability disagrees with the rendered ground at ${samples}` +
          ` and possibly more; a cell that renders as ground must walk and a` +
          ` walkable cell must render as ground — refusing to export`,
      );
    }
  }

  const packed = packBits(bits);
  const packedFlood = floodFrom(width, height, (index) => unpackBit(packed, index), spawnIndex);
  if (packedFlood.count !== flood.count) {
    throw new Error(
      `packed-grid flood ${packedFlood.count} != stamped flood ${flood.count}; refusing to export`,
    );
  }
  return {
    walkabilityFormat: WALKABILITY_FORMAT,
    width,
    height,
    encoding: "base64-bitpacked-row-major-lsb-first",
    grid: Buffer.from(packed).toString("base64"),
    floodCount: flood.count,
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

  const walkability = buildWalkability(input.artifact, input.mapData);

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
