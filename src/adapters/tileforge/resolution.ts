/**
 * Consumer-side resolution derivation (W7 entry gate). Implements the pinned
 * package's GAME-GUIDE §2 mask and underlay algorithms in pure TypeScript so
 * WorldForge can prove, before any Godot work, that (a) the derivation is
 * forge-identical against the package's own workbench export and (b) chunked
 * resolution over a data halo reproduces global resolution exactly.
 *
 * Every rule cites its guide section. All tables come from the manifest
 * (mappings.transitions, cliffBiomes, type tables) — nothing here transcribes
 * ids from prose. One open contract question, decided by weight of package
 * sources: GAME-GUIDE §2.6 lists packed road in the wet-bank candidate list,
 * but FORMATS.md and the packaged worldgen example both omit it, and the
 * workbench map never puts a wet cell beside packed road, so the truth test
 * cannot arbitrate. This module follows FORMATS + example (no packed road);
 * the case does fire in generated worlds (bridge approaches), so if banks
 * beside roads ever look wrong, ask upstream which list is authoritative.
 *
 * Reads outside the window but inside the world throw: the seam verifier
 * relies on that to prove the halo it grants is genuinely sufficient.
 */

import type { TileForgeMapData } from "./resolve.js";
import { materialPairKey, type TileForgeManifest } from "./manifest.js";

/** Sentinel for out-of-world reads (window reads inside the world throw). */
const OUTSIDE = -1;

export type GridLayerName =
  | "mat"
  | "road"
  | "fence"
  | "wall"
  | "river"
  | "moss"
  | "tall"
  | "pier"
  | "decal"
  | "prop"
  | "crop"
  | "meta"
  | "elev"
  | "ramp";

const GRID_LAYERS: readonly GridLayerName[] = [
  "mat", "road", "fence", "wall", "river", "moss", "tall", "pier",
  "decal", "prop", "crop", "meta", "elev", "ramp",
];

/** A world-bounds-aware window over the raw grids (§2.11 halo evaluation). */
export interface GridWindow {
  readonly worldW: number;
  readonly worldH: number;
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
  readonly layers: Readonly<Record<GridLayerName, readonly number[]>>;
}

export function windowFromMapData(data: TileForgeMapData): GridWindow {
  const layers = {} as Record<GridLayerName, readonly number[]>;
  for (const name of GRID_LAYERS) {
    layers[name] = data[name];
  }
  return {
    worldW: data.mapW,
    worldH: data.mapH,
    x0: 0,
    y0: 0,
    w: data.mapW,
    h: data.mapH,
    layers,
  };
}

/** Copies a halo-padded window (clamped to world bounds) out of the grids. */
export function sliceWindow(
  data: TileForgeMapData,
  x0: number,
  y0: number,
  w: number,
  h: number,
  halo: number,
): GridWindow {
  const left = Math.max(0, x0 - halo);
  const top = Math.max(0, y0 - halo);
  const right = Math.min(data.mapW, x0 + w + halo);
  const bottom = Math.min(data.mapH, y0 + h + halo);
  const width = right - left;
  const height = bottom - top;
  const layers = {} as Record<GridLayerName, readonly number[]>;
  for (const name of GRID_LAYERS) {
    const source = data[name];
    const copy = new Array<number>(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        copy[y * width + x] = source[(top + y) * data.mapW + left + x] as number;
      }
    }
    layers[name] = copy;
  }
  return {
    worldW: data.mapW,
    worldH: data.mapH,
    x0: left,
    y0: top,
    w: width,
    h: height,
    layers,
  };
}

function readLayer(g: GridWindow, layer: GridLayerName, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= g.worldW || y >= g.worldH) {
    return OUTSIDE;
  }
  const wx = x - g.x0;
  const wy = y - g.y0;
  if (wx < 0 || wy < 0 || wx >= g.w || wy >= g.h) {
    throw new Error(
      `resolution read outside window: layer ${layer} at (${x}, ${y}), window ` +
        `(${g.x0}, ${g.y0}) ${g.w}x${g.h} — the halo is too small`,
    );
  }
  return g.layers[layer][wy * g.w + wx] as number;
}

