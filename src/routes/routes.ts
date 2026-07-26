/**
 * Infrastructure planner (docs/ARCHITECTURE_AND_CONTRACTS.md, component 7;
 * Milestone W4). Routes exist because they connect destinations:
 *
 * - destination candidates are scored deterministically from geography
 *   (biome, flatness, coast and river proximity) with spacing enforcement —
 *   provisional anchors that W5's settlement planner will refine;
 * - the route graph is a Prim MST over settlement candidates; the longest
 *   edges become highway class up to the primaryRouteCount budget;
 * - paths are D4 Dijkstra (deterministic (cost, index) heap) with slope and
 *   water-crossing penalties; deep water is impassable;
 * - corridors follow the band-free doctrine (docs/GENERATION_RULES.md):
 *   packed-road ground material, street 2 cells wide, highway 3; the dirt
 *   path band (trail class) serves landmark spurs via the path layer;
 * - crossings are recorded where paths meet water or the river network:
 *   bridges on major rivers, fords elsewhere.
 */

import { MinHeap } from "../core/minHeap.js";
import { channel } from "../core/channels.js";
import type { ResolvedWorldConfig } from "../recipe/compile.js";
import type { HydrologyResult } from "../hydrology/hydrology.js";
import { WATER_DEEP, WATER_NONE, WATER_SHALLOW } from "../hydrology/hydrology.js";
import { PALETTE_INDEX } from "../regions/biomes.js";
import type { MacroFields } from "../fields/macroFields.js";
import { loadStamp } from "../settlements/landmarks.js";

const GRASS = PALETTE_INDEX["terrain.grass"];
const DRY_GRASS = PALETTE_INDEX["terrain.dry_grass"];
const MUD = PALETTE_INDEX["terrain.mud"];
const SNOW = PALETTE_INDEX["terrain.snow"];
const PACKED_ROAD = PALETTE_INDEX["terrain.packed_road"];
const COBBLE = PALETTE_INDEX["terrain.cobble"];

export interface Destination {
  readonly id: number;
  readonly kind: "settlement_candidate" | "landmark_candidate";
  readonly cell: number;
}

export interface Crossing {
  readonly cell: number;
  readonly kind: "bridge" | "ford";
}

export interface RouteRecord {
  readonly id: number;
  readonly routeClass: "highway" | "street" | "trail";
  readonly fromCell: number;
  readonly toCell: number;
  readonly length: number;
  readonly crossings: readonly Crossing[];
}

