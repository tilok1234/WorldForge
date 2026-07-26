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
}

export interface TileForgeManifest {
  readonly formatVersion: number;
  readonly generator: string;
  readonly tileSize: number;
  /** family key -> material grid id. */
  readonly materialIdByKey: ReadonlyMap<string, number>;
  /** structure name -> {id, def}. */
  readonly structureByName: ReadonlyMap<string, { readonly id: number; readonly def: StructureDef }>;
  /** decal family key -> decal id. */
  readonly decalIdByKey: ReadonlyMap<string, number>;
  /** road family key -> road layer byte. */
  readonly roadTypeByKey: ReadonlyMap<string, number>;
  /** wall family key -> wall layer byte. */
  readonly wallTypeByKey: ReadonlyMap<string, number>;
  readonly materialCount: number;
  readonly structureCount: number;
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
    };
  };
  if (raw.formatVersion !== 1) {
    throw new Error(`unsupported manifest formatVersion ${raw.formatVersion}`);
  }

  const materialIdByKey = new Map<string, number>();
  for (const [id, key] of Object.entries(raw.mappings.materials)) {
    materialIdByKey.set(key, Number(id));
  }
  const structureByName = new Map<string, { id: number; def: StructureDef }>();
  for (const [id, def] of Object.entries(raw.mappings.structures)) {
    structureByName.set(def.name, { id: Number(id), def });
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

  cached = {
    lock,
    manifest: {
      formatVersion: raw.formatVersion,
      generator: raw.generator,
      tileSize: raw.tileSize,
      materialIdByKey,
      structureByName,
      decalIdByKey,
      roadTypeByKey,
      wallTypeByKey,
      materialCount: Object.keys(raw.mappings.materials).length,
      structureCount: Object.keys(raw.mappings.structures).length,
    },
  };
  return cached;
}