/** Manifest-derived id tables the §2 algorithms consume. */
export interface ResolutionTables {
  readonly matPriority: readonly number[];
  readonly flushPairs: ReadonlySet<number>;
  readonly gutterPairs: ReadonlySet<number>;
  readonly materialFamilyById: readonly string[];
  readonly decalFamilyById: readonly string[];
  readonly roadFamilyByType: readonly string[];
  readonly pierFamilyByType: readonly string[];
  readonly fenceFamilyByType: readonly string[];
  readonly wallFamilyByType: readonly string[];
  readonly cliffGroupByMaterial: readonly string[];
  readonly cliffFamilyByGroup: ReadonlyMap<string, string>;
  readonly rampFamilyByGroup: ReadonlyMap<string, string>;
  readonly gateStructureIds: ReadonlySet<number>;
  /** wet = water, lava, shallow, deep, hot spring (§2.5 rule 2 targets). */
  readonly wet: ReadonlySet<number>;
  /** water group = water, shallow, deep (§2.5 rule 3, one body). */
  readonly waterGroup: ReadonlySet<number>;
  /** seamless floors render underlay-only (§2.3): soil, stone, cobble, dungeon, temple. */
  readonly seamlessFloors: ReadonlySet<number>;
  /** §2.6 wet-bank candidates in exact tie-break order (FORMATS.md list). */
  readonly wetBanks: readonly number[];
  readonly sandId: number;
  readonly soilId: number;
  /** prop type ids that carry an `_over` part (§2.10 two-part species). */
  readonly propOverhangTypes: ReadonlySet<number>;
}

const WET_KEYS = ["water", "lava", "shallow", "deep", "hotspring"] as const;
const WATER_GROUP_KEYS = ["water", "shallow", "deep"] as const;
const SEAMLESS_KEYS = ["soil", "stone", "cobble", "dungeonfloor", "templefloor"] as const;
/** FORMATS.md "Underlay bank priority" order, as family keys. */
const WET_BANK_KEYS = [
  "grass", "drygrass", "mud", "bog", "snow", "gravel", "ash", "basalt",
  "cavedirt", "cavestone", "fungal", "sand", "stone", "dungeonfloor",
  "templefloor", "rock",
] as const;

export function buildResolutionTables(manifest: TileForgeManifest): ResolutionTables {
  const idOf = (key: string): number => {
    const id = manifest.materialIdByKey.get(key);
    if (id === undefined) {
      throw new Error(`pinned manifest is missing material family "${key}"`);
    }
    return id;
  };
  const propOverhangTypes = new Set<number>();
  const propFamily = manifest.families.get("prop");
  if (propFamily !== undefined) {
    for (const tile of propFamily.tiles) {
      if (tile.mask % 10 === 1) {
        propOverhangTypes.add((tile.mask - 1) / 10);
      }
    }
  }
  return {
    matPriority: manifest.transitions.matPriority,
    flushPairs: manifest.transitions.flushPairs,
    gutterPairs: manifest.transitions.gutterPairs,
    materialFamilyById: manifest.materialFamilyById,
    decalFamilyById: manifest.decalFamilyById,
    roadFamilyByType: manifest.roadFamilyByType,
    pierFamilyByType: manifest.pierFamilyByType,
    fenceFamilyByType: manifest.fenceFamilyByType,
    wallFamilyByType: manifest.wallFamilyByType,
    cliffGroupByMaterial: manifest.cliffBiomes.groupByMaterial,
    cliffFamilyByGroup: manifest.cliffBiomes.cliffFamilyByGroup,
    rampFamilyByGroup: manifest.cliffBiomes.rampFamilyByGroup,
    gateStructureIds: manifest.gateStructureIds,
    wet: new Set(WET_KEYS.map(idOf)),
    waterGroup: new Set(WATER_GROUP_KEYS.map(idOf)),
    seamlessFloors: new Set(SEAMLESS_KEYS.map(idOf)),
    wetBanks: WET_BANK_KEYS.map(idOf),
    sandId: idOf("sand"),
    soilId: idOf("soil"),
    propOverhangTypes,
  };
}

const CARDINALS: readonly (readonly [number, number])[] = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
];
/** blob47 bit order (§2.4): N, NE, E, SE, S, SW, W, NW. */
const BLOB_BITS: readonly (readonly [number, number, number])[] = [
  [1, 0, -1], [2, 1, -1], [4, 1, 0], [8, 1, 1],
  [16, 0, 1], [32, -1, 1], [64, -1, 0], [128, -1, -1],
];

