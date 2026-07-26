/**
 * Authors a map.tmj for a resolved WorldForge world (§2.13, "the reliable
 * way"): the raw grids are the source, every derived layer comes from the
 * proven §2 resolution module, and the tilesets block is copied verbatim
 * from the pinned package's own map.tmj (firstgids are data, not spec).
 *
 * Variant picks follow the §2.4 selector contract (v2 weighted accents plus
 * the smoothstep-bilinear tone field) through WorldForge named channels
 * ("tileforge.variant" / "tileforge.tone") — deliberately our own hash, which
 * the guide allows: any per-cell variant choice is seam-safe, masks are not
 * free. Structures use their ANCHOR cell's variant across the whole footprint
 * (§2.9); a two-part prop's overhang reuses the ground part's variant (§2.10).
 */

import { channel, type Channel } from "../../core/channels.js";
import { hashString32 } from "../../core/hash.js";
import { floorDiv } from "../../core/coords.js";
import type { TileForgeMapData } from "./resolve.js";
import {
  loadPinnedManifest,
  type FamilyInfo,
  type SelectorFamily,
  type TileForgeManifest,
} from "./manifest.js";
import {
  buildResolutionTables,
  resolveLayers,
  windowFromMapData,
  type ResolvedCellLayerName,
} from "./resolution.js";
import { loadPackageTmj, type TmjDocument, type TmjLayer } from "./tmj.js";