export interface RoutesResult {
  readonly destinations: readonly Destination[];
  readonly routes: readonly RouteRecord[];
  /** 1 where the dirt-path band runs (trail class), land cells only. */
  readonly pathLayer: Uint8Array;
  readonly roadCellCount: number;
  readonly trailCellCount: number;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function buildRoutes(
  grid: number[],
  fields: MacroFields,
  hydro: HydrologyResult,
  config: ResolvedWorldConfig,
): RoutesResult {
  const { width, height } = fields;
  const rules = config.routes;
  const errors: string[] = [];
  const warnings: string[] = [];

  const destinations = pickDestinations(grid, fields, hydro, config, warnings, errors);
  const settlements = destinations.filter((d) => d.kind === "settlement_candidate");
  const landmarks = destinations.filter((d) => d.kind === "landmark_candidate");

  const pathLayer = new Uint8Array(width * height);
  const routes: RouteRecord[] = [];
  let roadCellCount = 0;
  let trailCellCount = 0;

  // Prim MST over settlement candidates, Chebyshev edge weights.
  if (settlements.length > 1) {
    const inTree = new Set<number>([0]);
    const edges: Array<{ a: number; b: number; weight: number }> = [];
    while (inTree.size < settlements.length) {
      let best: { a: number; b: number; weight: number } | null = null;
      for (const a of [...inTree].sort((p, q) => p - q)) {
        for (let b = 0; b < settlements.length; b += 1) {
          if (inTree.has(b)) {
            continue;
          }
          const weight = chebyshev(
            (settlements[a] as Destination).cell,
            (settlements[b] as Destination).cell,
            width,
          );
          if (best === null || weight < best.weight || (weight === best.weight && (b < best.b || (b === best.b && a < best.a)))) {
            best = { a, b, weight };
          }
        }
      }
      if (best === null) {
        break;
      }
      inTree.add(best.b);
      edges.push(best);
    }

    // The longest edges are the arterial (highway) connections.
    const highwayCount = Math.min(config.budgets.primaryRouteCount, edges.length);
    const byLength = [...edges].sort((p, q) => q.weight - p.weight || p.b - q.b);
    const highwaySet = new Set(byLength.slice(0, highwayCount));

    for (const edge of edges) {
      const routeClass = highwaySet.has(edge) ? "highway" : "street";
      const fromCell = (settlements[edge.a] as Destination).cell;
      const toCell = (settlements[edge.b] as Destination).cell;
      const path = dijkstra(fromCell, new Set([toCell]), grid, hydro, config, width, height);
      if (path === null) {
        errors.push(`no route between destinations ${edge.a} and ${edge.b}`);
        continue;
      }
      const crossings = stampRoad(path, grid, hydro, width, height, routeClass === "highway" ? rules.highwayWidth : rules.streetWidth);
      roadCellCount += path.length;
      const record: RouteRecord = {
        id: routes.length,
        routeClass,
        fromCell,
        toCell,
        length: path.length,
        crossings,
      };
      routes.push(record);
      const airline = Math.max(1, chebyshev(fromCell, toCell, width));
      if (Math.trunc((path.length * 1000) / airline) > rules.detourWarnRatioPermille) {
        warnings.push(`route ${record.id} detours ${path.length} cells over airline ${airline}`);
      }
    }
  }

  // Trails: each landmark spurs to the nearest road cell (or settlement).
  const roadTargets = new Set<number>();
  for (let index = 0; index < grid.length; index += 1) {
    if (grid[index] === PACKED_ROAD) {
      roadTargets.add(index);
    }
  }
  for (const settlement of settlements) {
    roadTargets.add(settlement.cell);
  }
  for (const landmark of landmarks) {
    if (roadTargets.size === 0) {
      break;
    }
    const path = dijkstra(landmark.cell, roadTargets, grid, hydro, config, width, height);
    if (path === null) {
      errors.push(`landmark ${landmark.id} cannot reach the route network`);
      continue;
    }
    const crossings: Crossing[] = [];
    for (const cell of path) {
      if (hydro.waterKind[cell] !== WATER_NONE || hydro.isRiver[cell] === 1) {
        crossings.push({ cell, kind: hydro.isMajorRiver[cell] === 1 ? "bridge" : "ford" });
      } else {
        pathLayer[cell] = 1;
        trailCellCount += 1;
      }
    }
    routes.push({
      id: routes.length,
      routeClass: "trail",
      fromCell: landmark.cell,
      toCell: path[path.length - 1] as number,
      length: path.length,
      crossings,
    });
  }

  verifyRouteConnectivity(grid, pathLayer, routes, destinations, width, height, errors);

  return {
    destinations,
    routes,
    pathLayer,
    roadCellCount,
    trailCellCount,
    errors,
    warnings,
  };
}

function pickDestinations(
  grid: readonly number[],
  fields: MacroFields,
  hydro: HydrologyResult,
  config: ResolvedWorldConfig,
  warnings: string[],
  errors: string[],
): Destination[] {
  const { width, height } = fields;
  const jitter = channel(config.seed, "routes.destinations");
  const riverNear = new Uint8Array(width * height);
  for (let index = 0; index < grid.length; index += 1) {
    if (hydro.isRiver[index] === 1) {
      const x = index % width;
      const y = (index - x) / width;
      for (let dy = -3; dy <= 3; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            riverNear[ny * width + nx] = 1;
          }
        }
      }
    }
  }

  const scored: Array<{ score: number; index: number }> = [];
  const landmarkScored: Array<{ score: number; index: number }> = [];
  for (let index = 0; index < grid.length; index += 1) {
    if (hydro.waterKind[index] !== WATER_NONE || hydro.isRiver[index] === 1) {
      continue;
    }
    const biome = grid[index] as number;
    let base: number;
    if (biome === GRASS) {
      base = 100;
    } else if (biome === DRY_GRASS) {
      base = 80;
    } else if (biome === MUD) {
      base = 30;
    } else if (biome === SNOW) {
      base = 15;
    } else {
      base = -1; // rock, swamp: unusable for settlements
    }
    const x = index % width;
    const y = (index - x) / width;
    if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) {
      continue; // keep anchors off the world rim
    }
    let flat = true;
    const own = fields.elevation[index] as number;
    for (const neighbor of [index - 1, index + 1, index - width, index + width]) {
      if (Math.abs((fields.elevation[neighbor] as number) - own) > 25) {
        flat = false;
        break;
      }
    }
    const coast = hydro.coastDistance[index] as number;
    const coastBonus = coast >= 2 && coast <= 10 ? 25 : 0;
    const edgeDist = Math.min(x, y, width - 1 - x, height - 1 - y);
    const edgePenalty =
      edgeDist < config.routes.edgePenaltyRadius
        ? Math.trunc((30 * (config.routes.edgePenaltyRadius - edgeDist)) / config.routes.edgePenaltyRadius)
        : 0;
    const riverBonus = riverNear[index] === 1 ? 20 : 0;
    const roll = jitter.intAt(x, y, 0, 10);
    if (base > 0) {
      scored.push({ score: base + (flat ? 20 : 0) + coastBonus + riverBonus + roll - edgePenalty, index });
    }
    // Landmarks prefer dramatic ground: high or snowy, still reachable.
    const drama = own >= 550 ? 40 : 0;
    landmarkScored.push({ score: 40 + drama + (flat ? 10 : 0) + roll - edgePenalty, index });
  }

  const bySpacing = (
    pool: Array<{ score: number; index: number }>,
    count: number,
    taken: Destination[],
    kind: Destination["kind"],
    spacing: number,
  ): void => {
    pool.sort((a, b) => b.score - a.score || a.index - b.index);
    for (const candidate of pool) {
      if (taken.filter((d) => d.kind === kind).length >= count) {
        break;
      }
      const cx = candidate.index % fields.width;
      const cy = (candidate.index - cx) / fields.width;
      let clear = true;
      for (const existing of taken) {
        const ex = existing.cell % fields.width;
        const ey = (existing.cell - ex) / fields.width;
        if (Math.max(Math.abs(cx - ex), Math.abs(cy - ey)) < spacing) {
          clear = false;
          break;
        }
      }
      if (clear) {
        taken.push({ id: taken.length, kind, cell: candidate.index });
      }
    }
  };

  const taken: Destination[] = [];
  bySpacing(scored, config.budgets.settlementCount, taken, "settlement_candidate", config.routes.minDestinationSpacing);

  // Landmark slots honor their relational specs (W5 solver). Unsatisfiable
  // constraints fail with a named error instead of being silently relaxed.
  const town = taken.find((destination) => destination.kind === "settlement_candidate");
  landmarkScored.sort((a, b) => b.score - a.score || a.index - b.index);
  for (let slot = 0; slot < config.budgets.landmarkCount; slot += 1) {
    const spec = config.landmarkSpecs[slot] ?? { type: "ancient_fortress", relation: null };
    let placedSlot = false;
    for (const candidate of landmarkScored) {
      const cx = candidate.index % fields.width;
      const cy = (candidate.index - cx) / fields.width;
      let clear = true;
      for (const existing of taken) {
        const ex = existing.cell % fields.width;
        const ey = (existing.cell - ex) / fields.width;
        if (Math.max(Math.abs(cx - ex), Math.abs(cy - ey)) < config.routes.minDestinationSpacing) {
          clear = false;
          break;
        }
      }
      if (!clear) {
        continue;
      }
      if (spec.relation !== null) {
        if (town === undefined) {
          break;
        }
        if (!relationHolds(spec.relation, candidate.index, town.cell, hydro, fields.width)) {
          continue;
        }
      }
      // Candidates must satisfy footprint constraints (docs/GENERATION_RULES).
      if (!stampFootprintClear(spec.type, candidate.index, fields, hydro)) {
        continue;
      }
      taken.push({ id: taken.length, kind: "landmark_candidate", cell: candidate.index });
      placedSlot = true;
      break;
    }
    if (!placedSlot) {
      errors.push(
        spec.relation === null
          ? `landmark slot ${slot} (${spec.type}) found no valid site`
          : `landmark slot ${slot} (${spec.type}) constraint \"${spec.relation}\" is unsatisfiable in this world`,
      );
    }
  }

  const settlementsPlaced = taken.filter((d) => d.kind === "settlement_candidate").length;
  if (settlementsPlaced < config.budgets.settlementCount) {
    warnings.push(
      `placed ${settlementsPlaced}/${config.budgets.settlementCount} settlement candidates (spacing ${config.routes.minDestinationSpacing})`,
    );
  }
  return taken;
}

