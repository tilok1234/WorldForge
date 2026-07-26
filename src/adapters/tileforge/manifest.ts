/**
 * Pinned-package manifest access (docs/ARCHITECTURE_AND_CONTRACTS.md,
 * component 11). Reads the committed fixture named by tileforge.lock.json,
 * verifies the manifest hash against the lock, and exposes the machine-
 * readable mappings. Nothing here invents ids: every table comes from the
 * package (docs/AGENTS.md, source-of-truth discipline).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { sha256HexBytes } from "../../core/identity.js";
import { LOCK_FILE_NAME, type TileForgeLock } from "../../package/importPackage.js";

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));

export interface StructureDef {
  readonly w: number;
  readonly h: number;
  readonly name: string;
  readonly pass?: readonly number[];
  /** State siblings carry the base structure id (e.g. gate_ruined -> 7). */
  readonly base?: number;
  readonly state?: string;
}

/** One atlas tile entry of a family (mask carries the layer code). */
export interface FamilyTile {
  readonly mask: number;
  readonly variant: number;
  readonly frame: number;
  readonly atlasX: number;
  readonly atlasY: number;
}

export interface FamilyInfo {
  readonly key: string;
  readonly kind: string;
  /** Atlas image filename as shipped (e.g. "grass_on_soil.png"). */
  readonly imageFile: string;
  /** Atlas image basename without extension (tmj tileset sources match it). */
  readonly imageBase: string;
  readonly variants: number;
  readonly frames: number;
  readonly maskCount: number;
  readonly atlasColumns: number;
  readonly atlasPadding: number;
  readonly tiles: readonly FamilyTile[];
}

/** mappings.transitions — pair sets are stored symmetrically. */
export interface TransitionTables {
  /** material id -> ladder priority (wet materials sit at the top). */
  readonly matPriority: readonly number[];
  readonly flushPairs: ReadonlySet<number>;
  readonly gutterPairs: ReadonlySet<number>;
}

/** Symmetric pair key for transition sets (material ids are < 64). */
export function materialPairKey(a: number, b: number): number {
  return a * 64 + b;
}

export interface CliffBiomes {
  /** reskin group key ("" default, "sand", "snow", "volc") per material id. */
  readonly groupByMaterial: readonly string[];
  readonly cliffFamilyByGroup: ReadonlyMap<string, string>;
  readonly rampFamilyByGroup: ReadonlyMap<string, string>;
}

export interface TileForgeManifest {
  readonly formatVersion: number;
  readonly generator: string;
  readonly tileSize: number;
  /** family key -> material grid id. */
  readonly materialIdByKey: ReadonlyMap<string, number>;
  /** structure name -> {id, def}. */
  readonly structureByName: ReadonlyMap<string, { readonly id: number; readonly def: StructureDef }>;
  /** structure id -> def (state siblings keep their base reference). */
  readonly structureById: ReadonlyMap<number, StructureDef>;
  /** decal family key -> decal id. */
  readonly decalIdByKey: ReadonlyMap<string, number>;
  /** road family key -> road layer byte. */
  readonly roadTypeByKey: ReadonlyMap<string, number>;
  /** wall family key -> wall layer byte. */
  readonly wallTypeByKey: ReadonlyMap<string, number>;
  /** material grid id -> family key (dense, index by id). */
  readonly materialFamilyById: readonly string[];
  /** decal id -> family key (sparse array, index by id). */
  readonly decalFamilyById: readonly string[];
  /** layer byte -> family key, per typed network layer. */
  readonly roadFamilyByType: readonly string[];
  readonly pierFamilyByType: readonly string[];
  readonly fenceFamilyByType: readonly string[];
  readonly wallFamilyByType: readonly string[];
  /** ramp layer byte = type*8 + dir; rampTypes: type -> base family name. */
  readonly rampTypeByByte: readonly string[];
  readonly cliffBiomes: CliffBiomes;
  readonly transitions: TransitionTables;
  /** gate structure id plus every state sibling with that base (§2.8 wall rule). */
  readonly gateStructureIds: ReadonlySet<number>;
  readonly families: ReadonlyMap<string, FamilyInfo>;
  readonly materialCount: number;
  readonly structureCount: number;
}

interface RawFamily {
  kind: string;
  image: string;
  variants: number;
  frames: number;
  maskCount: number;
  atlas: { width: number; height: number; columns: number; padding: number };
  tiles: { mask: number; variant: number; frame: number; atlas: [number, number] }[];
}

let cached: { lock: TileForgeLock; manifest: TileForgeManifest } | null = null;

