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
const ROCK = PALETTE_INDEX["terrain.rock"];
const GRAVEL = PALETTE_INDEX["terrain.gravel"];

/**
 * The map corner lying farthest from the given cell, by Manhattan distance
 * (Chebyshev ties two same-side corners when the cell sits at mid-height).
 * Shared by the remote_corner landmark relation and the remote-quarter
 * settlement reservation (routes.graph v7).
 */
function remoteCorner(fromCell: number, width: number): readonly [number, number] {
  const tx = fromCell % width;
  const ty = Math.trunc(fromCell / width);
  const corners: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, width - 1],
    [width - 1, width - 1],
  ];
  let far = corners[0] as readonly [number, number];
  let farDist = -1;
  for (const corner of corners) {
    const d = Math.abs(corner[0] - tx) + Math.abs(corner[1] - ty);
    if (d > farDist) {
      farDist = d;
      far = corner;
    }
  }
  return far;
}

/**
 * Grade a rock cell a trail crosses (routes.graph v4). A lone rock cell
 * between open land adopts a walkable neighbor's material so it merges with
 * that region (no one-cell confetti); longer rock crossings become a
 * connected gravel line.
 */
function gradeRockCell(cell: number, grid: number[], width: number, height: number): void {
  const x = cell % width;
  const y = (cell - x) / width;
  const adoptable = new Set([GRASS, DRY_GRASS, SNOW, MUD, GRAVEL]);
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const neighbor = grid[ny * width + nx] as number;
    if (adoptable.has(neighbor)) {
      grid[cell] = neighbor;
      return;
    }
  }
  grid[cell] = GRAVEL;
}

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
  const connectedPairs = new Set<string>();
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

    // Future landmark stamp footprints (plus a one-cell apron): roads must
    // not cross them, or the stamp honestly refuses to place later.
    const landmarkAvoid = new Set<number>();
    for (let slot = 0; slot < landmarks.length; slot += 1) {
      const spec = config.landmarkSpecs[slot] ?? { type: "ancient_fortress", relation: null, at: null, near: null };
      const stampSpec = loadStamp(spec.type, config.authoring.stamps);
      const anchorCell = (landmarks[slot] as Destination).cell;
      const originX = (anchorCell % width) - stampSpec.anchorX;
      const originY = Math.trunc(anchorCell / width) - stampSpec.anchorY;
      for (let sy = -1; sy <= stampSpec.height; sy += 1) {
        for (let sx = -1; sx <= stampSpec.width; sx += 1) {
          const cx = originX + sx;
          const cy = originY + sy;
          if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
          landmarkAvoid.add(cy * width + cx);
        }
      }
    }

    for (const edge of edges) {
      connectedPairs.add(`${Math.min(edge.a, edge.b)}:${Math.max(edge.a, edge.b)}`);
      const routeClass = highwaySet.has(edge) ? "highway" : "street";
      const fromCell = (settlements[edge.a] as Destination).cell;
      const toCell = (settlements[edge.b] as Destination).cell;
      const path = dijkstra(fromCell, new Set([toCell]), grid, hydro, config, width, height, landmarkAvoid);
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
        // Mountain trails are graded (routes.graph v4): the path is
        // genuinely walkable, not just drawn.
        if (grid[cell] === ROCK) {
          gradeRockCell(cell, grid, width, height);
        }
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

  // Shortcut trails (routes.graph v4): rough paths between near settlement
  // pairs the MST left apart — the wilderness gains small roads and the
  // network gains loops. Trail class: dirt path band, never a paved road.
  if (settlements.length > 2 && rules.shortcutTrailMax > 0) {
    const shortcuts: Array<{ a: number; b: number; weight: number }> = [];
    for (let a = 0; a < settlements.length; a += 1) {
      for (let b = a + 1; b < settlements.length; b += 1) {
        if (connectedPairs.has(`${a}:${b}`)) continue;
        const weight = chebyshev(
          (settlements[a] as Destination).cell,
          (settlements[b] as Destination).cell,
          width,
        );
        if (weight <= rules.shortcutTrailSpan) {
          shortcuts.push({ a, b, weight });
        }
      }
    }
    shortcuts.sort((p, q) => p.weight - q.weight || p.a - q.a || p.b - q.b);
    const used = new Set<number>();
    let made = 0;
    for (const shortcut of shortcuts) {
      if (made >= rules.shortcutTrailMax) break;
      if (used.has(shortcut.a) || used.has(shortcut.b)) continue; // spread them
      const fromCell = (settlements[shortcut.a] as Destination).cell;
      const toCell = (settlements[shortcut.b] as Destination).cell;
      const path = dijkstra(fromCell, new Set([toCell]), grid, hydro, config, width, height);
      if (path === null) continue;
      const crossings: Crossing[] = [];
      for (const cell of path) {
        if (hydro.waterKind[cell] !== WATER_NONE || hydro.isRiver[cell] === 1) {
          crossings.push({ cell, kind: hydro.isMajorRiver[cell] === 1 ? "bridge" : "ford" });
        } else if (pathLayer[cell] === 0) {
          pathLayer[cell] = 1;
          trailCellCount += 1;
          if (grid[cell] === ROCK) {
            gradeRockCell(cell, grid, width, height);
          }
        }
      }
      routes.push({
        id: routes.length,
        routeClass: "trail",
        fromCell,
        toCell,
        length: path.length,
        crossings,
      });
      used.add(shortcut.a);
      used.add(shortcut.b);
      made += 1;
    }
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
    landmarkScored.push({ score: 40 + drama + (flat ? 10 : 0) + roll - edgePenalty * 3, index });
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
  // Settlement selection in three phases (routes.graph v7), preceded by
  // authored pins (behavior 37, routes.graph v13; explicit ranks behavior
  // 38, routes.graph v14):
  //   0. pins — settlementSpecs in ascending claimed-rank order (rank 0 is
  //      the capital; a low-rank pin may leave the capital free). An
  //      unsatisfiable pin is a named generation error, never a
  //      relocation, matching the landmark pin contract. Pinned
  //      settlements are real settlements to every later phase: the
  //      capital phase no-ops when a pin claimed rank 0, the remote
  //      quarter measures from the rank-0 settlement and stands down when
  //      rank 1 is pinned, sector floors count pins toward their
  //      sector, and open competition spaces around them.
  //   1. the capital — the single best-scored candidate anywhere;
  //   2. the remote quarter — the map quarter whose corner lies farthest
  //      from the capital gets a reserved share, its best candidate
  //      placing at rank 1 (settlements.plans crowns it the second city);
  //   3. the rest of the world competes for the remaining slots.
  const pinnedRankCell = new Map<number, number>();
  const pinnedCellSet = new Set<number>();
  if (config.settlementSpecs.length > 0) {
    const candidateScore = new Map<number, number>();
    for (const candidate of scored) {
      candidateScore.set(candidate.index, candidate.score);
    }
    const spacedClear = (index: number): boolean => {
      const cx = index % fields.width;
      const cy = (index - cx) / fields.width;
      for (const existing of taken) {
        const ex = existing.cell % fields.width;
        const ey = (existing.cell - ex) / fields.width;
        if (Math.max(Math.abs(cx - ex), Math.abs(cy - ey)) < config.routes.minDestinationSpacing) {
          return false;
        }
      }
      return true;
    };
    // Specs arrive in ascending unique rank order (normalization sorted), so
    // near searches resolve in rank priority order.
    for (const spec of config.settlementSpecs) {
      const rank = spec.rank;
      if (spec.at !== null) {
        const pinned = (spec.at[1] as number) * fields.width + (spec.at[0] as number);
        if (!candidateScore.has(pinned)) {
          errors.push(
            `settlement rank ${rank} pinned at (${spec.at[0]}, ${spec.at[1]}): cell is not settleable (water, river, rock, swamp, slope, or world rim)`,
          );
          continue;
        }
        if (!spacedClear(pinned)) {
          errors.push(
            `settlement rank ${rank} pinned at (${spec.at[0]}, ${spec.at[1]}): too close to another pinned settlement (spacing ${config.routes.minDestinationSpacing})`,
          );
          continue;
        }
        taken.push({ id: taken.length, kind: "settlement_candidate", cell: pinned });
        pinnedRankCell.set(rank, pinned);
        pinnedCellSet.add(pinned);
        continue;
      }
      if (spec.near !== null) {
        const center = (spec.near.cell[1] as number) * fields.width + (spec.near.cell[0] as number);
        let best: { score: number; index: number } | null = null;
        for (const candidate of scored) {
          if (chebyshev(candidate.index, center, fields.width) > spec.near.radius) continue;
          if (!spacedClear(candidate.index)) continue;
          if (best === null || candidate.score > best.score || (candidate.score === best.score && candidate.index < best.index)) {
            best = candidate;
          }
        }
        if (best === null) {
          errors.push(
            `settlement rank ${rank} found no settleable site within ${spec.near.radius} of (${spec.near.cell[0]}, ${spec.near.cell[1]})`,
          );
          continue;
        }
        taken.push({ id: taken.length, kind: "settlement_candidate", cell: best.index });
        pinnedRankCell.set(rank, best.index);
        pinnedCellSet.add(best.index);
      }
    }
  }
  // Competitive phases ADD settlements around the pins; the rank permutation
  // below assigns competitive picks to the lowest unclaimed ranks in
  // selection order, so the capital-phase pick lands at rank 0 whenever no
  // pin claims it, and the remote-quarter pick lands at rank 1.
  const settlementCount = (): number =>
    taken.filter((d) => d.kind === "settlement_candidate").length;
  const addSettlements = (pool: Array<{ score: number; index: number }>, extra: number): void => {
    if (extra > 0) {
      bySpacing(pool, settlementCount() + extra, taken, "settlement_candidate", config.routes.minDestinationSpacing);
    }
  };
  const beforeCapital = settlementCount();
  addSettlements(scored, pinnedRankCell.has(0) ? 0 : 1);
  const firstCompetitive =
    settlementCount() > beforeCapital ? (taken[taken.length - 1] as Destination).cell : undefined;
  const capitalCell = pinnedRankCell.get(0) ?? firstCompetitive;
  if (
    config.routes.remoteQuarterMin > 0 &&
    !pinnedRankCell.has(1) &&
    capitalCell !== undefined &&
    config.budgets.settlementCount > config.routes.remoteQuarterMin
  ) {
    const [cornerX, cornerY] = remoteCorner(capitalCell, fields.width);
    const quarterSpan = Math.trunc(fields.width / 2);
    const quarterPool = scored.filter((candidate) => {
      const qx = candidate.index % fields.width;
      const qy = Math.trunc(candidate.index / fields.width);
      return Math.abs(qx - cornerX) <= quarterSpan && Math.abs(qy - cornerY) <= quarterSpan;
    });
    addSettlements(quarterPool, config.routes.remoteQuarterMin);
  }
  //   2b. sector floors (routes.graph v11, generalizing the v10 quadrants):
  //       pure score competition lets selections cluster into the
  //       best-scoring bands — the first 512 map left whole quadrants
  //       settlement-free. The map divides into sectorGrid x sectorGrid
  //       sectors, each keeping at least sectorMin settlements (terrain
  //       permitting) before the open competition, capped by the recipe's
  //       settlement budget. Sectors fill in reading order (NW -> SE), the
  //       same order the v10 quadrants used, so medium selections are
  //       byte-identical under a 2x2 grid of 2.
  if (config.routes.sectorMin > 0 && config.routes.sectorGrid > 1) {
    const grid = config.routes.sectorGrid;
    const sectorW = Math.trunc(fields.width / grid);
    const sectorH = Math.trunc(fields.height / grid);
    const settlementsTaken = (): number =>
      taken.filter((d) => d.kind === "settlement_candidate").length;
    for (let sector = 0; sector < grid * grid; sector += 1) {
      const sx0 = (sector % grid) * sectorW;
      const sy0 = Math.trunc(sector / grid) * sectorH;
      const inSector = (index: number): boolean => {
        const x = index % fields.width;
        const y = Math.trunc(index / fields.width);
        return x >= sx0 && x < sx0 + sectorW && y >= sy0 && y < sy0 + sectorH;
      };
      const have = taken.filter(
        (d) => d.kind === "settlement_candidate" && inSector(d.cell),
      ).length;
      const room = config.budgets.settlementCount - settlementsTaken();
      const want = Math.min(config.routes.sectorMin - have, room);
      if (want <= 0) continue;
      bySpacing(
        scored.filter((candidate) => inSector(candidate.index)),
        settlementsTaken() + want,
        taken,
        "settlement_candidate",
        config.routes.minDestinationSpacing,
      );
    }
  }
  bySpacing(scored, config.budgets.settlementCount, taken, "settlement_candidate", config.routes.minDestinationSpacing);

  // Rank permutation (behavior 38): settlement rank IS destination id, so
  // reorder the settlement picks — each pin holds its claimed rank and
  // competitive picks fill the unclaimed ranks ascending in selection
  // order. With pins claiming a contiguous 0..n-1 prefix (every behavior-37
  // recipe) this is the identity permutation. Only settlements are in
  // `taken` here; landmarks join afterwards.
  if (pinnedRankCell.size > 0) {
    const cells = taken.map((destination) => destination.cell);
    let maxRank = cells.length - 1;
    for (const rank of pinnedRankCell.keys()) maxRank = Math.max(maxRank, rank);
    const slots: Array<number | null> = new Array(maxRank + 1).fill(null);
    for (const [rank, cell] of pinnedRankCell) slots[rank] = cell;
    const freeCells = cells.filter((cell) => !pinnedCellSet.has(cell));
    let next = 0;
    for (let rank = 0; rank <= maxRank && next < freeCells.length; rank += 1) {
      if (slots[rank] === null) slots[rank] = freeCells[next++] as number;
    }
    taken.length = 0;
    for (const cell of slots) {
      if (cell !== null) taken.push({ id: taken.length, kind: "settlement_candidate", cell });
    }
  }

  // Landmark slots honor their relational specs (W5 solver) and authored
  // pins (behavior 36). Unsatisfiable constraints fail with a named error
  // instead of being silently relaxed. Pinned slots select FIRST (at, then
  // near, then relation/free in slot order) so competition can never steal
  // an authored site; chosen cells then join `taken` in slot order, keeping
  // the anchors aligned with landmarkSpecs downstream.
  const town = taken.find((destination) => destination.kind === "settlement_candidate");
  landmarkScored.sort((a, b) => b.score - a.score || a.index - b.index);
  {
    // A settlement's true extent is its structure radius (streets AND the
    // outermost lots) — the stamp must clear all of it. Lot origins sit on
    // the ring, so footprints spill up to two more cells outward.
    const streetReach = (rank: number): number => {
      const rules = config.settlements;
      if (rank < rules.cityCount) return Math.max(rules.cityRadius + 2, rules.cityPlazaRadius + rules.cityStreetArmLength);
      if (rank < rules.cityCount + rules.townCount) return Math.max(rules.townRadius + 2, rules.townPlazaRadius + rules.streetArmLength);
      return rules.outpostRadius + 2;
    };
    const chosenCells: Array<number | null> = new Array(config.budgets.landmarkCount).fill(null);
    const specOf = (slot: number) =>
      config.landmarkSpecs[slot] ?? { type: "ancient_fortress", relation: null, at: null, near: null };
    // Tier-aware clearance (routes.graph v3): a settlement's street fabric
    // (plaza + arms) must not reach the stamp footprint, or the landmark
    // stamp is rejected downstream. The stamp's farthest footprint cell
    // from its anchor plus one breathing cell is the landmark side of the
    // margin (the gravel blend is cosmetic and never rejects).
    const clearOf = (candidateIndex: number, stampMargin: number): boolean => {
      const cx = candidateIndex % fields.width;
      const cy = (candidateIndex - cx) / fields.width;
      for (const existing of taken) {
        const ex = existing.cell % fields.width;
        const ey = (existing.cell - ex) / fields.width;
        const required =
          existing.kind === "settlement_candidate"
            ? Math.max(config.routes.minDestinationSpacing, streetReach(existing.id) + stampMargin)
            : config.routes.minDestinationSpacing;
        if (Math.max(Math.abs(cx - ex), Math.abs(cy - ey)) < required) {
          return false;
        }
      }
      for (const chosen of chosenCells) {
        if (chosen === null) continue;
        const ex = chosen % fields.width;
        const ey = (chosen - ex) / fields.width;
        if (Math.max(Math.abs(cx - ex), Math.abs(cy - ey)) < config.routes.minDestinationSpacing) {
          return false;
        }
      }
      return true;
    };
    const trySelect = (slot: number): void => {
      const spec = specOf(slot);
      const stampSpec = loadStamp(spec.type, config.authoring.stamps);
      const stampMargin =
        Math.max(
          stampSpec.anchorX,
          stampSpec.width - 1 - stampSpec.anchorX,
          stampSpec.anchorY,
          stampSpec.height - 1 - stampSpec.anchorY,
        ) + 1;
      if (spec.at !== null) {
        // Authored pin: the anchor is exactly this cell, or a named failure —
        // never a silent relocation (docs/GAME_INTEGRATION_PLAN.md §4.1).
        const pinned = (spec.at[1] as number) * fields.width + (spec.at[0] as number);
        if (!clearOf(pinned, stampMargin)) {
          errors.push(
            `landmark slot ${slot} (${spec.type}) pinned at (${spec.at[0]}, ${spec.at[1]}): too close to another destination`,
          );
          return;
        }
        if (!stampFootprintClear(spec.type, pinned, fields, hydro, config.authoring.stamps)) {
          errors.push(
            `landmark slot ${slot} (${spec.type}) pinned at (${spec.at[0]}, ${spec.at[1]}): footprint constraints fail (water, slope, or world edge)`,
          );
          return;
        }
        chosenCells[slot] = pinned;
        return;
      }
      for (const candidate of landmarkScored) {
        if (spec.near !== null) {
          const cell = (spec.near.cell[1] as number) * fields.width + (spec.near.cell[0] as number);
          if (chebyshev(candidate.index, cell, fields.width) > spec.near.radius) {
            continue;
          }
        }
        if (!clearOf(candidate.index, stampMargin)) {
          continue;
        }
        if (spec.relation !== null) {
          if (town === undefined) {
            break;
          }
          if (
            !relationHolds(
              spec.relation,
              candidate.index,
              town.cell,
              hydro,
              fields,
              fields.width,
              config.settlements.cityPlazaRadius + config.settlements.cityStreetArmLength,
            )
          ) {
            continue;
          }
        }
        // Candidates must satisfy footprint constraints (docs/GENERATION_RULES).
        if (!stampFootprintClear(spec.type, candidate.index, fields, hydro, config.authoring.stamps)) {
          continue;
        }
        chosenCells[slot] = candidate.index;
        return;
      }
      if (spec.near !== null) {
        errors.push(
          `landmark slot ${slot} (${spec.type}) found no valid site within ${spec.near.radius} of (${spec.near.cell[0]}, ${spec.near.cell[1]})`,
        );
      } else {
        errors.push(
          spec.relation === null
            ? `landmark slot ${slot} (${spec.type}) found no valid site`
            : `landmark slot ${slot} (${spec.type}) constraint \"${spec.relation}\" is unsatisfiable in this world`,
        );
      }
    };
    const slots = Array.from({ length: config.budgets.landmarkCount }, (_, slot) => slot);
    for (const slot of slots.filter((s) => specOf(s).at !== null)) trySelect(slot);
    for (const slot of slots.filter((s) => specOf(s).at === null && specOf(s).near !== null)) trySelect(slot);
    for (const slot of slots.filter((s) => specOf(s).at === null && specOf(s).near === null)) trySelect(slot);
    for (const slot of slots) {
      const cell = chosenCells[slot];
      if (cell !== null && cell !== undefined) {
        taken.push({ id: taken.length, kind: "landmark_candidate", cell });
      }
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
  avoid?: ReadonlySet<number>,
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
      // Roads respect the ancients (routes.graph v8): future landmark stamp
      // footprints carry a heavy soft-avoid cost, so corridors route around
      // the sites instead of invalidating them.
      if (avoid !== undefined && avoid.has(neighbor)) {
        cost += 600;
      }
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
  authoredStamps?: Readonly<Record<string, unknown>>,
): boolean {
  const stamp = loadStamp(type, authoredStamps);
  const { width, height } = fields;
  const anchorX = cell % width;
  const anchorY = (cell - anchorX) / width;
  const originX = anchorX - stamp.anchorX;
  const originY = anchorY - stamp.anchorY;
  // W6 ride-along: a real interior margin keeps stamps off the world rim.
  if (originX < 4 || originY < 4 || originX + stamp.width >= width - 4 || originY + stamp.height >= height - 4) {
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

/**
 * Relational predicates for landmark placement (W5 solver). cityReach is the
 * capital's street fabric radius (plaza + arms): near_town measures from the
 * city's outskirts, not its anchor, so a grown capital (settlements.plans
 * v5) cannot render its own relation unsatisfiable.
 */
function relationHolds(
  relation: string,
  cell: number,
  townCell: number,
  hydro: HydrologyResult,
  fields: MacroFields,
  width: number,
  cityReach: number,
): boolean {
  const distance = chebyshev(cell, townCell, width);
  if (relation === "near_town") {
    return distance <= Math.trunc(width / 5) + cityReach;
  }
  if (relation === "high_ground") {
    // The mountain relation (routes.graph v4): the site sits high — where
    // the rock masses live — and clear of the capital's sprawl.
    return (fields.elevation[cell] as number) >= 600 && distance >= Math.trunc(width / 6);
  }
  if (relation === "coastal") {
    // The shore relation (routes.graph v5): near the sea but with enough
    // dry ground behind it for the stamp footprint.
    const coast = hydro.coastDistance[cell] as number;
    return coast >= 4 && coast <= 8;
  }
  if (relation === "remote_corner") {
    // The back-country relation (routes.graph v6): the site sits in the
    // quarter of the map whose corner lies farthest from the capital —
    // and its trail becomes the road into the emptiest quadrant.
    const far = remoteCorner(townCell, width);
    const cx = cell % width;
    const cy = Math.trunc(cell / width);
    return Math.max(Math.abs(cx - far[0]), Math.abs(cy - far[1])) <= Math.trunc(width / 4);
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
