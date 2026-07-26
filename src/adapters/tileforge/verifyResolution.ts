/**
 * Resolution-level verification (W7 entry gate).
 *
 * Truth test: the pinned package ships map-data.json (raw grids) and map.tmj
 * (the forge's own derived tiles from those same grids). Deriving masks and
 * underlays per GAME-GUIDE §2 from the raw grids and comparing (family, mask)
 * per cell against the stored tmj proves the derivation is forge-identical —
 * §4 step 2's mask comparison, done in pure TypeScript. Variant and frame
 * picks are legitimately different (§2.4); masks must not be.
 *
 * Seam test: resolving every chunk independently over a 2-cell data halo must
 * reproduce global resolution byte-for-byte — chunk-border matching at
 * resolution level (masks/underlays), not just raw grids. Window reads beyond
 * the granted halo throw, so a passing run also proves the halo bound.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { TileForgeMapData } from "./resolve.js";
import { loadPinnedManifest, type FamilyInfo, type TileForgeManifest } from "./manifest.js";
import {
  buildResolutionTables,
  resolveLayers,
  sliceWindow,
  windowFromMapData,
  RESOLVED_CELL_LAYERS,
  type ResolvedCellLayerName,
} from "./resolution.js";

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const SAMPLE_LIMIT = 12;

/** tmj layer name -> derived layer name (identical except props-overhang). */
const TMJ_LAYER_NAMES: readonly (readonly [string, ResolvedCellLayerName])[] = [
  ["underlay", "underlay"],
  ["terrain", "terrain"],
  ["moss", "moss"],
  ["tallgrass", "tallgrass"],
  ["crops", "crops"],
  ["river", "river"],
  ["cliff", "cliff"],
  ["ramps", "ramps"],
  ["pier", "pier"],
  ["road", "road"],
  ["fence", "fence"],
  ["decals", "decals"],
  ["wall", "wall"],
  ["structures", "structures"],
  ["props", "props"],
  ["props-overhang", "propsOverhang"],
];

export interface LayerComparison {
  readonly layer: string;
  readonly cellsCompared: number;
  readonly storedPlaced: number;
  readonly derivedPlaced: number;
  readonly mismatches: number;
  readonly samples: readonly string[];
  readonly notes?: readonly string[];
}

export interface TruthReport {
  readonly ok: boolean;
  readonly mapW: number;
  readonly mapH: number;
  readonly layers: readonly LayerComparison[];
}

export interface SeamReport {
  readonly ok: boolean;
  readonly chunkW: number;
  readonly chunkH: number;
  readonly halo: number;
  readonly chunksChecked: number;
  readonly cellsCompared: number;
  readonly mismatches: number;
  readonly samples: readonly string[];
}

interface TmjDocument {
  readonly width: number;
  readonly height: number;
  readonly layers: readonly {
    readonly name: string;
    readonly type: string;
    readonly data?: readonly number[];
  }[];
  readonly tilesets: readonly { readonly firstgid: number; readonly source: string }[];
}

/** gid -> "family:mask" decoder built from the manifest atlas tables. */
export interface GidDecoder {
  decode(gid: number): string;
}

const FLIP_BITS = 0xe0000000;

export function buildGidDecoder(manifest: TileForgeManifest, doc: TmjDocument): GidDecoder {
  const familyByImageBase = new Map<string, FamilyInfo>();
  for (const family of manifest.families.values()) {
    familyByImageBase.set(family.imageBase, family);
  }
  const sets = doc.tilesets
    .map((entry) => {
      const base = (entry.source.split("/").pop() as string).replace(/\.[^.]+$/, "");
      const family = familyByImageBase.get(base);
      if (family === undefined) {
        throw new Error(`map.tmj tileset "${entry.source}" matches no manifest family`);
      }
      const cell = 32 + 2 * family.atlasPadding;
      const entries: { mask: number }[] = [];
      for (const tile of family.tiles) {
        const col = (tile.atlasX - family.atlasPadding) / cell;
        const row = (tile.atlasY - family.atlasPadding) / cell;
        if (!Number.isInteger(col) || !Number.isInteger(row)) {
          throw new Error(`family ${family.key}: atlas position off the padded grid`);
        }
        entries[row * family.atlasColumns + col] = { mask: tile.mask };
      }
      return { firstgid: entry.firstgid, key: family.key, entries };
    })
    .sort((a, b) => a.firstgid - b.firstgid);

  return {
    decode(gid: number): string {
      if ((gid & FLIP_BITS) !== 0) {
        throw new Error(`map.tmj gid ${gid} carries flip bits (§2.13 forbids them)`);
      }
      let found = null;
      for (const set of sets) {
        if (set.firstgid <= gid) {
          found = set;
        } else {
          break;
        }
      }
      if (found === null) {
        throw new Error(`gid ${gid} precedes every tileset firstgid`);
      }
      const entry = found.entries[gid - found.firstgid];
      if (entry === undefined) {
        throw new Error(`gid ${gid} has no atlas entry in family ${found.key}`);
      }
      return `${found.key}:${entry.mask}`;
    },
  };
}

