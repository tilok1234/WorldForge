/**
 * Farm plots and harbor piers (settlements.plans v3, alive-worlds stage 3).
 *
 * Farming settlements plant fenced crop plots beside their farmhouse; harbor
 * settlements build a pier into open water with working clutter around it.
 * Both are settlement infrastructure: they run after structure placement and
 * before decoration (which treats their cells as occupied), never touch
 * corridors, crossings, structures, or entrances, and draw from named
 * channels so plot shapes never reshuffle other passes.
 */

import { channel } from "../core/channels.js";
import { PALETTE_INDEX } from "../regions/biomes.js";
import { WATER_NONE, type HydrologyResult } from "../hydrology/hydrology.js";
import type { ResolvedWorldConfig } from "../recipe/compile.js";
import type { SettlementPlan, SettlementQuarter } from "./settlements.js";

/** Crop layer: 0 = none, else cropTypeIndex * 16 + stage (stage 1-4). */
// Grapes (behavior 64) only join the roll in warm country — see
// GRAPES_MIN_TEMPERATURE below; colder worlds keep the pre-64 pool and
// their exact rolls.
export const CROP_TYPES = ["crop.wheat", "crop.pumpkin", "crop.corn", "crop.grapes"] as const;
/** Fence layer: 0 = none, else 1-based index into FENCE_TYPES. */
// fence.wood (behavior 64): the plain wooden fence vineyards ring.
// fence.hedge (behavior 65): the clipped hedge walling city garden greens.
export const FENCE_TYPES = ["fence.pen", "fence.iron", "fence.wood", "fence.hedge"] as const;

/**
 * Vineyards want sun: the world's temperature offset (climate base +
 * author bias) must reach warm-vale's +40 before grapes join the crop
 * roll. Neutral temperate and colder worlds roll the pre-64 pool
 * byte-identically.
 */
const GRAPES_MIN_TEMPERATURE = 40;
/** Pier layer: 0 = none, else 1-based index into PIER_TYPES. */
// Harbor row (behavior 63): city harbors build in stone — the package's
// jetty family; towns and outposts keep the wooden pier.
export const PIER_TYPES = ["pier.pier", "pier.jetty"] as const;

/** A placed chicken run (behavior 64): decoration seats the furniture. */
export interface PenPlan {
  readonly coop: readonly [number, number];
  readonly trough: readonly [number, number];
}

/**
 * A hedged garden green (behavior 65). Recorded only when the hedge ring
 * had to carve its own gate — the urns flank that gate on the inside;
 * street-crossed greens keep their crossings as plain openings.
 */
export interface GardenPlan {
  readonly urns: readonly (readonly [number, number])[];
}

/** A planted orchard (behavior 67): decoration seats trees and furniture. */
export interface OrchardPlan {
  /** Interior origin; the stand spans 7x5 from here (ring one cell out). */
  readonly origin: readonly [number, number];
  /** The three access-apron cells outside the gate, on whichever side
   *  the gate opened (behavior 68: the gate follows the road) —
   *  lane-touching by construction; decoration protects them. */
  readonly apron: readonly (readonly [number, number])[];
  readonly trees: readonly (readonly [number, number])[];
  readonly beehive: readonly [number, number];
  readonly baskets: readonly [number, number];
}

export interface FarmResult {
  readonly cropLayer: Uint8Array;
  readonly fenceLayer: Uint8Array;
  readonly pierLayer: Uint8Array;
  readonly pens: readonly PenPlan[];
  readonly gardens: readonly GardenPlan[];
  readonly orchards: readonly OrchardPlan[];
  readonly cropCells: number;
  readonly fenceCells: number;
  readonly pierCells: number;
}

const GRASS = PALETTE_INDEX["terrain.grass"];
const DRY_GRASS = PALETTE_INDEX["terrain.dry_grass"];
const COBBLE = PALETTE_INDEX["terrain.cobble"];
const PACKED_ROAD = PALETTE_INDEX["terrain.packed_road"];

