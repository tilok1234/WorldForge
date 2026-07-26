/**
 * Godot consumer driver (Milestone W7). Copies the pinned TileForge package
 * fixture into consumers/godot/tileforge/ per the package README quick start
 * (the copy is gitignored — the committed fixture stays the single source),
 * imports assets headless, runs the PACKAGED tileforge_importer.gd through a
 * SceneTree wrapper, and verifies the built TileSet against the manifest.
 *
 *   node dist/tools/godot-consumer.js [--godot <executable>] [--skip-copy]
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, resolve, sep } from "node:path";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const GODOT_DIR = join(ROOT, "consumers", "godot");
const PACKAGE_COPY = join(GODOT_DIR, "tileforge");
const WORLD_COPY = join(GODOT_DIR, "world");
const WORLD_FILES = [
  "resolved-map.tmj",
  "tileforge-map-data.json",
  "tileforge-slice.json",
  "tileforge-diagnostics.json",
] as const;

function main(argv: readonly string[]): number {
  let godot = "godot";
  let skipCopy = false;
  let worldDir: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--godot" && argv[i + 1] !== undefined) {
      godot = argv[i + 1] as string;
      i += 1;
    } else if (argv[i] === "--skip-copy") {
      skipCopy = true;
    } else if (argv[i] === "--world" && argv[i + 1] !== undefined) {
      worldDir = argv[i + 1] as string;
      i += 1;
    }
  }

  const lock = JSON.parse(readFileSync(join(ROOT, "tileforge.lock.json"), "utf8")) as {
    packagePath: string;
  };
  const fixture = join(ROOT, ...lock.packagePath.split("/"));

  if (!skipCopy) {
    // Refuse to delete anything that is not exactly the gitignored copy.
    const resolved = resolve(PACKAGE_COPY);
    if (!resolved.startsWith(resolve(ROOT) + sep) || !resolved.endsWith(join("consumers", "godot", "tileforge"))) {
      process.stderr.write(`refusing to touch unexpected path ${resolved}\n`);
      return 1;
    }
    if (existsSync(resolved)) {
      rmSync(resolved, { recursive: true });
    }
    cpSync(fixture, resolved, { recursive: true });
    process.stdout.write(`copied pinned package -> ${resolved}\n`);
  }

  if (worldDir !== undefined) {
    // Ship a resolved world into the project (gitignored, like the package).
    const source = resolve(ROOT, worldDir);
    mkdirSync(WORLD_COPY, { recursive: true });
    for (const name of WORLD_FILES) {
      const from = join(source, name);
      if (!existsSync(from)) {
        process.stderr.write(`missing ${from}; run resolve-tileforge first\n`);
        return 1;
      }
      cpSync(from, join(WORLD_COPY, name));
    }
    process.stdout.write(`copied world ${worldDir} -> ${WORLD_COPY}\n`);
  }

  const steps: (readonly [string, readonly string[]])[] = [
    ["asset import", ["--headless", "--path", GODOT_DIR, "--import"]],
    ["packaged importer", ["--headless", "--path", GODOT_DIR, "-s", "res://import_tileforge.gd"]],
    ["tileset verification", ["--headless", "--path", GODOT_DIR, "-s", "res://verify_tileset.gd"]],
  ];
  if (worldDir !== undefined) {
    steps.push(["world integration check", ["--headless", "--path", GODOT_DIR, "-s", "res://verify_world.gd"]]);
  }
  for (const [label, args] of steps) {
    process.stdout.write(`\n== ${label}: godot ${args.join(" ")}\n`);
    // A GDScript error that aborts _init() leaves the headless main loop
    // idling forever, so every step gets a hard timeout.
    const run = spawnSync(godot, args, { stdio: "inherit", shell: false, timeout: 300000 });
    if (run.error !== undefined) {
      process.stderr.write(`failed to launch "${godot}": ${run.error.message}\n`);
      return 1;
    }
    if (run.signal !== null) {
      process.stderr.write(`${label} TIMED OUT and was killed (${run.signal})\n`);
      return 1;
    }
    if (run.status !== 0) {
      process.stderr.write(`${label} FAILED (exit ${run.status})\n`);
      return 1;
    }
  }
  process.stdout.write("\ngodot consumer: packaged importer ran and its TileSet verified\n");
  return 0;
}

process.exit(main(process.argv.slice(2)));
