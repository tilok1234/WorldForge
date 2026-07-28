/**
 * Game-pack exporter (docs/GAME_INTEGRATION_PLAN.md §3, ratified 2026-07-27).
 *
 * Packs an approved, validated world into the frozen consumer layout a game
 * importer can trust: the engine-neutral artifact, the TileForge-resolved
 * layers, a precomputed walkability bitgrid — the PUBLIC loader ladder
 * (parity-proven by construction) with the pack-level semantics on top
 * (the moss-walks ruling and the Phase-A structures-solid stamp; see
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
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Gate structures are corridor infrastructure, not buildings: their pass
 * cells carry a THROUGH-trail (behavior 47's "gates exempt" doctrine — the
 * ruined city's front door). Sealing one walls off everything behind it.
 */
const PACK_GATE_TYPES = new Set<string>(["structure.ruined_gate", "structure.fortress_gate"]);

/**
 * The placements that stamp solid at pack level: settlement structures and
 * structure-bearing POIs, gates excepted. Landmark stamps are deliberately
 * EXCLUDED — they are open-air compounds whose gates, wall breaches, and
 * interior lanes are validated-reachable playable space (behavior 47 exists
 * to keep them open); sealing them would orphan their interiors. Bridges
 * never appear here (route crossings are not placements) and stay walkable.
 */
export function collectStructureRects(artifact: WorldArtifact): PlacementRect[] {
  const rects: PlacementRect[] = [];
  for (const settlement of artifact.settlements) {
    for (const structure of settlement.structures) {
      rects.push({
        x: structure.cell[0],
        y: structure.cell[1],
        w: structure.footprint[0],
        h: structure.footprint[1],
      });
    }
  }
  for (const poi of artifact.pois) {
    if (poi.structure !== undefined && !PACK_GATE_TYPES.has(poi.structure.type)) {
      rects.push({ x: poi.structure.x, y: poi.structure.y, w: poi.structure.w, h: poi.structure.h });
    }
  }
  return rects;
}

/**
 * Phase-A structures-solid stamping (docs/GAME_INTEGRATION_PLAN.md §3.3):
 * the consuming game has no interiors, so a building's collision must equal
 * its art. Two deterministic passes over the loader-derived grid:
 *
 * 1. Every cell of every placement footprint goes non-walkable — doors and
 *    pass cells included (cave mouths, dens, the stone circle's gaps): a
 *    0.7-tile player brushing a facade otherwise slides into the sprite.
 * 2. UNPAVED one-cell slits bounded on opposite orthogonal sides by
 *    placement cells close too: the grass/snow columns between terrace
 *    neighbours and the bare lanes behind building rows read as building
 *    interior at gameplay zoom and snag the player. `keepOpen` cells are
 *    EXEMPT — streets (the settlement planner paves the lanes it means as
 *    streets, cobble and packed road, with doors opening onto them),
 *    trails and fords (behavior 47 keeps them open), and every cell
 *    inside a landmark footprint (curated compound interiors whose lanes
 *    are ruined-road band art over bare ground — paving the street mask
 *    cannot see). Sealing those severs real corridors: the tiny fixture's
 *    village loses half the map to one sealed lane, and the canonical
 *    ruined city loses its street grid.
 *
 * Mutates `bits`; returns the flipped cell indexes per pass (row-major
 * ascending — pass order is scan order, so output is deterministic by
 * construction) plus the footprint mask, which the caller's connectivity
 * reconciliation needs. Slit seals are provisional: the caller may reopen
 * one that turns out to be a mountain notch or another sole corridor.
 */