export function loadPackageMapData(): TileForgeMapData {
  const { lock } = loadPinnedManifest();
  const path = join(ROOT, ...lock.packagePath.split("/"), "map-data.json");
  return JSON.parse(readFileSync(path, "utf8")) as TileForgeMapData;
}

function loadPackageTmj(): TmjDocument {
  const { lock } = loadPinnedManifest();
  const path = join(ROOT, ...lock.packagePath.split("/"), "map.tmj");
  return JSON.parse(readFileSync(path, "utf8")) as TmjDocument;
}

/**
 * Truth test: derive every §2 layer from the package's own map-data.json and
 * compare (family, mask) per cell against the stored map.tmj tiles.
 */
export function verifyAgainstPackageMap(): TruthReport {
  const { manifest } = loadPinnedManifest();
  const tables = buildResolutionTables(manifest);
  const data = loadPackageMapData();
  const doc = loadPackageTmj();
  if (doc.width !== data.mapW || doc.height !== data.mapH) {
    throw new Error("map.tmj and map-data.json disagree on map dimensions");
  }
  const decoder = buildGidDecoder(manifest, doc);
  const derived = resolveLayers(
    tables,
    windowFromMapData(data),
    0,
    0,
    data.mapW,
    data.mapH,
  );

  const layerByName = new Map<string, readonly number[]>();
  for (const layer of doc.layers) {
    if (layer.type === "tilelayer" && layer.data !== undefined) {
      layerByName.set(layer.name, layer.data);
    }
  }

  const comparisons: LayerComparison[] = [];
  let allOk = true;

  for (const [tmjName, derivedName] of TMJ_LAYER_NAMES) {
    const stored = layerByName.get(tmjName);
    if (stored === undefined) {
      throw new Error(`map.tmj is missing expected layer "${tmjName}"`);
    }
    const derivedCells = derived.cells[derivedName];
    let storedPlaced = 0;
    let derivedPlaced = 0;
    let mismatches = 0;
    const samples: string[] = [];
    for (let index = 0; index < stored.length; index += 1) {
      const gid = stored[index] as number;
      const expected = gid === 0 ? "" : decoder.decode(gid);
      const actual = derivedCells[index] as string;
      if (expected !== "") storedPlaced += 1;
      if (actual !== "") derivedPlaced += 1;
      if (expected !== actual) {
        mismatches += 1;
        if (samples.length < SAMPLE_LIMIT) {
          const x = index % data.mapW;
          const y = (index - x) / data.mapW;
          samples.push(`(${x},${y}) stored=${expected || "-"} derived=${actual || "-"}`);
        }
      }
    }
    if (mismatches > 0) allOk = false;
    comparisons.push({
      layer: tmjName,
      cellsCompared: stored.length,
      storedPlaced,
      derivedPlaced,
      mismatches,
      samples,
    });
  }

  // Sand: only dual points whose 2x2 sample window lies fully in-world are
  // comparable. The workbench map was cropped from a larger canvas, so its
  // border sand tiles were derived from pre-crop neighbors that the shipped
  // raw grids cannot reproduce (the §4 honesty note in spirit); the §2.7
  // consumer contract — out-of-world is never sand — is what we implement,
  // and the seam test covers real world edges. The border ring is excluded
  // from the hard comparison and reported instead.
  {
    const stored = layerByName.get("sand");
    if (stored === undefined) {
      throw new Error('map.tmj is missing expected layer "sand"');
    }
    let storedPlaced = 0;
    let derivedPlaced = 0;
    let mismatches = 0;
    let interiorCompared = 0;
    let borderExcluded = 0;
    let borderDivergent = 0;
    const samples: string[] = [];
    const dualW = data.mapW + 1;
    for (let y = -1; y < data.mapH; y += 1) {
      for (let x = -1; x < data.mapW; x += 1) {
        const actual = derived.sand[(y + 1) * dualW + (x + 1)] as string;
        let expected = "";
        if (x >= 0 && y >= 0) {
          const gid = stored[y * data.mapW + x] as number;
          expected = gid === 0 ? "" : decoder.decode(gid);
        }
        if (expected !== "") storedPlaced += 1;
        if (actual !== "") derivedPlaced += 1;
        const windowInWorld =
          x >= 0 && y >= 0 && x + 1 < data.mapW && y + 1 < data.mapH;
        if (!windowInWorld) {
          borderExcluded += 1;
          if (expected !== actual) borderDivergent += 1;
          continue;
        }
        interiorCompared += 1;
        if (expected !== actual) {
          mismatches += 1;
          if (samples.length < SAMPLE_LIMIT) {
            samples.push(`dual(${x},${y}) stored=${expected || "-"} derived=${actual || "-"}`);
          }
        }
      }
    }
    if (mismatches > 0) allOk = false;
    comparisons.push({
      layer: "sand",
      cellsCompared: interiorCompared,
      storedPlaced,
      derivedPlaced,
      mismatches,
      samples,
      notes: [
        `border ring excluded: ${borderExcluded} dual points (${borderDivergent} diverge — ` +
          "map.tmj border sand carries pre-crop workbench data the raw grids cannot reproduce)",
      ],
    });
  }

  return { ok: allOk, mapW: data.mapW, mapH: data.mapH, layers: comparisons };
}

