/**
 * Read-only static server for the WorldForge viewer (zero dependencies).
 * Serves the repository root over localhost so tools/viewer.html can fetch
 * resolve outputs (?dir=outputs/<name>) and artifacts (?url=...), plus one
 * read-only listing endpoint (/api/worlds) that enumerates generated worlds
 * under outputs/ for the viewer's world picker. GET/HEAD only,
 * path-traversal denied, no write endpoint of any kind — the viewer stays
 * read-only by contract.
 *
 *   node dist/tools/serve-viewer.js [--port 8787] [--dir outputs/w7-slice]
 */

import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, normalize, resolve, sep } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** Files a directory must contain to open in the viewer's native mode. */
const NATIVE_FILES = [
  "tileforge-map-data.json",
  "tileforge-slice.json",
  "tileforge-diagnostics.json",
  "resolved-render.png",
] as const;

interface WorldListing {
  readonly dir: string;
  readonly name: string;
  readonly native: boolean;
  readonly semantic: boolean;
  /** Artifact formatVersion of world.json, null if absent or unreadable. */
  readonly format: number | null;
}

const formatCache = new Map<string, { mtimeMs: number; size: number; format: number | null }>();

function artifactFormat(worldJsonPath: string): number | null {
  const stat = statSync(worldJsonPath);
  const cached = formatCache.get(worldJsonPath);
  if (cached !== undefined && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.format;
  }
  let format: number | null = null;
  try {
    const parsed = JSON.parse(readFileSync(worldJsonPath, "utf8")) as { formatVersion?: unknown };
    format = typeof parsed.formatVersion === "number" ? parsed.formatVersion : null;
  } catch {
    format = null;
  }
  formatCache.set(worldJsonPath, { mtimeMs: stat.mtimeMs, size: stat.size, format });
  return format;
}

function listWorlds(): WorldListing[] {
  const worlds: WorldListing[] = [];
  const scan = (relative: string, depth: number): void => {
    const absolute = join(ROOT, relative);
    if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dirRelative = `${relative}/${entry.name}`;
      const dirAbsolute = join(absolute, entry.name);
      const worldJson = join(dirAbsolute, "world.json");
      const semantic = existsSync(worldJson);
      const native = NATIVE_FILES.every((name) => existsSync(join(dirAbsolute, name)));
      if (native || semantic) {
        worlds.push({
          dir: dirRelative,
          name: entry.name,
          native,
          semantic,
          format: semantic ? artifactFormat(worldJson) : null,
        });
      }
      if (depth > 1) scan(dirRelative, depth - 1);
    }
  };
  scan("outputs", 2);
  worlds.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
  return worlds;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".tmj": "application/json",
  ".png": "image/png",
  ".js": "text/javascript",
  ".css": "text/css",
};

function main(argv: readonly string[]): void {
  let port = 8787;
  let dir = "outputs/w7-slice";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--port" && argv[i + 1] !== undefined) {
      port = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--dir" && argv[i + 1] !== undefined) {
      dir = argv[i + 1] as string;
      i += 1;
    }
  }

  const server = createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://localhost");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") {
      pathname = "/tools/viewer.html";
    }
    if (pathname === "/api/worlds") {
      const body = JSON.stringify({ worlds: listWorlds() });
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }
    const target = resolve(join(ROOT, normalize(pathname)));
    if (target !== ROOT && !target.startsWith(ROOT + sep)) {
      response.writeHead(403).end("outside repository root");
      return;
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      response.writeHead(404).end("not found");
      return;
    }
    const extension = target.slice(target.lastIndexOf("."));
    response.writeHead(200, {
      "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : readFileSync(target));
  });

  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(
      [
        `WorldForge viewer serving ${ROOT}`,
        `  native review:  http://127.0.0.1:${port}/tools/viewer.html?dir=${dir}`,
        `  semantic view:  http://127.0.0.1:${port}/tools/viewer.html?url=/outputs/<dir>/world.json`,
        "read-only: GET/HEAD only. Ctrl+C to stop.",
      ].join("\n") + "\n",
    );
  });
}

main(process.argv.slice(2));