export function stampStructuresSolid(
  bits: Uint8Array,
  width: number,
  height: number,
  rects: readonly PlacementRect[],
  keepOpen: Readonly<Uint8Array>,
): {
  readonly rectStamped: number[];
  readonly slitStamped: number[];
  readonly mask: Uint8Array;
} {
  const mask = new Uint8Array(width * height);
  for (const rect of rects) {
    for (let sy = 0; sy < rect.h; sy += 1) {
      for (let sx = 0; sx < rect.w; sx += 1) {
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
  const slitStamped: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (bits[index] !== 1 || mask[index] === 1 || keepOpen[index] === 1) continue;
      const eastWest =
        x > 0 && x < width - 1 && mask[index - 1] === 1 && mask[index + 1] === 1;
      const northSouth =
        y > 0 && y < height - 1 && mask[index - width] === 1 && mask[index + width] === 1;
      if (eastWest || northSouth) {
        bits[index] = 0;
        slitStamped.push(index);
      }
    }
  }
  return { rectStamped, slitStamped, mask };
}

/**
 * Cells the slit and back-pocket passes must never seal: paved corridor
 * materials (the planner's streets), trail cells, pier decks, walkable
 * water (a river cell is walkable only because it fords or bridges a
 * corridor), moss carpet (readable ground cover — where the moss ruling
 * makes it walkable it must STAY walkable), and landmark-footprint
 * interiors (curated compounds — their lanes are band art over bare
 * ground, invisible to material paving). Mirrors the loader's corridor
 * vocabulary plus the landmark records.
 */
export function buildKeepOpenMask(
  world: {
    readonly dimensions: { readonly width: number; readonly height: number };
    materialAt(x: number, y: number): string;
    trailAt(x: number, y: number): boolean;
    pierAt(x: number, y: number): string | null;
    riverTierAt(x: number, y: number): number;
    mossAt(x: number, y: number): boolean;
  },
  landmarks: ReadonlyArray<{
    readonly cell: readonly [number, number];
    readonly footprint: readonly [number, number];
  }>,
): Uint8Array {
  const { width, height } = world.dimensions;
  const keepOpen = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const material = world.materialAt(x, y);
      if (
        material === "terrain.packed_road" ||
        material === "terrain.cobble" ||
        world.trailAt(x, y) ||
        world.pierAt(x, y) !== null ||
        world.riverTierAt(x, y) > 0 ||
        world.mossAt(x, y)
      ) {
        keepOpen[y * width + x] = 1;
      }
    }
  }
  for (const landmark of landmarks) {
    for (let sy = 0; sy < landmark.footprint[1]; sy += 1) {
      for (let sx = 0; sx < landmark.footprint[0]; sx += 1) {
        const x = landmark.cell[0] + sx;
        const y = landmark.cell[1] + sy;
        if (x >= 0 && y >= 0 && x < width && y < height) {
          keepOpen[y * width + x] = 1;
        }
      }
    }
  }
  return keepOpen;
}