/** D4 Dijkstra from start to any target cell; returns the path or null. */
function dijkstra(
  start: number,
  targets: ReadonlySet<number>,
  grid: readonly number[],
  hydro: HydrologyResult,
  config: ResolvedWorldConfig,
  width: number,
  height: number,
): number[] | null {
  const rules = config.routes;
  const cellCount = width * height;
  const dist = new Float64Array(cellCount).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(cellCount).fill(-1);
  const done = new Uint8Array(cellCount);
  const heap = new MinHeap(cellCount * 4);
  dist[start] = 0;
  heap.push(0, start);
  while (heap.size > 0) {
    const current = heap.pop();
    if (done[current] === 1) {
      continue;
    }
    done[current] = 1;
    if (targets.has(current)) {
      const path: number[] = [];
      let cursor = current;
      while (cursor !== -1) {
        path.push(cursor);
        cursor = prev[cursor] as number;
      }
      path.reverse();
      return path;
    }
    const x = current % width;
    const y = (current - x) / width;
    const neighbors: number[] = [];
    if (y > 0) neighbors.push(current - width);
    if (x < width - 1) neighbors.push(current + 1);
    if (y < height - 1) neighbors.push(current + width);
    if (x > 0) neighbors.push(current - 1);
    for (const neighbor of neighbors) {
      if (done[neighbor] === 1) {
        continue;
      }
      const kind = hydro.waterKind[neighbor];
      if (kind === WATER_DEEP) {
        continue; // deep water is impassable for routes
      }
      let cost = rules.stepCost;
      const nx2 = neighbor % width;
      const ny2 = (neighbor - nx2) / width;
      const edgeDist = Math.min(nx2, ny2, width - 1 - nx2, height - 1 - ny2);
      if (edgeDist < rules.edgePenaltyRadius) {
        cost += Math.trunc((rules.edgePenaltyCost * (rules.edgePenaltyRadius - edgeDist)) / rules.edgePenaltyRadius);
      }
      cost +=
        Math.abs((hydro.filledElevation[neighbor] as number) - (hydro.filledElevation[current] as number)) *
        rules.slopeCostPerPermille;
      if (kind === WATER_SHALLOW) {
        cost += rules.shallowWaterCrossCost;
      } else if (hydro.isMajorRiver[neighbor] === 1) {
        cost += rules.majorRiverCrossCost;
      } else if (hydro.isRiver[neighbor] === 1) {
        cost += rules.networkRiverCrossCost;
      }
      const candidate = (dist[current] as number) + cost;
      if (candidate < (dist[neighbor] as number)) {
        dist[neighbor] = candidate;
        prev[neighbor] = current;
        heap.push(candidate, neighbor);
      }
    }
  }
  return null;
}

