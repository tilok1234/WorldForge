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
import type { SettlementPlan } from "./settlements.js";

/** Crop layer: 0 = none, else cropTypeIndex * 16 + stage (stage 1-4). */
export const CROP_TYPES = ["crop.wheat", "crop.pumpkin", "crop.corn"] as const;
/** Fence layer: 0 = none, else 1-based index into FENCE_TYPES. */
export const FENCE_TYPES = ["fence.pen", "fence.iron"] as const;
/** Pier layer: 0 = none, else 1-based index into PIER_TYPES. */
export const PIER_TYPES = ["pier.pier"] as const;

export interface FarmResult {
  readonly cropLayer: Uint8Array;
  readonly fenceLayer: Uint8Array;
  readonly pierLayer: Uint8Array;
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
): FarmResult {
  const { width, height } = config.world;
  const cellCount = width * height;
  const cropLayer = new Uint8Array(cellCount);
  const fenceLayer = new Uint8Array(cellCount);
  const pierLayer = new Uint8Array(cellCount);
  let cropCells = 0;
  let fenceCells = 0;
  let pierCells = 0;
  const farms = channel(config.seed, "settlements.farms");
  const harbor = channel(config.seed, "settlements.harbor");

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
            const cropType = 1 + farms.intAt(originX, originY, 0, CROP_TYPES.length, 2);
            const stage = 2 + farms.intAt(originX, originY, 0, 2, 3); // young or mature
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
                  fenceLayer[cell] = 1;
                  fenceCells += 1;
                }
              }
            }
            for (let sy = 0; sy < plotH; sy += 1) {
              for (const sx of [-1, plotW]) {
                const cell = cellAt(originX + sx, originY + sy, width, height);
                if (cell !== -1 && fenceLayer[cell] === 0 && usable(cell) && cropLayer[cell] === 0) {
                  fenceLayer[cell] = 1;
                  fenceCells += 1;
                }
              }
            }
            plots += 1;
          }
        }
      }
    }

    if (plan.purpose === "harbor") {
      // One straight pier from the nearest shore cell into open water.
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
          pierLayer[cell] = 1;
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

  return { cropLayer, fenceLayer, pierLayer, cropCells, fenceCells, pierCells };
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