/** §2.4 step 3: a diagonal bit survives only with both adjacent cardinals. */
export function normalizeBlobMask(mask: number): number {
  let m = mask;
  if (m & 2 && !((m & 1) && (m & 4))) m &= ~2;
  if (m & 8 && !((m & 16) && (m & 4))) m &= ~8;
  if (m & 32 && !((m & 16) && (m & 64))) m &= ~32;
  if (m & 128 && !((m & 1) && (m & 64))) m &= ~128;
  return m;
}

/**
 * §2.5 connected(): does material m at (x, y) count the neighbor cell as
 * connected for blob47 masking? Rules 1-6 in guide order.
 */
export function connectedAt(
  t: ResolutionTables,
  g: GridWindow,
  m: number,
  nx: number,
  ny: number,
): boolean {
  const mb = readLayer(g, "mat", nx, ny);
  if (mb === OUTSIDE) {
    return true; // rule 5: out-of-world counts as connected (blob47/cliffs)
  }
  if (mb === m) {
    return true; // rule 1: same material
  }
  const riverFlagged = readLayer(g, "river", nx, ny) !== 0;
  if (!t.wet.has(m)) {
    // rule 2: land runs flush to water, lava, hot spring, and river flags
    if (t.wet.has(mb) || riverFlagged) {
      return true;
    }
  } else if (t.waterGroup.has(m)) {
    // rule 3: the water group is one body; river mouths merge into it
    if (t.waterGroup.has(mb) || riverFlagged) {
      return true;
    }
  }
  if (t.flushPairs.has(materialPairKey(m, mb))) {
    return true; // rule 4: flush pairs (snow-ice, water-ice, ash-basalt, ...)
  }
  // rule 6: the priority ladder — a strictly higher non-wet neighbor absorbs
  // this region's edge (the wet tier keeps its own shoreline rules above).
  if (
    !t.wet.has(mb) &&
    (t.matPriority[m] as number) < (t.matPriority[mb] as number) &&
    !t.gutterPairs.has(materialPairKey(m, mb))
  ) {
    return true;
  }
  return false;
}

/** §2.4 blob47 mask for the material at (x, y). */
export function blobMask(t: ResolutionTables, g: GridWindow, x: number, y: number, m: number): number {
  let mask = 0;
  for (const [bit, dx, dy] of BLOB_BITS) {
    if (connectedAt(t, g, m, x + dx, y + dy)) {
      mask |= bit;
    }
  }
  return normalizeBlobMask(mask);
}

/** A derived cell placement: family key plus the layer-code mask. */
export interface PlacedTile {
  readonly family: string;
  readonly mask: number;
}

/**
 * §2.6 underlay for every cell. Wet cells bank on the dominant cardinal
 * neighbor from the FORMATS candidate list; the four seamless floors take
 * their own fill; land cells take the dominant strictly-lower-priority
 * neighbor with the open-side rule. Encoding: sand -> corner 15, seamless
 * floors -> fill (mask 0), everything else -> mask 255.
 */
