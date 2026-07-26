/**
 * Output path guard (docs/REPOSITORY_BOUNDARIES.md, "Path safety").
 *
 * Every generation destination must resolve inside a WorldForge-owned root:
 * `<repo>/outputs`, `<repo>/tmp`, or the operating system's temporary
 * directory. Everything else is rejected — most importantly anything that
 * resolves into TileForge, another git repository, or a registered read-only
 * upstream path. Symlinks and junctions are resolved before checking, so a
 * link inside an allowed root cannot smuggle writes elsewhere.
 */

import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, parse, resolve, sep } from "node:path";

export interface GuardOptions {
  /** Absolute path of the WorldForge repository root. */
  readonly worldforgeRoot: string;
  /** Additional forbidden roots, e.g. the registered TileForge checkout. */
  readonly forbiddenRoots?: readonly string[];
}

export interface GuardResult {
  readonly allowed: boolean;
  /** Fully resolved destination (symlinks/junctions followed). */
  readonly resolvedPath: string;
  readonly reason: string;
}

const UNRESOLVED_ENV_PATTERN = /%[^%\\/]+%|\$/;

export function guardOutputRoot(requested: string, options: GuardOptions): GuardResult {
  if (requested.trim() === "") {
    return { allowed: false, resolvedPath: "", reason: "empty output path" };
  }
  if (UNRESOLVED_ENV_PATTERN.test(requested)) {
    return {
      allowed: false,
      resolvedPath: requested,
      reason: "path contains unresolved environment-variable syntax",
    };
  }

  let real: string;
  let worldforgeRoot: string;
  try {
    real = resolveThroughLinks(resolve(requested));
    worldforgeRoot = realpathSync(options.worldforgeRoot);
  } catch (error) {
    return {
      allowed: false,
      resolvedPath: requested,
      reason: `path could not be resolved: ${String(error)}`,
    };
  }

  if (samePath(parse(real).root, real)) {
    return { allowed: false, resolvedPath: real, reason: "a filesystem root cannot be an output destination" };
  }
  if (samePath(safeRealpath(homedir()), real)) {
    return { allowed: false, resolvedPath: real, reason: "the home directory cannot be an output destination" };
  }
  for (const forbidden of options.forbiddenRoots ?? []) {
    const forbiddenReal = safeRealpath(resolve(forbidden));
    if (samePath(forbiddenReal, real) || isInside(forbiddenReal, real)) {
      return {
        allowed: false,
        resolvedPath: real,
        reason: "destination is inside a registered read-only upstream repository",
      };
    }
  }
  if (samePath(worldforgeRoot, real)) {
    return { allowed: false, resolvedPath: real, reason: "the WorldForge repository root is not an output root" };
  }
  const externalRoot = join(worldforgeRoot, "external");
  if (samePath(externalRoot, real) || isInside(externalRoot, real)) {
    return {
      allowed: false,
      resolvedPath: real,
      reason: "external/ holds read-only upstream reference copies",
    };
  }

  // Repository-internal destinations are only valid inside the repository's
  // own output roots — checked before the general allowlist so the rule holds
  // even when the repository itself sits under a broader allowed root.
  const repoOutputRoots = [join(worldforgeRoot, "outputs"), join(worldforgeRoot, "tmp")];
  if (
    isInside(worldforgeRoot, real) &&
    !repoOutputRoots.some((root) => samePath(root, real) || isInside(root, real))
  ) {
    return {
      allowed: false,
      resolvedPath: real,
      reason: "inside the WorldForge repository but outside its output roots (use outputs/)",
    };
  }

  const allowedRoots = [...repoOutputRoots, safeRealpath(tmpdir())];
  const containingRoot = allowedRoots.find(
    (root) => samePath(root, real) || isInside(root, real),
  );
  if (containingRoot === undefined) {
    return { allowed: false, resolvedPath: real, reason: "outside every WorldForge-owned output root" };
  }

  // Within the allowed root, still refuse to write into an upstream package,
  // checkout, or foreign git repository that happens to live (or be linked)
  // beneath it.
  const upstreamHit = findUpstreamMarker(real, containingRoot);
  if (upstreamHit !== null) {
    return { allowed: false, resolvedPath: real, reason: upstreamHit };
  }
  const containedHit = findUpstreamChild(real);
  if (containedHit !== null) {
    return { allowed: false, resolvedPath: real, reason: containedHit };
  }

  return { allowed: true, resolvedPath: real, reason: "inside a WorldForge-owned output root" };
}

/** Resolve the deepest existing ancestor through links, then reattach the rest. */
function resolveThroughLinks(absolute: string): string {
  let anchor = absolute;
  const pending: string[] = [];
  while (!existsSync(anchor)) {
    const parent = dirname(anchor);
    if (parent === anchor) {
      break;
    }
    const segment = anchor.slice(parent.length);
    pending.unshift(segment.startsWith(sep) ? segment.slice(sep.length) : segment);
    anchor = parent;
  }
  const realAnchor = existsSync(anchor) ? realpathSync(anchor) : anchor;
  return pending.length === 0 ? realAnchor : join(realAnchor, ...pending);
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function normalizeForCompare(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function samePath(a: string, b: string): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

function isInside(parent: string, child: string): boolean {
  const parentNorm = normalizeForCompare(parent);
  const childNorm = normalizeForCompare(child);
  return childNorm.startsWith(parentNorm + "\\") || childNorm.startsWith(parentNorm + "/");
}

/**
 * Walk from the destination's deepest existing directory up to (but not
 * including) the containing allowed root, refusing TileForge markers and any
 * git repository found on the way.
 */
function findUpstreamMarker(real: string, stopExclusive: string): string | null {
  let dir = real;
  while (!existsSync(dir) || !isDirectory(dir)) {
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
  while (isInside(stopExclusive, dir)) {
    if (hasTileForgeMarkers(dir)) {
      return "destination resolves into a TileForge package or checkout";
    }
    if (existsSync(join(dir, ".git"))) {
      return "destination resolves into a git repository";
    }
    dir = dirname(dir);
  }
  return null;
}

/** Refuse a destination whose immediate children include an upstream checkout. */
function findUpstreamChild(real: string): string | null {
  if (!existsSync(real) || !isDirectory(real)) {
    return null;
  }
  let children: string[];
  try {
    children = readdirSync(real);
  } catch {
    return null;
  }
  for (const child of children) {
    const childPath = join(real, child);
    if (isDirectory(childPath) && hasTileForgeMarkers(childPath)) {
      return "destination directly contains a TileForge package or checkout";
    }
  }
  return null;
}

function hasTileForgeMarkers(dir: string): boolean {
  if (existsSync(join(dir, "tileforge-manifest.json"))) {
    return true;
  }
  return existsSync(join(dir, "GAME-GUIDE.md")) && existsSync(join(dir, "FORMATS.md"));
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
