/**
 * Explicit TileForge package import (docs/REPOSITORY_BOUNDARIES.md,
 * "Artifact-only dependency"). Reads a user-selected release zip, runs the
 * preflight (structure, secrets, VCS metadata, size limits, manifest
 * validation), extracts into fixtures/tileforge-packages/<package-id>/, and
 * writes the dependency lock. Refuses to overwrite an existing package or
 * lock: upgrades are a deliberate compatibility event.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { canonicalJson } from "../core/canonicalJson.js";
import { sha256Hex, sha256HexBytes } from "../core/identity.js";
import { readZipEntries, type ZipEntry } from "./zip.js";

export const LOCK_FILE_NAME = "tileforge.lock.json";
export const PACKAGES_ROOT = ["fixtures", "tileforge-packages"] as const;

const REQUIRED_FILES = ["tileforge-manifest.json", "GAME-GUIDE.md", "FORMATS.md"];
const MAX_FILE_BYTES = 95_000_000; // below GitHub's 100 MB hard limit
const WARN_FILE_BYTES = 45_000_000;
const MAX_TOTAL_BYTES = 500_000_000;

const VCS_SEGMENTS = new Set([".git", ".svn", ".hg"]);
const EXCLUDED_BASENAMES = new Set([
  ".gitignore",
  ".gitattributes",
  ".gitmodules",
  ".DS_Store",
  "Thumbs.db",
]);
const SECRET_NAME_PATTERNS = [
  /(^|\/)\.env($|\.)/i,
  /\.(pem|p12|pfx|key)$/i,
  /id_(rsa|dsa|ecdsa|ed25519)/i,
  /(^|\/)(credentials?|secrets?)\.(json|ya?ml|txt|ini)$/i,
];
const SECRET_CONTENT_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{36}\b/,
];
const TEXT_EXTENSIONS = new Set([
  ".json", ".md", ".txt", ".js", ".gd", ".cs", ".tsj", ".tmj", ".cfg", ".ini", ".yaml", ".yml",
]);

export interface ImportOptions {
  readonly zipPath: string;
  readonly worldforgeRoot: string;
  readonly packageId?: string;
  readonly sourceLabel?: string;
}

export interface ImportResult {
  readonly packageId: string;
  readonly packageDir: string;
  readonly lockPath: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly warnings: readonly string[];
  readonly lock: TileForgeLock;
}

export interface TileForgeLock {
  readonly lockFormat: 1;
  readonly provider: "TileForge";
  readonly generator: string;
  readonly manifestFormat: number;
  readonly theme: string;
  readonly sourceCommit: string | null;
  readonly projectSeed: number | null;
  readonly tileSize: number | null;
  readonly packageId: string;
  readonly packagePath: string;
  readonly strippedRoot: string | null;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly packageSha256: string;
  readonly manifestSha256: string;
  readonly contentSha256: string;
  readonly importedAt: string;
  readonly sourceLabel: string;
  readonly excluded: readonly string[];
}

export function importTileForgePackage(options: ImportOptions): ImportResult {
  const warnings: string[] = [];
  const zipBytes = readFileSync(options.zipPath);
  const packageSha256 = sha256HexBytes(zipBytes);
  const entries = readZipEntries(zipBytes);

  const files = preflightEntries(entries, warnings);
  const strippedRoot = detectSharedRoot(files.map((file) => file.name));
  const stripPrefix = strippedRoot === null ? "" : `${strippedRoot}/`;
  const relPathOf = (entry: ZipEntry): string => entry.name.slice(stripPrefix.length);

  const present = new Set(files.map(relPathOf));
  for (const required of REQUIRED_FILES) {
    if (!present.has(required)) {
      throw new Error(`package is missing required file "${required}"`);
    }
  }
  if (!present.has("README.txt")) {
    warnings.push("package has no README.txt");
  }

  const manifestEntry = files.find((file) => relPathOf(file) === "tileforge-manifest.json");
  if (manifestEntry === undefined) {
    throw new Error('package is missing required file "tileforge-manifest.json"');
  }
  const manifestBytes = manifestEntry.read();
  const manifest = parseManifest(manifestBytes);

  const packageId = sanitizePackageId(
    options.packageId ??
      `${manifest.generator}-${manifest.theme}-${manifest.sourceCommit ?? "no-commit"}`,
  );
  const worldforgeRoot = resolve(options.worldforgeRoot);
  const packagesRoot = join(worldforgeRoot, ...PACKAGES_ROOT);
  const packageDir = resolve(join(packagesRoot, packageId));
  if (!isInside(packagesRoot, packageDir)) {
    throw new Error(`package id "${packageId}" escapes fixtures/tileforge-packages/`);
  }
  if (existsSync(packageDir)) {
    throw new Error(
      `${packageDir} already exists; never overwrite a pinned package (docs/REPOSITORY_BOUNDARIES.md)`,
    );
  }
  const lockPath = join(worldforgeRoot, LOCK_FILE_NAME);
  if (existsSync(lockPath)) {
    throw new Error(
      `${LOCK_FILE_NAME} already exists; a TileForge upgrade is a deliberate compatibility event (docs/REPOSITORY_BOUNDARIES.md)`,
    );
  }

  // Extract, hashing every file for the content identity as we go.
  const hashLines: string[] = [];
  let totalBytes = 0;
  const sortedFiles = [...files].sort((a, b) => (relPathOf(a) < relPathOf(b) ? -1 : 1));
  for (const file of sortedFiles) {
    const rel = relPathOf(file);
    const data = file.read();
    totalBytes += data.length;
    const target = resolve(join(packageDir, rel));
    if (!isInside(packageDir, target)) {
      throw new Error(`entry "${file.name}" escapes the package directory`);
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    hashLines.push(`${rel}\n${sha256HexBytes(data)}\n`);
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error(`package extracts to ${totalBytes} bytes, over the ${MAX_TOTAL_BYTES} limit`);
  }

  const lock: TileForgeLock = {
    lockFormat: 1,
    provider: "TileForge",
    generator: manifest.generator,
    manifestFormat: manifest.formatVersion,
    theme: manifest.theme,
    sourceCommit: manifest.sourceCommit,
    projectSeed: manifest.projectSeed,
    tileSize: manifest.tileSize,
    packageId,
    packagePath: [...PACKAGES_ROOT, packageId].join("/"),
    strippedRoot,
    fileCount: sortedFiles.length,
    totalBytes,
    packageSha256,
    manifestSha256: sha256HexBytes(manifestBytes),
    contentSha256: sha256Hex(hashLines.join("")),
    importedAt: new Date().toISOString(),
    sourceLabel: options.sourceLabel ?? basename(options.zipPath),
    excluded: entries
      .filter((entry) => !entry.isDirectory && !files.includes(entry))
      .map((entry) => entry.name),
  };
  writeFileSync(lockPath, canonicalJson(lock), { encoding: "utf8" });

  return {
    packageId,
    packageDir,
    lockPath,
    fileCount: lock.fileCount,
    totalBytes,
    warnings,
    lock,
  };
}

export interface VerifyResult {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/** Recompute the committed fixture's identity and compare it with the lock. */
export function verifyTileForgePackage(worldforgeRoot: string): VerifyResult {
  const problems: string[] = [];
  const lockPath = join(resolve(worldforgeRoot), LOCK_FILE_NAME);
  if (!existsSync(lockPath)) {
    return { ok: false, problems: [`${LOCK_FILE_NAME} not found`] };
  }
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as TileForgeLock;
  const packageDir = join(resolve(worldforgeRoot), ...lock.packagePath.split("/"));
  if (!existsSync(packageDir)) {
    return { ok: false, problems: [`pinned package directory ${lock.packagePath} not found`] };
  }

  const relPaths = walkFiles(packageDir)
    .map((path) => relative(packageDir, path).replaceAll("\\", "/"))
    .sort();
  const hashLines: string[] = [];
  let totalBytes = 0;
  for (const rel of relPaths) {
    const data = readFileSync(join(packageDir, rel));
    totalBytes += data.length;
    hashLines.push(`${rel}\n${sha256HexBytes(data)}\n`);
  }
  const contentSha256 = sha256Hex(hashLines.join(""));

  if (relPaths.length !== lock.fileCount) {
    problems.push(`fileCount mismatch: lock ${lock.fileCount}, fixture ${relPaths.length}`);
  }
  if (totalBytes !== lock.totalBytes) {
    problems.push(`totalBytes mismatch: lock ${lock.totalBytes}, fixture ${totalBytes}`);
  }
  if (contentSha256 !== lock.contentSha256) {
    problems.push(`contentSha256 mismatch: lock ${lock.contentSha256}, fixture ${contentSha256}`);
  }
  const manifestPath = join(packageDir, "tileforge-manifest.json");
  if (!existsSync(manifestPath)) {
    problems.push("fixture is missing tileforge-manifest.json");
  } else if (sha256HexBytes(readFileSync(manifestPath)) !== lock.manifestSha256) {
    problems.push("manifestSha256 mismatch");
  }
  return { ok: problems.length === 0, problems };
}