export function underlayAt(t: ResolutionTables, g: GridWindow, x: number, y: number): PlacedTile {
  const m = readLayer(g, "mat", x, y);
  const asUnderlay = (winner: number): PlacedTile => {
    if (winner === t.sandId) {
      return { family: "sand", mask: 15 };
    }
    const family = t.materialFamilyById[winner] as string;
    if (t.seamlessFloors.has(winner)) {
      return { family, mask: 0 };
    }
    return { family, mask: 255 };
  };

  // Seamless floors other than soil carry their own fill unconditionally.
  if (t.seamlessFloors.has(m) && m !== t.soilId) {
    return { family: t.materialFamilyById[m] as string, mask: 0 };
  }

  if (t.wet.has(m)) {
    // Wet path: dominant cardinal bank neighbor, ties by list order.
    const counts = new Map<number, number>();
    for (const [dx, dy] of CARDINALS) {
      const mm = readLayer(g, "mat", x + dx, y + dy);
      if (mm === OUTSIDE) continue;
      if (t.wetBanks.includes(mm)) {
        counts.set(mm, (counts.get(mm) ?? 0) + 1);
      }
    }
    let best = -1;
    let bestCount = 0;
    for (const mm of t.wetBanks) {
      const count = counts.get(mm) ?? 0;
      if (count > bestCount) {
        bestCount = count;
        best = mm;
      }
    }
    return best >= 0 ? asUnderlay(best) : { family: "soil", mask: 0 };
  }

  // Land path: 8-scan of strictly-lower, non-gutter neighbors; cardinals
  // count double; ties to lower priority, then lower id.
  const counts = new Map<number, number>();
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const mm = readLayer(g, "mat", x + dx, y + dy);
      if (mm === OUTSIDE || mm === m) continue;
      if (t.wet.has(mm)) continue;
      if ((t.matPriority[mm] as number) >= (t.matPriority[m] as number)) continue;
      if (t.gutterPairs.has(materialPairKey(mm, m))) continue;
      counts.set(mm, (counts.get(mm) ?? 0) + (dx === 0 || dy === 0 ? 2 : 1));
    }
  }
  // Open-side rule: the fringe only shows through open cardinal sides — if
  // any qualifying cardinal neighbor is unconnected per §2.5, the winner is
  // the HIGHEST-priority such material (ties: bigger 8-scan count, lower id).
  const openMaterials = new Set<number>();
  for (const [dx, dy] of CARDINALS) {
    const mm = readLayer(g, "mat", x + dx, y + dy);
    if (mm === OUTSIDE || mm === m) continue;
    if (t.wet.has(mm)) continue;
    if ((t.matPriority[mm] as number) >= (t.matPriority[m] as number)) continue;
    if (t.gutterPairs.has(materialPairKey(mm, m))) continue;
    if (connectedAt(t, g, m, x + dx, y + dy)) continue;
    openMaterials.add(mm);
  }
  if (openMaterials.size > 0) {
    let best = -1;
    let bestCount = 0;
    for (const mm of openMaterials) {
      const count = counts.get(mm) ?? 0;
      if (
        best < 0 ||
        (t.matPriority[mm] as number) > (t.matPriority[best] as number) ||
        ((t.matPriority[mm] as number) === (t.matPriority[best] as number) &&
          (count > bestCount || (count === bestCount && mm < best)))
      ) {
        best = mm;
        bestCount = count;
      }
    }
    return asUnderlay(best);
  }
  // Diagonal-only contact keeps the unrestricted count (the corner notch).
  let best = -1;
  let bestCount = 0;
  for (const [mm, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount &&
        best >= 0 &&
        ((t.matPriority[mm] as number) < (t.matPriority[best] as number) ||
          ((t.matPriority[mm] as number) === (t.matPriority[best] as number) && mm < best)))
    ) {
      bestCount = count;
      best = mm;
    }
  }
  return best >= 0 ? asUnderlay(best) : { family: "soil", mask: 0 };
}

/**
 * §2.7 sand field membership: sand itself; or a cell with a cardinal
 * true-sand neighbor that is either wet (beaches run into the waves) or
 * higher-priority land (the field extends one cell under the lap).
 * Out-of-world is never sand.
 */
export function inSandField(t: ResolutionTables, g: GridWindow, x: number, y: number): boolean {
  const m = readLayer(g, "mat", x, y);
  if (m === OUTSIDE) return false;
  if (m === t.sandId) return true;
  let nearSand = false;
  for (const [dx, dy] of CARDINALS) {
    if (readLayer(g, "mat", x + dx, y + dy) === t.sandId) {
      nearSand = true;
      break;
    }
  }
  if (!nearSand) return false;
  if (t.wet.has(m)) return true;
  return (t.matPriority[m] as number) > (t.matPriority[t.sandId] as number);
}

/** §2.7 corner16 mask at dual point (x, y): TL=1 TR=2 BR=4 BL=8. */
export function sandCornerMask(t: ResolutionTables, g: GridWindow, x: number, y: number): number {
  let mask = 0;
  if (inSandField(t, g, x, y)) mask |= 1;
  if (inSandField(t, g, x + 1, y)) mask |= 2;
  if (inSandField(t, g, x + 1, y + 1)) mask |= 4;
  if (inSandField(t, g, x, y + 1)) mask |= 8;
  return mask;
}