export function planFarmsAndPiers(
  grid: readonly number[],
  structureLayer: Uint8Array,
  hydro: HydrologyResult,
  pathLayer: Uint8Array,
  settlementPlans: readonly SettlementPlan[],
  config: ResolvedWorldConfig,
  laneCells: readonly number[] = [],
  quarters: readonly SettlementQuarter[] = [],
): FarmResult {
  const { width, height } = config.world;
  const cellCount = width * height;
  const cropLayer = new Uint8Array(cellCount);
  const fenceLayer = new Uint8Array(cellCount);
  const pierLayer = new Uint8Array(cellCount);
  const pens: PenPlan[] = [];
  const gardens: GardenPlan[] = [];
  const orchards: OrchardPlan[] = [];
  let cropCells = 0;
  let fenceCells = 0;
  let pierCells = 0;
  const farms = channel(config.seed, "settlements.farms");
  const harbor = channel(config.seed, "settlements.harbor");
  // Warm worlds roll grapes too; everyone else keeps the pre-64 pool (and
  // with it their exact pre-64 rolls — the pool size feeds the channel).
  const cropPool =
    config.climate.baseTemperaturePermille + config.climate.temperatureBiasPermille >= GRAPES_MIN_TEMPERATURE
      ? CROP_TYPES.length
      : CROP_TYPES.length - 1;

  // Worn/unpainted approach lanes (behavior 50) are corridor promises like
  // pathLayer: no crops or fences on somebody's way to their door.
  const laneSet = new Set(laneCells);
  const usable = (index: number): boolean =>
    structureLayer[index] === 0 &&
    pathLayer[index] === 0 &&
    !laneSet.has(index) &&
    hydro.waterKind[index] === WATER_NONE &&
    hydro.isRiver[index] === 0 &&
    grid[index] !== COBBLE &&
    grid[index] !== PACKED_ROAD &&
    (grid[index] === GRASS || grid[index] === DRY_GRASS);

  for (const plan of settlementPlans) {
    if (plan.purpose === "farming") {
      const anchorFarm = plan.structures.find(
        (s) => s.type === "structure.farmhouse" || s.type === "structure.barn",
      );
      const nearX = anchorFarm === undefined ? plan.anchorX : anchorFarm.x;
      const nearY = anchorFarm === undefined ? plan.anchorY : anchorFarm.y;
      let plots = 0;
      // Scan outward for plot origins; two plots per farming settlement.
      for (let ring = 2; ring <= plan.radius + 4 && plots < 2; ring += 1) {
        for (let dy = -ring; dy <= ring && plots < 2; dy += 1) {
          for (let dx = -ring; dx <= ring && plots < 2; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            const originX = nearX + dx;
            const originY = nearY + dy;
            const plotW = 4 + farms.intAt(originX, originY, 0, 3, 0);
            const plotH = 3 + farms.intAt(originX, originY, 0, 2, 1);
            if (!plotFits(originX, originY, plotW, plotH, width, height, usable, fenceLayer)) {
              continue;
            }
            const cropType = 1 + farms.intAt(originX, originY, 0, cropPool, 2);
            const stage = 2 + farms.intAt(originX, originY, 0, 2, 3); // young or mature
            // A grape plot is a VINEYARD (behavior 64): it rings itself in
            // plain wood, not livestock pen fencing.
            const fenceType = cropType === CROP_TYPES.length ? 3 : 1;
            for (let sy = 0; sy < plotH; sy += 1) {
              for (let sx = 0; sx < plotW; sx += 1) {
                const cell = (originY + sy) * width + originX + sx;
                cropLayer[cell] = cropType * 16 + stage;
                cropCells += 1;
              }
            }
            // Pen fence around the plot with a two-cell gate on the side
            // facing the farmstead (fences block; the gate keeps the plot
            // walkable).
            const gateSide = nearY <= originY ? -1 : plotH; // face the farm
            const gateStart = Math.trunc(plotW / 2) - 1;
            for (let sx = -1; sx <= plotW; sx += 1) {
              for (const sy of [-1, plotH]) {
                if (sy === gateSide && sx >= gateStart && sx <= gateStart + 1) continue;
                const cell = cellAt(originX + sx, originY + sy, width, height);
                if (cell !== -1 && fenceLayer[cell] === 0 && usable(cell) && cropLayer[cell] === 0) {
                  fenceLayer[cell] = fenceType;
                  fenceCells += 1;
                }
              }
            }
            for (let sy = 0; sy < plotH; sy += 1) {
              for (const sx of [-1, plotW]) {
                const cell = cellAt(originX + sx, originY + sy, width, height);
                if (cell !== -1 && fenceLayer[cell] === 0 && usable(cell) && cropLayer[cell] === 0) {
                  fenceLayer[cell] = fenceType;
                  fenceCells += 1;
                }
              }
            }
            plots += 1;
          }
        }
      }
      // Chicken run (behavior 64): one small pen beside the farmstead —
      // a 3x2 yard ringed in pen fence with a single gate facing the
      // farm; the coop stands in the corner farthest from the gate and
      // the trough waits inside by it (decoration seats both props off
      // the pens list). Strict fit: the whole 5x4 footprint must be
      // usable, so the ring stamps without per-cell fallbacks.
      let penPlaced = false;
      for (let ring = 2; ring <= plan.radius + 4 && !penPlaced; ring += 1) {
        for (let dy = -ring; dy <= ring && !penPlaced; dy += 1) {
          for (let dx = -ring; dx <= ring && !penPlaced; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            const originX = nearX + dx;
            const originY = nearY + dy;
            let fits = true;
            for (let sy = -1; sy <= 2 && fits; sy += 1) {
              for (let sx = -1; sx <= 3 && fits; sx += 1) {
                const cell = cellAt(originX + sx, originY + sy, width, height);
                if (cell === -1 || !usable(cell) || fenceLayer[cell] !== 0 || cropLayer[cell] !== 0) {
                  fits = false;
                }
              }
            }
            if (!fits) continue;
            const gateSide = nearY <= originY ? -1 : 2; // face the farm
            for (let sy = -1; sy <= 2; sy += 1) {
              for (let sx = -1; sx <= 3; sx += 1) {
                const onRing = sy === -1 || sy === 2 || sx === -1 || sx === 3;
                if (!onRing) continue;
                if (sy === gateSide && sx === 1) continue; // the gate
                const cell = cellAt(originX + sx, originY + sy, width, height);
                if (cell !== -1) {
                  fenceLayer[cell] = 1;
                  fenceCells += 1;
                }
              }
            }
            pens.push({
              coop: [originX + 2, gateSide === -1 ? originY + 1 : originY],
              trough: [originX + 1, gateSide === -1 ? originY : originY + 1],
            });
            penPlaced = true;
          }
        }
      }
      // Orchard (behavior 67; gate reworked by 68): one fruit-tree stand
      // beside the farmstead — six trees in spaced rows inside a 7x5
      // clearing, ringed in the plain wood family (b64 vineyards) with a
      // two-cell gate; a beehive works the corner farthest from the gate
      // and the pickers' baskets wait inside it (decoration seats every
      // prop off the orchards list). Strict fit like the chicken run —
      // the whole 9x7 envelope must be usable — PLUS the access
      // guarantee: the three-cell apron outside the gate must touch the
      // settlement's lane/path network (chebyshev <= 1). Lanes are
      // ambient-protected, so gate -> cleared apron -> lane -> corridor
      // network always walks in the final world; a stand that would sit
      // in a hole in the woods is refused (the b67 first cut seated one
      // that ambient forest sealed shut — no road never means no route,
      // b50). THE GATE FOLLOWS THE ROAD (behavior 68, round-19 ruling
      // "needs an entrance where the road goes into it"): any of the
      // four sides may carry the gate — the side with the most
      // lane-touching apron cells wins, ties prefer facing the farm,
      // then the fixed order N/S/W/E. Cramped or laneless farms simply
      // go without. Roll-free: fixed shape, no channel draws — every
      // pre-67 roll stays byte-identical.
      const onLane = (cell: number): boolean => pathLayer[cell] !== 0 || laneSet.has(cell);
      // Per side: the two ring-relative gate cells, the three apron
      // cells two steps out, the basket cell inside the gate, and the
      // beehive corner farthest from it (interior coordinates).
      const GATE_SIDES = [
        { name: "n", gate: [[3, -1], [4, -1]], apron: [[2, -2], [3, -2], [4, -2]], baskets: [3, 0], beehive: [0, 4] },
        { name: "s", gate: [[3, 5], [4, 5]], apron: [[2, 6], [3, 6], [4, 6]], baskets: [3, 4], beehive: [0, 0] },
        { name: "w", gate: [[-1, 2], [-1, 3]], apron: [[-2, 1], [-2, 2], [-2, 3]], baskets: [0, 2], beehive: [6, 4] },
        { name: "e", gate: [[7, 2], [7, 3]], apron: [[8, 1], [8, 2], [8, 3]], baskets: [6, 2], beehive: [0, 4] },
      ] as const;
      let orchardPlaced = false;
      for (let ring = 2; ring <= plan.radius + 4 && !orchardPlaced; ring += 1) {
        for (let dy = -ring; dy <= ring && !orchardPlaced; dy += 1) {
          for (let dx = -ring; dx <= ring && !orchardPlaced; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            const originX = nearX + dx;
            const originY = nearY + dy;
            let fits = true;
            for (let sy = -1; sy <= 5 && fits; sy += 1) {
              for (let sx = -1; sx <= 7 && fits; sx += 1) {
                const cell = cellAt(originX + sx, originY + sy, width, height);
                if (cell === -1 || !usable(cell) || fenceLayer[cell] !== 0 || cropLayer[cell] !== 0) {
                  fits = false;
                }
              }
            }
            if (!fits) continue;
            // Score every side: viable = clear apron with lane contact.
            const towardFarm =
              Math.abs(nearY - (originY + 2)) >= Math.abs(nearX - (originX + 3))
                ? nearY <= originY + 2 ? "n" : "s"
                : nearX <= originX + 3 ? "w" : "e";
            let best: (typeof GATE_SIDES)[number] | null = null;
            let bestScore = 0;
            for (const side of GATE_SIDES) {
              let apronOk = true;
              let contacts = 0;
              for (const [ax, ay] of side.apron) {
                const cell = cellAt(originX + ax, originY + ay, width, height);
                if (
                  cell === -1 ||
                  structureLayer[cell] !== 0 ||
                  hydro.waterKind[cell] !== WATER_NONE ||
                  hydro.isRiver[cell] !== 0 ||
                  fenceLayer[cell] !== 0 ||
                  cropLayer[cell] !== 0
                ) {
                  apronOk = false;
                  break;
                }
                let touched = false;
                for (let ny = originY + ay - 1; ny <= originY + ay + 1 && !touched; ny += 1) {
                  for (let nx = originX + ax - 1; nx <= originX + ax + 1 && !touched; nx += 1) {
                    const near = cellAt(nx, ny, width, height);
                    if (near !== -1 && onLane(near)) touched = true;
                  }
                }
                if (touched) contacts += 1;
              }
              if (!apronOk || contacts === 0) continue;
              const score = contacts * 2 + (side.name === towardFarm ? 1 : 0);
              if (score > bestScore) {
                bestScore = score;
                best = side;
              }
            }
            if (best === null) continue;
            const gateCells = new Set(
              best.gate.map(([gx, gy]) => (originY + gy) * width + originX + gx),
            );
            for (let sy = -1; sy <= 5; sy += 1) {
              for (let sx = -1; sx <= 7; sx += 1) {
                const onRing = sy === -1 || sy === 5 || sx === -1 || sx === 7;
                if (!onRing) continue;
                const cell = cellAt(originX + sx, originY + sy, width, height);
                if (cell === -1 || gateCells.has(cell)) continue;
                fenceLayer[cell] = 3; // fence.wood
                fenceCells += 1;
              }
            }
            const trees: Array<readonly [number, number]> = [];
            for (const sy of [1, 3]) {
              for (const sx of [1, 3, 5]) {
                trees.push([originX + sx, originY + sy]);
              }
            }
            orchards.push({
              origin: [originX, originY],
              apron: best.apron.map(([ax, ay]) => [originX + ax, originY + ay] as const),
              trees,
              beehive: [originX + best.beehive[0], originY + best.beehive[1]],
              baskets: [originX + best.baskets[0], originY + best.baskets[1]],
            });
            orchardPlaced = true;
          }
        }
      }
    }

    if (plan.purpose === "harbor") {
      // One straight pier from the nearest shore cell into open water. City
      // harbors lay theirs in stone (behavior 63 jetty); lesser holds in wood.
      const pierType = plan.kind === "city" ? 2 : 1;
      const shore = findShore(plan.anchorX, plan.anchorY, plan.radius + 6, grid, hydro, width, height);
      if (shore !== null) {
        const [shoreCell, dx, dy] = shore;
        const shoreX = shoreCell % width;
        const shoreY = (shoreCell - shoreX) / width;
        const length = 3 + harbor.intAt(shoreX, shoreY, 0, 3, 0);
        let placed = 0;
        for (let step = 1; step <= length; step += 1) {
          const cell = cellAt(shoreX + dx * step, shoreY + dy * step, width, height);
          if (cell === -1 || hydro.waterKind[cell] === WATER_NONE) break;
          pierLayer[cell] = pierType;
          pierCells += 1;
          placed += 1;
        }
        if (placed === 0) {
          // No water run: drop the stub so no orphan single pier cell shows.
          for (let step = 1; step <= length; step += 1) {
            const cell = cellAt(shoreX + dx * step, shoreY + dy * step, width, height);
            if (cell !== -1) pierLayer[cell] = 0;
          }
        }
      }
    }
  }

  // Garden greens (behavior 65): city green quarters wall themselves in
  // clipped hedge. Streets, lanes, and anything already standing break
  // the ring exactly like the city wall does — the behavior-47 no-sever
  // laws outrank the hedge. A green nothing crosses carves its own gate
  // (mid-side, first side whose outside neighbor is open ground) and
  // reports the gate's inside flanks so decoration can seat the planter
  // urns there.
  const HEDGE = 4;
  for (const quarter of quarters) {
    if (quarter.kind !== "green") continue;
    const openings: Array<readonly [number, number]> = [];
    let stamped = 0;
    for (let sy = 0; sy < quarter.h; sy += 1) {
      for (let sx = 0; sx < quarter.w; sx += 1) {
        const onFrame = sy === 0 || sy === quarter.h - 1 || sx === 0 || sx === quarter.w - 1;
        if (!onFrame) continue;
        const cell = cellAt(quarter.x + sx, quarter.y + sy, width, height);
        if (cell === -1) continue;
        if (pathLayer[cell] !== 0 || laneSet.has(cell)) {
          openings.push([sx, sy]);
          continue;
        }
        if (
          structureLayer[cell] !== 0 ||
          fenceLayer[cell] !== 0 ||
          cropLayer[cell] !== 0 ||
          hydro.waterKind[cell] !== WATER_NONE ||
          hydro.isRiver[cell] !== 0 ||
          (grid[cell] !== GRASS && grid[cell] !== DRY_GRASS)
        ) {
          continue;
        }
        fenceLayer[cell] = HEDGE;
        fenceCells += 1;
        stamped += 1;
      }
    }
    if (stamped === 0 || openings.length > 0) continue;
    // Fully walled: carve a gate. Sides in fixed order (S, N, E, W); the
    // first whose mid frame cell holds our hedge and whose outside
    // neighbor is open walkable ground wins.
    const midX = quarter.x + Math.trunc(quarter.w / 2);
    const midY = quarter.y + Math.trunc(quarter.h / 2);
    const sides: ReadonlyArray<readonly [number, number, number, number]> = [
      [midX, quarter.y + quarter.h - 1, 0, 1],
      [midX, quarter.y, 0, -1],
      [quarter.x + quarter.w - 1, midY, 1, 0],
      [quarter.x, midY, -1, 0],
    ];
    for (const [gx, gy, ox, oy] of sides) {
      const gate = cellAt(gx, gy, width, height);
      const outside = cellAt(gx + ox, gy + oy, width, height);
      if (gate === -1 || outside === -1) continue;
      if (fenceLayer[gate] !== HEDGE) continue;
      if (
        structureLayer[outside] !== 0 ||
        fenceLayer[outside] !== 0 ||
        hydro.waterKind[outside] !== WATER_NONE ||
        hydro.isRiver[outside] !== 0
      ) {
        continue;
      }
      fenceLayer[gate] = 0;
      fenceCells -= 1;
      // Urns flank the gate on the garden side, perpendicular to the way in.
      const inX = gx - ox;
      const inY = gy - oy;
      const urns: Array<readonly [number, number]> = [];
      for (const [px, py] of [
        [inX + oy, inY + ox],
        [inX - oy, inY - ox],
      ] as const) {
        if (px > quarter.x && px < quarter.x + quarter.w - 1 && py > quarter.y && py < quarter.y + quarter.h - 1) {
          urns.push([px, py]);
        }
      }
      gardens.push({ urns });
      break;
    }
  }

  return { cropLayer, fenceLayer, pierLayer, pens, gardens, orchards, cropCells, fenceCells, pierCells };
}