export function loadPinnedManifest(): { lock: TileForgeLock; manifest: TileForgeManifest } {
  if (cached !== null) {
    return cached;
  }
  const lock = JSON.parse(readFileSync(join(ROOT, LOCK_FILE_NAME), "utf8")) as TileForgeLock;
  const manifestPath = join(ROOT, ...lock.packagePath.split("/"), "tileforge-manifest.json");
  const bytes = readFileSync(manifestPath);
  if (sha256HexBytes(bytes) !== lock.manifestSha256) {
    throw new Error(
      "pinned manifest hash mismatch: the fixture no longer matches tileforge.lock.json",
    );
  }
  const raw = JSON.parse(bytes.toString("utf8")) as {
    formatVersion: number;
    generator: string;
    tileSize: number;
    mappings: {
      materials: Record<string, string>;
      structures: Record<string, StructureDef>;
      decals: Record<string, string>;
      roadTypes: Record<string, string>;
      wallTypes: Record<string, string>;
      pierTypes: Record<string, string>;
      fenceTypes: Record<string, string>;
      rampTypes: Record<string, string>;
      cliffBiomes: {
        families: Record<string, string>;
        rampFamilies: Record<string, string>;
        materials: Record<string, number[]>;
      };
      transitions: {
        matPriority: Record<string, number>;
        flushPairs: [number, number][];
        gutterPairs: [number, number][];
      };
    };
    families: Record<string, RawFamily>;
  };
  if (raw.formatVersion !== 1) {
    throw new Error(`unsupported manifest formatVersion ${raw.formatVersion}`);
  }

  const materialIdByKey = new Map<string, number>();
  for (const [id, key] of Object.entries(raw.mappings.materials)) {
    materialIdByKey.set(key, Number(id));
  }
  const structureByName = new Map<string, { id: number; def: StructureDef }>();
  const structureById = new Map<number, StructureDef>();
  for (const [id, def] of Object.entries(raw.mappings.structures)) {
    structureByName.set(def.name, { id: Number(id), def });
    structureById.set(Number(id), def);
  }
  const decalIdByKey = new Map<string, number>();
  for (const [id, key] of Object.entries(raw.mappings.decals)) {
    decalIdByKey.set(key, Number(id));
  }
  const roadTypeByKey = new Map<string, number>();
  for (const [id, key] of Object.entries(raw.mappings.roadTypes)) {
    roadTypeByKey.set(key, Number(id));
  }
  const wallTypeByKey = new Map<string, number>();
  for (const [id, key] of Object.entries(raw.mappings.wallTypes)) {
    wallTypeByKey.set(key, Number(id));
  }

  const denseByIdTable = (table: Record<string, string>): string[] => {
    const out: string[] = [];
    for (const [id, key] of Object.entries(table)) {
      out[Number(id)] = key;
    }
    return out;
  };
  const materialFamilyById = denseByIdTable(raw.mappings.materials);
  const decalFamilyById = denseByIdTable(raw.mappings.decals);
  const roadFamilyByType = denseByIdTable(raw.mappings.roadTypes);
  const pierFamilyByType = denseByIdTable(raw.mappings.pierTypes);
  const fenceFamilyByType = denseByIdTable(raw.mappings.fenceTypes);
  const wallFamilyByType = denseByIdTable(raw.mappings.wallTypes);
  const rampTypeByByte = denseByIdTable(raw.mappings.rampTypes);

  const groupByMaterial: string[] = new Array<string>(materialFamilyById.length).fill("");
  for (const [group, ids] of Object.entries(raw.mappings.cliffBiomes.materials)) {
    for (const id of ids) {
      groupByMaterial[id] = group;
    }
  }
  const cliffBiomes: CliffBiomes = {
    groupByMaterial,
    cliffFamilyByGroup: new Map(Object.entries(raw.mappings.cliffBiomes.families)),
    rampFamilyByGroup: new Map(Object.entries(raw.mappings.cliffBiomes.rampFamilies)),
  };

  const matPriority: number[] = new Array<number>(materialFamilyById.length).fill(0);
  for (const [id, priority] of Object.entries(raw.mappings.transitions.matPriority)) {
    matPriority[Number(id)] = priority;
  }
  const symmetricSet = (pairs: [number, number][]): Set<number> => {
    const set = new Set<number>();
    for (const [a, b] of pairs) {
      set.add(materialPairKey(a, b));
      set.add(materialPairKey(b, a));
    }
    return set;
  };
  const transitions: TransitionTables = {
    matPriority,
    flushPairs: symmetricSet(raw.mappings.transitions.flushPairs),
    gutterPairs: symmetricSet(raw.mappings.transitions.gutterPairs),
  };

  const gateEntry = structureByName.get("gate");
  const gateStructureIds = new Set<number>();
  if (gateEntry !== undefined) {
    gateStructureIds.add(gateEntry.id);
    for (const [id, def] of structureById) {
      if (def.base === gateEntry.id) {
        gateStructureIds.add(id);
      }
    }
  }

  const families = new Map<string, FamilyInfo>();
  for (const [key, fam] of Object.entries(raw.families)) {
    families.set(key, {
      key,
      kind: fam.kind,
      imageFile: fam.image,
      imageBase: fam.image.replace(/\.[^.]+$/, ""),
      variants: fam.variants,
      frames: fam.frames,
      maskCount: fam.maskCount,
      atlasColumns: fam.atlas.columns,
      atlasPadding: fam.atlas.padding,
      tiles: fam.tiles.map((tile) => ({
        mask: tile.mask,
        variant: tile.variant,
        frame: tile.frame,
        atlasX: tile.atlas[0],
        atlasY: tile.atlas[1],
      })),
    });
  }

  cached = {
    lock,
    manifest: {
      formatVersion: raw.formatVersion,
      generator: raw.generator,
      tileSize: raw.tileSize,
      materialIdByKey,
      structureByName,
      structureById,
      decalIdByKey,
      roadTypeByKey,
      wallTypeByKey,
      materialFamilyById,
      decalFamilyById,
      roadFamilyByType,
      pierFamilyByType,
      fenceFamilyByType,
      wallFamilyByType,
      rampTypeByByte,
      cliffBiomes,
      transitions,
      gateStructureIds,
      families,
      materialCount: Object.keys(raw.mappings.materials).length,
      structureCount: Object.keys(raw.mappings.structures).length,
    },
  };
  return cached;
}
