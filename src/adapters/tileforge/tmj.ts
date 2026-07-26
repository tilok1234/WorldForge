/**
 * Shared Tiled-map (tmj) plumbing for the TileForge adapter: the document
 * shape we read and author, and access to the pinned package's own map.tmj
 * (its tilesets block is data, not spec — §2.13 trap 1 — so authored maps
 * copy it verbatim).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadPinnedManifest } from "./manifest.js";

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));

export interface TmjLayer {
  readonly name: string;
  readonly type: string;
  readonly data?: readonly number[];
  readonly [key: string]: unknown;
}

export interface TmjDocument {
  readonly width: number;
  readonly height: number;
  readonly layers: readonly TmjLayer[];
  readonly tilesets: readonly { readonly firstgid: number; readonly source: string }[];
  readonly [key: string]: unknown;
}

/** Absolute path of the pinned package fixture directory. */
export function pinnedPackageDir(): string {
  const { lock } = loadPinnedManifest();
  return join(ROOT, ...lock.packagePath.split("/"));
}

export function loadPackageTmj(): TmjDocument {
  return JSON.parse(
    readFileSync(join(pinnedPackageDir(), "map.tmj"), "utf8"),
  ) as TmjDocument;
}