interface ManifestIdentity {
  readonly formatVersion: number;
  readonly generator: string;
  readonly theme: string;
  readonly sourceCommit: string | null;
  readonly projectSeed: number | null;
  readonly tileSize: number | null;
}

function parseManifest(bytes: Buffer): ManifestIdentity {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`tileforge-manifest.json is not valid JSON: ${String(error)}`);
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("tileforge-manifest.json must be a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  if (record["formatVersion"] !== 1) {
    throw new Error(
      `unsupported manifest formatVersion ${String(record["formatVersion"])} (supported: 1)`,
    );
  }
  const generator = record["generator"];
  if (typeof generator !== "string" || generator === "") {
    throw new Error("manifest.generator must be a non-empty string");
  }
  const style = record["style"];
  const theme =
    style !== null && typeof style === "object"
      ? (style as Record<string, unknown>)["theme"]
      : undefined;
  if (typeof theme !== "string" || theme === "") {
    throw new Error("manifest.style.theme must be a non-empty string");
  }
  const sourceCommit = record["sourceCommit"];
  const projectSeed = record["projectSeed"];
  const tileSize = record["tileSize"];
  return {
    formatVersion: 1,
    generator,
    theme,
    sourceCommit: typeof sourceCommit === "string" && sourceCommit !== "" ? sourceCommit : null,
    projectSeed: Number.isSafeInteger(projectSeed) ? (projectSeed as number) : null,
    tileSize: Number.isSafeInteger(tileSize) ? (tileSize as number) : null,
  };
}