export type NetworkLayerName = "road" | "pier" | "fence" | "wall" | "river";

/**
 * §2.8 net16 port mask: N=1 E=2 S=4 W=8 from the network's own layer (all
 * types of one layer inter-connect); out-of-world does NOT connect. River
 * also counts water-group material cells; wall also counts gate-structure
 * cells (the gate id and its state siblings).
 */
export function networkMask(
  t: ResolutionTables,
  g: GridWindow,
  layer: NetworkLayerName,
  x: number,
  y: number,
): number {
  const bits = [1, 2, 4, 8];
  const dirs: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  let mask = 0;
  for (let i = 0; i < 4; i += 1) {
    const [dx, dy] = dirs[i] as readonly [number, number];
    const nx = x + dx;
    const ny = y + dy;
    const value = readLayer(g, layer, nx, ny);
    if (value === OUTSIDE) continue;
    let connected = value !== 0;
    if (!connected && layer === "river") {
      connected = t.waterGroup.has(readLayer(g, "mat", nx, ny));
    }
    if (!connected && layer === "wall") {
      const meta = readLayer(g, "meta", nx, ny);
      connected = meta !== 0 && t.gateStructureIds.has(meta >> 8);
    }
    if (connected) {
      mask |= bits[i] as number;
    }
  }
  return mask;
}

/** §2.8 ground overlays (moss, tall grass): any flagged neighbor connects; out-of-world connects. */
export function overlayMask(g: GridWindow, layer: "moss" | "tall", x: number, y: number): number {
  let mask = 0;
  for (const [bit, dx, dy] of BLOB_BITS) {
    const value = readLayer(g, layer, x + dx, y + dy);
    if (value === OUTSIDE || value !== 0) {
      mask |= bit;
    }
  }
  return normalizeBlobMask(mask);
}

/** §2.8 decals: a neighbor connects only with the SAME decal id; out-of-world connects. */
export function decalMask(g: GridWindow, x: number, y: number, id: number): number {
  let mask = 0;
  for (const [bit, dx, dy] of BLOB_BITS) {
    const value = readLayer(g, "decal", x + dx, y + dy);
    if (value === OUTSIDE || value === id) {
      mask |= bit;
    }
  }
  return normalizeBlobMask(mask);
}

/** §2.8 cliffs: neighbors with elevation >= this cell connect; out-of-world connects. */
export function cliffMask(g: GridWindow, x: number, y: number): number {
  const own = readLayer(g, "elev", x, y);
  let mask = 0;
  for (const [bit, dx, dy] of BLOB_BITS) {
    const neighbor = readLayer(g, "elev", x + dx, y + dy);
    if (neighbor === OUTSIDE || neighbor >= own) {
      mask |= bit;
    }
  }
  return normalizeBlobMask(mask);
}

/** The derived resolution-level output for a target rect (world coords). */
export interface ResolvedLayers {
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
  /** Cell layers, row-major w*h; "" = nothing placed, else "family:mask". */
  readonly cells: Readonly<Record<ResolvedCellLayerName, readonly string[]>>;
  /**
   * Sand dual grid, (w+1)*(h+1), row-major, anchored at dual point
   * (x0-1, y0-1) (§2.7: dual points run from -1).
   */
  readonly sand: readonly string[];
}

export type ResolvedCellLayerName =
  | "underlay"
  | "terrain"
  | "moss"
  | "tallgrass"
  | "crops"
  | "river"
  | "cliff"
  | "ramps"
  | "pier"
  | "road"
  | "fence"
  | "decals"
  | "wall"
  | "structures"
  | "props"
  | "propsOverhang";

export const RESOLVED_CELL_LAYERS: readonly ResolvedCellLayerName[] = [
  "underlay", "terrain", "moss", "tallgrass", "crops", "river", "cliff",
  "ramps", "pier", "road", "fence", "decals", "wall", "structures", "props",
  "propsOverhang",
];

function place(family: string, mask: number): string {
  return `${family}:${mask}`;
}

/**
 * Derives every §2 resolution layer for the rect [x0, x0+w) x [y0, y0+h).
 * The window must cover the rect plus a 2-cell halo (clamped to world edges):
 * one cell for every 8-neighborhood rule and a second for the sand field
 * feeding the dual grid.
 */