/**
 * Seam test: resolve every chunk of the map independently over a `halo`-cell
 * window and compare all derived layers against the global resolution.
 */
export function verifyChunkedResolution(
  data: TileForgeMapData,
  chunkW: number,
  chunkH: number,
  halo = 2,
): SeamReport {
  const { manifest } = loadPinnedManifest();
  const tables = buildResolutionTables(manifest);
  const global = resolveLayers(
    tables,
    windowFromMapData(data),
    0,
    0,
    data.mapW,
    data.mapH,
  );

  let chunksChecked = 0;
  let cellsCompared = 0;
  let mismatches = 0;
  const samples: string[] = [];
  const note = (text: string): void => {
    if (samples.length < SAMPLE_LIMIT) {
      samples.push(text);
    }
  };

  for (let y0 = 0; y0 < data.mapH; y0 += chunkH) {
    for (let x0 = 0; x0 < data.mapW; x0 += chunkW) {
      const w = Math.min(chunkW, data.mapW - x0);
      const h = Math.min(chunkH, data.mapH - y0);
      const window = sliceWindow(data, x0, y0, w, h, halo);
      const local = resolveLayers(tables, window, x0, y0, w, h);
      chunksChecked += 1;

      for (const layer of RESOLVED_CELL_LAYERS) {
        const localCells = local.cells[layer];
        const globalCells = global.cells[layer];
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            cellsCompared += 1;
            const ours = localCells[y * w + x] as string;
            const theirs = globalCells[(y0 + y) * data.mapW + x0 + x] as string;
            if (ours !== theirs) {
              mismatches += 1;
              note(`${layer}(${x0 + x},${y0 + y}) chunked=${ours || "-"} global=${theirs || "-"}`);
            }
          }
        }
      }

      // Sand dual points: every point the chunk's window can see, compared
      // against the global dual grid — overlapping points are deliberately
      // verified from both neighboring chunks.
      const dualW = data.mapW + 1;
      for (let y = -1; y < h; y += 1) {
        for (let x = -1; x < w; x += 1) {
          cellsCompared += 1;
          const ours = local.sand[(y + 1) * (w + 1) + (x + 1)] as string;
          const theirs = global.sand[(y0 + y + 1) * dualW + (x0 + x + 1)] as string;
          if (ours !== theirs) {
            mismatches += 1;
            note(`sand dual(${x0 + x},${y0 + y}) chunked=${ours || "-"} global=${theirs || "-"}`);
          }
        }
      }
    }
  }

  return {
    ok: mismatches === 0,
    chunkW,
    chunkH,
    halo,
    chunksChecked,
    cellsCompared,
    mismatches,
    samples,
  };
}