/**
 * Derive the walkability grid from the artifact through the PUBLIC loader —
 * the same ladder the parity fixture proves cell-identical to the resolved
 * §3 ladder — then apply the pack-level semantics on top: the moss-walks
 * ruling and the Phase-A structures-solid stamp (see stampStructuresSolid).
 * The packed encoding is verified by re-flooding from the packed bytes. A
 * flood mismatch is a hard failure (plan §3.4, refusal 2), and so is
 * stamping that orphans any walkable region beyond the stamped cells
 * themselves: the flood may shrink by exactly the stamped cells that were
 * reachable, nothing more. A bigger drop means a street or pocket lost its
 * only corridor, and a severed world cannot ship silently.
 *
 * Moss-walks ruling (2026-07-28, designer-verified in play): flat foliage
 * that blocks movement is an unreadable promise, so bare moss carpet on
 * LEVEL-0 rock — the adapter's own cliff quantization, the flat apron
 * where a rock mass meets open land with no rendered cliff face — is
 * walkable in the pack. Moss stays solid where anything raised sits on or
 * under it: up the terraced peaks (level >= 1, behind cliff faces), under
 * a blocking prop (trees, boulders), under a structure tile (keeps the
 * porosity audit's 11-cell count exact), or on stream water.
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

  const baseBits = bits.slice();
  const keepOpen = buildKeepOpenMask(world, artifact.landmarks);
  const { rectStamped, slitStamped, mask } = stampStructuresSolid(
    bits,
    width,
    height,
    collectStructureRects(artifact),
    keepOpen,
  );

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

  const baseFlood = floodFrom(width, height, (index) => baseBits[index] === 1, spawnIndex);

  // Connectivity reconciliation: sealing may cut regions off the spawn
  // component. Each cut-off region is judged whole, per round:
  //
  // - Every cell unpaved, off-landmark, and within two cells of a placement
  //   -> the region is the building block's own back geometry (the lane
  //   behind a terrace, the nook behind the den that plugs it): SEAL it
  //   with the rest.
  // - Anything else (a street, a landmark lane, open ground) -> a real
  //   corridor was severed. The doorway seals reopen: every provisional
  //   slit seal orthogonally adjacent to the region is undone — the
  //   mountain notch between two mine buildings stays open even though the
  //   same geometry between two cottages seals. Footprint seals are never
  //   undone ("doors too"); if a region still cannot reconnect, refuse.
  //
  // Rounds are set-based (all regions judged, then all changes applied), so
  // the result is order-free and deterministic. The loop terminates: every
  // round either resolves all orphans or strictly shrinks the sealed set.
  const near = mask.slice();
  for (let ring = 0; ring < 2; ring += 1) {
    const grown = near.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (
          near[index] === 1 ||
          (x > 0 && near[index - 1] === 1) ||
          (x < width - 1 && near[index + 1] === 1) ||
          (y > 0 && near[index - width] === 1) ||
          (y < height - 1 && near[index + width] === 1)
        ) {
          grown[index] = 1;
        }
      }
    }
    near.set(grown);
  }

  const slitSealed = new Set<number>(slitStamped);
  const pocketSealed: number[] = [];
  let flood = floodFrom(width, height, (index) => bits[index] === 1, spawnIndex);
  for (;;) {
    const orphanRegion = new Int32Array(width * height).fill(-1);
    const regionSealable: boolean[] = [];
    const regionCells: number[][] = [];
    for (let index = 0; index < width * height; index += 1) {
      if (
        bits[index] !== 1 ||
        baseFlood.seen[index] !== 1 ||
        flood.seen[index] === 1 ||
        orphanRegion[index] !== -1
      ) {
        continue;
      }
      const region = regionCells.length;
      const cells: number[] = [index];
      orphanRegion[index] = region;
      let sealable = true;
      for (let head = 0; head < cells.length; head += 1) {
        const cell = cells[head] as number;
        if (near[cell] !== 1 || keepOpen[cell] === 1) sealable = false;
        const x = cell % width;
        const y = (cell - x) / width;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (
            bits[next] === 1 &&
            baseFlood.seen[next] === 1 &&
            flood.seen[next] === 0 &&
            orphanRegion[next] === -1
          ) {
            orphanRegion[next] = region;
            cells.push(next);
          }
        }
      }
      regionCells.push(cells);
      regionSealable.push(sealable);
    }
    if (regionCells.length === 0) break;

    let changed = 0;
    for (let region = 0; region < regionCells.length; region += 1) {
      const cells = regionCells[region] as number[];
      if (regionSealable[region] === true) {
        for (const cell of cells) {
          bits[cell] = 0;
          pocketSealed.push(cell);
          changed += 1;
        }
        continue;
      }
      for (const cell of cells) {
        const x = cell % width;
        const y = (cell - x) / width;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (slitSealed.has(next)) {
            slitSealed.delete(next);
            bits[next] = 1;
            changed += 1;
          }
        }
      }
    }
    if (changed === 0) {
      const stuck = regionCells.findIndex((_, region) => regionSealable[region] !== true);
      const sample = (regionCells[stuck === -1 ? 0 : stuck] as number[])[0] as number;
      throw new Error(
        `structure stamping cut cells off the spawn component at ` +
          `(${sample % width}, ${(sample - (sample % width)) / width}) with no slit ` +
          `seal to reopen; refusing to export a severed world`,
      );
    }
    flood = floodFrom(width, height, (index) => bits[index] === 1, spawnIndex);
  }

  const stamped = [...rectStamped, ...slitSealed, ...pocketSealed];
  let stampedReachable = 0;
  for (const index of stamped) {
    if (baseFlood.seen[index] === 1) stampedReachable += 1;
  }
  const orphaned = baseFlood.count - flood.count - stampedReachable;
  if (orphaned !== 0) {
    throw new Error(
      `structure stamping orphaned ${orphaned} walkable cells beyond the ` +
        `${stampedReachable} it removed; refusing to export a severed world`,
    );
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