/** Reject unsafe entries, drop ignorable metadata files, return kept files. */
function preflightEntries(entries: readonly ZipEntry[], warnings: string[]): ZipEntry[] {
  const seen = new Set<string>();
  const kept: ZipEntry[] = [];
  for (const entry of entries) {
    const name = entry.name;
    if (name === "" || name.includes("\\") || hasControlCharacters(name)) {
      throw new Error(`entry has an unsafe name: ${JSON.stringify(name)}`);
    }
    if (/^([A-Za-z]:|\/)/.test(name)) {
      throw new Error(`entry "${name}" has an absolute path`);
    }
    const segments = name.split("/").filter((segment) => segment !== "");
    if (segments.includes("..")) {
      throw new Error(`entry "${name}" contains a ".." path segment`);
    }
    for (const segment of segments) {
      if (VCS_SEGMENTS.has(segment)) {
        throw new Error(`entry "${name}" contains source-control metadata (${segment})`);
      }
    }
    if (entry.isSymlink) {
      throw new Error(`entry "${name}" is a symlink; packages must contain plain files`);
    }
    if (entry.isDirectory) {
      continue;
    }
    if (seen.has(name)) {
      throw new Error(`entry "${name}" appears more than once`);
    }
    seen.add(name);

    const base = segments[segments.length - 1] ?? "";
    if (EXCLUDED_BASENAMES.has(base)) {
      warnings.push(`excluded metadata file "${name}"`);
      continue;
    }
    for (const pattern of SECRET_NAME_PATTERNS) {
      if (pattern.test(name)) {
        throw new Error(`entry "${name}" matches a secret-material filename pattern`);
      }
    }
    if (entry.uncompressedSize > MAX_FILE_BYTES) {
      throw new Error(
        `entry "${name}" is ${entry.uncompressedSize} bytes, over the ${MAX_FILE_BYTES} host limit`,
      );
    }
    if (entry.uncompressedSize > WARN_FILE_BYTES) {
      warnings.push(`entry "${name}" is ${entry.uncompressedSize} bytes`);
    }
    const dot = base.lastIndexOf(".");
    const extension = dot === -1 ? "" : base.slice(dot).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension)) {
      const text = entry.read().toString("utf8");
      for (const pattern of SECRET_CONTENT_PATTERNS) {
        if (pattern.test(text)) {
          throw new Error(`entry "${name}" contains secret-looking content (${pattern})`);
        }
      }
    }
    kept.push(entry);
  }
  if (kept.length === 0) {
    throw new Error("package contains no files");
  }
  return kept;
}

function detectSharedRoot(names: readonly string[]): string | null {
  const roots = new Set(names.map((name) => name.split("/")[0] ?? ""));
  if (roots.size !== 1) {
    return null;
  }
  const [root] = roots;
  if (root === undefined || root === "" || !names.every((name) => name.startsWith(`${root}/`))) {
    return null;
  }
  return root;
}

function sanitizePackageId(raw: string): string {
  const id = raw.toLowerCase().replaceAll("/", "-").replace(/[^a-z0-9._-]+/g, "-");
  if (id === "" || id === "." || id === "..") {
    throw new Error(`cannot derive a usable package id from "${raw}"`);
  }
  return id;
}

function hasControlCharacters(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) < 0x20) {
      return true;
    }
  }
  return false;
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !/^([A-Za-z]:|\/)/.test(rel);
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(path));
    } else if (entry.isFile()) {
      out.push(...[path]);
    }
  }
  return out;
}