/** tmj layer name -> resolved layer name (§2.2 stack, package order). */
const LAYER_SOURCES: readonly (readonly [string, ResolvedCellLayerName | "sand"])[] = [
  ["underlay", "underlay"],
  ["sand", "sand"],
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

export interface EmittedTmj {
  readonly doc: TmjDocument;
  readonly tileCount: number;
  readonly layerCounts: Readonly<Record<string, number>>;
}

interface FamilyEmitter {
  readonly family: FamilyInfo;
  readonly firstgid: number;
  readonly selector: SelectorFamily | undefined;
  /** `${mask}|${variant}` -> frame-0 atlas entry index. */
  readonly entryByMaskVariant: ReadonlyMap<string, number>;
}

function buildFamilyEmitters(
  manifest: TileForgeManifest,
  packageDoc: TmjDocument,
): ReadonlyMap<string, FamilyEmitter> {
  const familyByImageBase = new Map<string, FamilyInfo>();
  for (const family of manifest.families.values()) {
    familyByImageBase.set(family.imageBase, family);
  }
  const emitters = new Map<string, FamilyEmitter>();
  for (const entry of packageDoc.tilesets) {
    const base = (entry.source.split("/").pop() as string).replace(/\.[^.]+$/, "");
    const family = familyByImageBase.get(base);
    if (family === undefined) {
      throw new Error(`package map.tmj tileset "${entry.source}" matches no manifest family`);
    }
    const cell = 32 + 2 * family.atlasPadding;
    const entryByMaskVariant = new Map<string, number>();
    for (const tile of family.tiles) {
      if (tile.frame !== 0) continue;
      const col = (tile.atlasX - family.atlasPadding) / cell;
      const row = (tile.atlasY - family.atlasPadding) / cell;
      entryByMaskVariant.set(
        `${tile.mask}|${tile.variant}`,
        row * family.atlasColumns + col,
      );
    }
    emitters.set(family.key, {
      family,
      firstgid: entry.firstgid,
      selector:
        manifest.selectorVersion >= 2
          ? manifest.selectorFamilies.get(family.key)
          : undefined,
      entryByMaskVariant,
    });
  }
  return emitters;
}

/** §2.4 tone bucket: smoothstep-bilinear value noise on the period lattice. */
export function toneAt(
  tone: Channel,
  tones: NonNullable<SelectorFamily["tones"]>,
  x: number,
  y: number,
): number {
  const period = tones.period;
  const ix = floorDiv(x, period);
  const iy = floorDiv(y, period);
  const sx = tones.smooth[x - ix * period] as number;
  const sy = tones.smooth[y - iy * period] as number;
  const n00 = tone.hashAt(ix, iy) % 1000;
  const n10 = tone.hashAt(ix + 1, iy) % 1000;
  const n01 = tone.hashAt(ix, iy + 1) % 1000;
  const n11 = tone.hashAt(ix + 1, iy + 1) % 1000;
  const v =
    (n00 * (1000 - sx) + n10 * sx) * (1000 - sy) +
    (n01 * (1000 - sx) + n11 * sx) * sy;
  return v >= 500_000_000 ? 1 : 0;
}

/** §2.4 selector: v2 accent bands off the top, pattern buckets, tone copies. */
export function pickVariant(
  emitter: FamilyEmitter,
  toneChannel: Channel,
  hv: number,
  x: number,
  y: number,
): number {
  const sel = emitter.selector;
  if (sel === undefined) {
    return hv % emitter.family.variants;
  }
  const baseVariants = sel.baseVariants;
  const toneCount = sel.tones?.n ?? 1;
  const roll = hv % 100;
  let accentAcc = 0;
  for (let i = 0; i < sel.extrasPct.length; i += 1) {
    accentAcc += sel.extrasPct[i] as number;
    if (roll >= 100 - accentAcc) {
      return baseVariants * toneCount + i; // accents sit past every tone copy
    }
  }
  const pattern =
    accentAcc > 0
      ? Math.floor((roll * baseVariants) / (100 - accentAcc))
      : hv % baseVariants;
  if (toneCount > 1 && sel.tones !== undefined) {
    return toneAt(toneChannel, sel.tones, x, y) * baseVariants + pattern;
  }
  return pattern;
}

export function emitResolvedTmj(data: TileForgeMapData, seed: number): EmittedTmj {
  const { manifest } = loadPinnedManifest();
  const tables = buildResolutionTables(manifest);
  const resolved = resolveLayers(
    tables,
    windowFromMapData(data),
    0,
    0,
    data.mapW,
    data.mapH,
  );
  const packageDoc = loadPackageTmj();
  const emitters = buildFamilyEmitters(manifest, packageDoc);
  const variantChannel = channel(seed, "tileforge.variant");
  const toneChannel = channel(seed, "tileforge.tone");

  const gidFor = (
    layerSalt: number,
    placed: string,
    x: number,
    y: number,
    variantAt?: readonly [number, number],
  ): number => {
    const split = placed.indexOf(":");
    const familyKey = placed.slice(0, split);
    const mask = Number(placed.slice(split + 1));
    const emitter = emitters.get(familyKey);
    if (emitter === undefined) {
      throw new Error(`family "${familyKey}" has no tileset in the package map.tmj`);
    }
    const [vx, vy] = variantAt ?? [x, y];
    const hv = variantChannel.hashAt(vx, vy, layerSalt);
    const variant = pickVariant(emitter, toneChannel, hv, vx, vy);
    let entry = emitter.entryByMaskVariant.get(`${mask}|${variant}`);
    for (let step = 1; entry === undefined && step < emitter.family.variants; step += 1) {
      // Defensive: wrap into the variants that exist for this mask.
      entry = emitter.entryByMaskVariant.get(
        `${mask}|${(variant + step) % emitter.family.variants}`,
      );
    }
    if (entry === undefined) {
      throw new Error(`family "${familyKey}" has no tile for mask ${mask}`);
    }
    return emitter.firstgid + entry;
  };

  const width = data.mapW;
  const height = data.mapH;
  const layers: TmjLayer[] = [];
  const layerCounts: Record<string, number> = {};
  let tileCount = 0;

  const sourceByName = new Map(LAYER_SOURCES);
  for (const packageLayer of packageDoc.layers) {
    if (packageLayer.type !== "tilelayer") continue;
    const sourceName = sourceByName.get(packageLayer.name);
    if (sourceName === undefined) {
      throw new Error(`package map.tmj has unexpected layer "${packageLayer.name}"`);
    }
    const salt = hashString32(packageLayer.name);
    const out = new Array<number>(width * height).fill(0);
    if (sourceName === "sand") {
      // Dual points at x,y >= 0 are storable; -1 row/col must stay empty
      // (§2.13 trap 6 — generated worlds keep the sand margin).
      const dualW = width + 1;
      for (let y = -1; y < height; y += 1) {
        for (let x = -1; x < width; x += 1) {
          const placed = resolved.sand[(y + 1) * dualW + (x + 1)] as string;
          if (placed === "") continue;
          if (x < 0 || y < 0) {
            throw new Error(`sand margin violated: dual point (${x}, ${y}) is occupied`);
          }
          out[y * width + x] = gidFor(salt, placed, x, y);
          tileCount += 1;
        }
      }
    } else {
      const cells = resolved.cells[sourceName];
      for (let index = 0; index < cells.length; index += 1) {
        const placed = cells[index] as string;
        if (placed === "") continue;
        const x = index % width;
        const y = (index - x) / width;
        let variantAt: readonly [number, number] | undefined;
        if (sourceName === "structures") {
          // §2.9: every footprint cell uses the anchor cell's variant.
          const code = Number(placed.slice(placed.indexOf(":") + 1));
          const def = manifest.structureById.get(code >> 8);
          if (def === undefined) {
            throw new Error(`meta code ${code} references unknown structure`);
          }
          const cellIndex = code % 256;
          variantAt = [x - (cellIndex % def.w), y - Math.floor(cellIndex / def.w)];
        } else if (sourceName === "propsOverhang") {
          // §2.10: the overhang reuses the ground part's variant (one below).
          variantAt = [x, y + 1];
        }
        out[index] = gidFor(salt, placed, x, y, variantAt);
        tileCount += 1;
      }
    }
    layerCounts[packageLayer.name] = out.filter((gid) => gid !== 0).length;
    layers.push({
      ...packageLayer,
      data: out,
      width,
      height,
    });
  }

  const doc: TmjDocument = {
    ...packageDoc,
    width,
    height,
    layers,
    tilesets: packageDoc.tilesets,
  };
  return { doc, tileCount, layerCounts };
}