/** Stamp a packed-road corridor along a path; returns the crossings found. */
function stampRoad(
  path: readonly number[],
  grid: number[],
  hydro: HydrologyResult,
  width: number,
  height: number,
  corridorWidth: number,
): Crossing[] {
  const crossings: Crossing[] = [];
  for (const cell of path) {
    if (hydro.waterKind[cell] !== WATER_NONE || hydro.isRiver[cell] === 1) {
      crossings.push({ cell, kind: hydro.isMajorRiver[cell] === 1 ? "bridge" : "ford" });
      continue;
    }
    const x = cell % width;
    const y = (cell - x) / width;
    // Street: the cell plus east and south neighbors (2 wide). Highway: the
    // full 3x3 block. Water is never overwritten; bridges span it instead.
    const offsets =
      corridorWidth >= 3
        ? [
            [-1, -1], [0, -1], [1, -1],
            [-1, 0], [0, 0], [1, 0],
            [-1, 1], [0, 1], [1, 1],
          ]
        : [
            [0, 0], [1, 0],
            [0, 1], [1, 1],
          ];
    for (const offset of offsets) {
      const nx = x + (offset[0] as number);
      const ny = y + (offset[1] as number);
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
        continue;
      }
      const target = ny * width + nx;
      if (hydro.waterKind[target] === WATER_NONE && hydro.isRiver[target] === 0) {
        grid[target] = PACKED_ROAD;
      }
    }
  }
  return crossings;
}

