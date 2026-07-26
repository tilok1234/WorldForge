/**
 * Read-only static server for the WorldForge viewer (zero dependencies).
 * Serves the repository root over localhost so tools/viewer.html can fetch
 * resolve outputs (?dir=outputs/<name>) and artifacts (?url=...). GET/HEAD
 * only, path-traversal denied, no write endpoint of any kind — the viewer
 * stays read-only by contract.
 *
 *   node dist/tools/serve-viewer.js [--port 8787] [--dir outputs/w7-slice]
 */

import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, normalize, resolve, sep } from "node:path";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

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