export function resolveLayers(
  t: ResolutionTables,
  g: GridWindow,
  x0: number,
  y0: number,
  w: number,
  h: number,
): ResolvedLayers {
  const cells = {} as Record<ResolvedCellLayerName, string[]>;
  for (const name of RESOLVED_CELL_LAYERS) {
    cells[name] = new Array<string>(w * h).fill("");
  }
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const at = (y - y0) * w + (x - x0);
      const m = readLayer(g, "mat", x, y);

      const underlay = underlayAt(t, g, x, y);
      cells.underlay[at] = place(underlay.family, underlay.mask);

      // §2.3: seamless floors and soil render underlay-only; sand renders
      // through the dual grid; everything else is a blob47 terrain tile.
      if (m !== t.sandId && !t.seamlessFloors.has(m)) {
        cells.terrain[at] = place(t.materialFamilyById[m] as string, blobMask(t, g, x, y, m));
      }

      if (readLayer(g, "moss", x, y) !== 0) {
        cells.moss[at] = place("moss", overlayMask(g, "moss", x, y));
      }
      if (readLayer(g, "tall", x, y) !== 0) {
        cells.tallgrass[at] = place("tallgrass", overlayMask(g, "tall", x, y));
      }
      const crop = readLayer(g, "crop", x, y);
      if (crop !== 0) {
        cells.crops[at] = place("crop", crop);
      }
      if (readLayer(g, "river", x, y) !== 0) {
        cells.river[at] = place("river", networkMask(t, g, "river", x, y));
      }
      const elev = readLayer(g, "elev", x, y);
      if (elev > 0) {
        const group = t.cliffGroupByMaterial[m] ?? "";
        cells.cliff[at] = place(t.cliffFamilyByGroup.get(group) as string, cliffMask(g, x, y));
      }
      const ramp = readLayer(g, "ramp", x, y);
      if (ramp !== 0) {
        const group = t.cliffGroupByMaterial[m] ?? "";
        cells.ramps[at] = place(t.rampFamilyByGroup.get(group) as string, ramp);
      }
      const pier = readLayer(g, "pier", x, y);
      if (pier !== 0) {
        cells.pier[at] = place(t.pierFamilyByType[pier] as string, networkMask(t, g, "pier", x, y));
      }
      const road = readLayer(g, "road", x, y);
      if (road !== 0) {
        cells.road[at] = place(t.roadFamilyByType[road] as string, networkMask(t, g, "road", x, y));
      }
      const fence = readLayer(g, "fence", x, y);
      if (fence !== 0) {
        cells.fence[at] = place(t.fenceFamilyByType[fence] as string, networkMask(t, g, "fence", x, y));
      }
      const decal = readLayer(g, "decal", x, y);
      if (decal !== 0) {
        cells.decals[at] = place(t.decalFamilyById[decal] as string, decalMask(g, x, y, decal));
      }
      const wall = readLayer(g, "wall", x, y);
      if (wall !== 0) {
        cells.wall[at] = place(t.wallFamilyByType[wall] as string, networkMask(t, g, "wall", x, y));
      }
      const meta = readLayer(g, "meta", x, y);
      if (meta !== 0) {
        cells.structures[at] = place("meta", meta);
      }
      const prop = readLayer(g, "prop", x, y);
      if (prop !== 0) {
        cells.props[at] = place("prop", prop * 10);
      }
      // §2.10: the `_over` part of the prop one cell BELOW renders here.
      const below = readLayer(g, "prop", x, y + 1);
      if (below !== 0 && below !== OUTSIDE && t.propOverhangTypes.has(below)) {
        cells.propsOverhang[at] = place("prop", below * 10 + 1);
      }
    }
  }

  // §2.7 sand dual grid over [x0-1, x0+w) x [y0-1, y0+h).
  const sand = new Array<string>((w + 1) * (h + 1)).fill("");
  for (let y = y0 - 1; y < y0 + h; y += 1) {
    for (let x = x0 - 1; x < x0 + w; x += 1) {
      const mask = sandCornerMask(t, g, x, y);
      if (mask > 0) {
        sand[(y - (y0 - 1)) * (w + 1) + (x - (x0 - 1))] = place("sand", mask);
      }
    }
  }

  return { x0, y0, w, h, cells, sand };
}