/** Required traversal must hold on the composed grid (roadmap W4 exit gate). */
export function verifyRouteConnectivity(
  grid: readonly number[],
  pathLayer: Uint8Array,
  routes: readonly RouteRecord[],
  destinations: readonly Destination[],
  width: number,
  height: number,
  errors: string[],
): void {
  if (destinations.length === 0) {
    return;
  }
  const walkable = new Uint8Array(grid.length);
  for (let index = 0; index < grid.length; index += 1) {
    if (grid[index] === PACKED_ROAD || grid[index] === COBBLE || pathLayer[index] === 1) {
      walkable[index] = 1;
    }
  }
  for (const route of routes) {
    for (const crossing of route.crossings) {
      walkable[crossing.cell] = 1;
    }
  }
  for (const destination of destinations) {
    walkable[destination.cell] = 1;
  }
  const start = (destinations[0] as Destination).cell;
  const seen = new Uint8Array(grid.length);
  const queue = [start];
  seen[start] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head] as number;
    const x = index % width;
    const y = (index - x) / width;
    for (const neighbor of [index - width, index + 1, index + width, index - 1]) {
      if (neighbor < 0 || neighbor >= grid.length) {
        continue;
      }
      if (x === 0 && neighbor === index - 1) continue;
      if (x === width - 1 && neighbor === index + 1) continue;
      if (seen[neighbor] === 0 && walkable[neighbor] === 1) {
        seen[neighbor] = 1;
        queue.push(neighbor);
      }
    }
  }
  for (const destination of destinations) {
    if (seen[destination.cell] === 0) {
      errors.push(`destination ${destination.id} (${destination.kind}) is disconnected from the route network`);
    }
  }
}

/** The whole stamp footprint must be dry, unbuilt-on, and gently sloped. */
function stampFootprintClear(
  type: string,
  cell: number,
  fields: MacroFields,
  hydro: HydrologyResult,
): boolean {
  const stamp = loadStamp(type);
  const { width, height } = fields;
  const anchorX = cell % width;
  const anchorY = (cell - anchorX) / width;
  const originX = anchorX - stamp.anchorX;
  const originY = anchorY - stamp.anchorY;
  if (originX < 1 || originY < 1 || originX + stamp.width >= width - 1 || originY + stamp.height >= height - 1) {
    return false;
  }
  const anchorElevation = fields.elevation[cell] as number;
  for (let sy = 0; sy < stamp.height; sy += 1) {
    for (let sx = 0; sx < stamp.width; sx += 1) {
      const index = (originY + sy) * width + originX + sx;
      if (hydro.waterKind[index] !== 0 || hydro.isRiver[index] === 1) {
        return false;
      }
      if (Math.abs((fields.elevation[index] as number) - anchorElevation) > stamp.maxSlopePermille) {
        return false;
      }
    }
  }
  return true;
}

/** Relational predicates for landmark placement (W5 solver). */
function relationHolds(
  relation: string,
  cell: number,
  townCell: number,
  hydro: HydrologyResult,
  width: number,
): boolean {
  const distance = chebyshev(cell, townCell, width);
  if (relation === "near_town") {
    return distance <= Math.trunc(width / 5);
  }
  if (relation === "far_from_town") {
    return distance >= Math.trunc(width / 3);
  }
  if (relation === "across_river_from_town") {
    // Integer line walk from town to candidate; a major river or water body
    // on the segment counts as separation.
    let x0 = townCell % width;
    let y0 = (townCell - x0) / width;
    const x1 = cell % width;
    const y1 = (cell - x1) / width;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    while (x0 !== x1 || y0 !== y1) {
      const doubled = 2 * error;
      if (doubled >= dy) {
        error += dy;
        x0 += sx;
      }
      if (doubled <= dx) {
        error += dx;
        y0 += sy;
      }
      const index = y0 * width + x0;
      if (hydro.isMajorRiver[index] === 1 || hydro.waterKind[index] !== 0) {
        return true;
      }
    }
    return false;
  }
  return false;
}

function chebyshev(a: number, b: number, width: number): number {
  const ax = a % width;
  const ay = (a - ax) / width;
  const bx = b % width;
  const by = (b - bx) / width;
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
