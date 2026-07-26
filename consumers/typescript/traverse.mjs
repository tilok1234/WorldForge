// WorldForge TypeScript-consumer traversal harness (Milestone W8).
// Depends ONLY on the public loader — the boundary a TS game would use.
//
//   node consumers/typescript/traverse.mjs [path/to/world.json]

import { readFileSync } from "node:fs";
import { loadWorldArtifact } from "../../dist/src/consumers/typescript/loader.js";

const path = process.argv[2] ?? "outputs/w7-slice/world.json";
const result = loadWorldArtifact(JSON.parse(readFileSync(path, "utf8")));
if (!result.ok) {
  console.error("artifact rejected:");
  for (const issue of result.issues) console.error(`  ${issue.path}: ${issue.message}`);
  process.exit(1);
}
const world = result.world;
const { width, height } = world.dimensions;
console.log(
  `loaded ${width}x${height} world, seed ${world.generator.seed}, ` +
    `behavior v${world.generator.generatorBehaviorVersion}, ` +
    `identity ${world.generator.generationIdentitySha256.slice(0, 12)}…`,
);

// Grid BFS over the public walkability model from the first destination.
const [start] = world.destinations;
if (start === undefined) {
  console.error("world has no destinations");
  process.exit(1);
}
const nudge = (cx, cy) => {
  for (let radius = 0; radius < 8; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (world.inBounds(x, y) && world.walkableAt(x, y)) return [x, y];
      }
    }
  }
  return null;
};
const origin = nudge(start.cell[0], start.cell[1]);
const reached = new Set([origin.join(",")]);
const queue = [origin];
for (let head = 0; head < queue.length; head += 1) {
  const [x, y] = queue[head];
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const nx = x + dx;
    const ny = y + dy;
    const key = `${nx},${ny}`;
    if (!reached.has(key) && world.inBounds(nx, ny) && world.walkableAt(nx, ny)) {
      reached.add(key);
      queue.push([nx, ny]);
    }
  }
}
console.log(`walkable flood from destination ${start.id}: ${reached.size} cells`);
for (const destination of world.destinations) {
  const goal = nudge(destination.cell[0], destination.cell[1]);
  const ok = goal !== null && reached.has(goal.join(","));
  console.log(`  destination ${destination.id} (${destination.kind}): ${ok ? "reachable" : "UNREACHABLE"}`);
  if (!ok) process.exitCode = 1;
}
console.log("cache stamp:", JSON.stringify(world.cacheStamp("example-ts-game", "0.1.0")));