function plotFits(
  originX: number,
  originY: number,
  plotW: number,
  plotH: number,
  width: number,
  height: number,
  usable: (index: number) => boolean,
  fenceLayer: Uint8Array,
): boolean {
  // The plot plus its fence ring must be fully usable (fences block, so the
  // ring also stays off anything traversal-critical).
  for (let sy = -1; sy <= plotH; sy += 1) {
    for (let sx = -1; sx <= plotW; sx += 1) {
      const cell = cellAt(originX + sx, originY + sy, width, height);
      if (cell === -1 || !usable(cell) || fenceLayer[cell] !== 0) {
        return false;
      }
    }
  }
  return true;
}

/** Nearest land cell cardinally adjacent to standing water, with direction. */
function findShore(
  anchorX: number,
  anchorY: number,
  maxRadius: number,
  grid: readonly number[],
  hydro: HydrologyResult,
  width: number,
  height: number,
): readonly [number, number, number] | null {
  for (let ring = 1; ring <= maxRadius; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const cell = cellAt(anchorX + dx, anchorY + dy, width, height);
        if (cell === -1 || hydro.waterKind[cell] !== WATER_NONE) continue;
        for (const [ox, oy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
          const neighbor = cellAt(anchorX + dx + ox, anchorY + dy + oy, width, height);
          if (neighbor !== -1 && hydro.waterKind[neighbor] !== WATER_NONE && hydro.isRiver[neighbor] === 0) {
            return [cell, ox, oy];
          }
        }
      }
    }
  }
  return null;
}

function cellAt(x: number, y: number, width: number, height: number): number {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return -1;
  }
  return y * width + x;
}
