/**
 * Settlement planner (docs/ARCHITECTURE_AND_CONTRACTS.md, component 8;
 * Milestone W5). The first (best-scored) candidate becomes the town, the rest
 * outposts. Purposes derive from geography; plazas and settlement streets are
 * cobble areas per the corridor doctrine; structures place atomically with a
 * one-cell gap, entrances face the street network, and approaches are carved
 * as cobble so every entrance joins required traversal.
 */

import type { ResolvedWorldConfig } from "../recipe/compile.js";
import type { HydrologyResult } from "../hydrology/hydrology.js";
import { WATER_NONE } from "../hydrology/hydrology.js";
import type { MacroFields } from "../fields/macroFields.js";
import type { RoutesResult } from "../routes/routes.js";
import { PALETTE_INDEX } from "../regions/biomes.js";
import { channel } from "../core/channels.js";
import {
  STRUCTURE_FOOTPRINTS,
  STRUCTURE_LAYER_VALUE,
  type StructureType,
} from "./structures.js";

/**
 * settlements.plans v4: towns lead with civic specials and market stalls,
 * then fill from a rolled village mix along the plaza and street arms.
 */
const TOWN_SPECIALS: readonly StructureType[] = [
  "structure.town_hall",
  "structure.tavern",
  "structure.smithy",
  "structure.stall",
  "structure.stall",
  "structure.chapel",
  "structure.manor",
  "structure.bakery",
];
const TOWN_FILL: readonly { readonly type: StructureType; readonly weight: number }[] = [
  { type: "structure.cottage", weight: 40 },
  { type: "structure.house", weight: 28 },
  { type: "structure.bakery", weight: 10 },
  { type: "structure.stall", weight: 8 },
  { type: "structure.tavern", weight: 6 },
  { type: "structure.well", weight: 8 },
];
const OUTPOST_SEQUENCES: { readonly [key in SettlementPlan["purpose"]]: readonly StructureType[] } = {
  farming: ["structure.farmhouse", "structure.barn", "structure.stall", "structure.cottage", "structure.cottage", "structure.well"],
  mining: ["structure.watchtower", "structure.cottage", "structure.stall", "structure.cottage", "structure.house", "structure.well"],
  harbor: ["structure.watchtower", "structure.cottage", "structure.stall", "structure.cottage", "structure.house", "structure.well"],
  crossing: ["structure.watchtower", "structure.tavern", "structure.cottage", "structure.cottage", "structure.house", "structure.well"],
  waypoint: ["structure.watchtower", "structure.cottage", "structure.cottage", "structure.cottage", "structure.house", "structure.well"],
};

const COBBLE = PALETTE_INDEX["terrain.cobble"];
const PACKED_ROAD = PALETTE_INDEX["terrain.packed_road"];
const GRASS = PALETTE_INDEX["terrain.grass"];
const ROCK = PALETTE_INDEX["terrain.rock"];
const DEEP = PALETTE_INDEX["water.deep"];
const SHALLOW = PALETTE_INDEX["water.shallow"];

export interface PlacedStructure {
  readonly type: StructureType;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly entranceX: number;
  readonly entranceY: number;
}

export interface SettlementPlan {
  readonly id: number;
  readonly kind: "town" | "outpost";
  readonly anchorX: number;
  readonly anchorY: number;
  readonly purpose: "harbor" | "crossing" | "farming" | "mining" | "waypoint";
  readonly radius: number;
  readonly structures: readonly PlacedStructure[];
}

export function planSettlements(
  grid: number[],
  structureLayer: Uint8Array,
  fields: MacroFields,
  hydro: HydrologyResult,
  routes: RoutesResult,
  config: ResolvedWorldConfig,
  errors: string[],
): SettlementPlan[] {
  const { width, height } = fields;
  const rules = config.settlements;
  const plans: SettlementPlan[] = [];
  const candidates = routes.destinations.filter((d) => d.kind === "settlement_candidate");

  for (let rank = 0; rank < candidates.length; rank += 1) {
    const anchor = (candidates[rank] as { cell: number }).cell;
    const anchorX = anchor % width;
    const anchorY = (anchor - anchorX) / width;
    const kind = rank === 0 ? "town" : "outpost";
    const radius = kind === "town" ? rules.townRadius : rules.outpostRadius;

    const purpose = derivePurpose(anchorX, anchorY, radius, grid, hydro, width, height);

    // Plaza and settlement streets are cobble areas (band-free doctrine).
    const plazaRadius = kind === "town" ? rules.townPlazaRadius : rules.outpostPlazaRadius;
    for (let dy = -plazaRadius; dy <= plazaRadius; dy += 1) {
      for (let dx = -plazaRadius; dx <= plazaRadius; dx += 1) {
        const cell = cellAt(anchorX + dx, anchorY + dy, width, height);
        if (cell !== -1 && isOpenLand(cell, grid, hydro)) {
          grid[cell] = COBBLE;
        }
      }
    }
    // Street arms (v4): two-cell-wide cobble streets radiate from the plaza
    // so buildings line them and the settlement reads as connected fabric.
    // Streams interrupt an arm without stopping it — the gap cells become
    // street fords downstream.
    if (kind === "town") {
      for (const [dirX, dirY] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        let skippedWet = 0;
        for (let step = plazaRadius + 1; step <= plazaRadius + rules.streetArmLength; step += 1) {
          const armX = anchorX + dirX * step;
          const armY = anchorY + dirY * step;
          const lane = cellAt(armX, armY, width, height);
          const side = cellAt(armX + Math.abs(dirY), armY + Math.abs(dirX), width, height);
          if (lane === -1) break;
          if (!isOpenLand(lane, grid, hydro) && grid[lane] !== COBBLE && grid[lane] !== PACKED_ROAD) {
            // A stream or pond: allow a short gap, stop at real water bodies.
            if (hydro.isRiver[lane] === 1 && skippedWet < 2) {
              skippedWet += 1;
              continue;
            }
            break;
          }
          skippedWet = 0;
          if (isOpenLand(lane, grid, hydro)) grid[lane] = COBBLE;
          if (side !== -1 && isOpenLand(side, grid, hydro)) grid[side] = COBBLE;
        }
      }
    }
    // Settlement streets: the road cells connected to the plaza, converted
    // contiguously so no isolated cobble islands appear in corridor runs.
    {
      const queue: number[] = [];
      const seen = new Set<number>();
      for (let dy = -plazaRadius; dy <= plazaRadius; dy += 1) {
        for (let dx = -plazaRadius; dx <= plazaRadius; dx += 1) {
          const cell = cellAt(anchorX + dx, anchorY + dy, width, height);
          if (cell !== -1 && (grid[cell] === COBBLE || grid[cell] === PACKED_ROAD)) {
            queue.push(cell);
            seen.add(cell);
          }
        }
      }
      for (let head = 0; head < queue.length; head += 1) {
        const cell = queue[head] as number;
        if (grid[cell] === PACKED_ROAD) {
          grid[cell] = COBBLE;
        }
        const x = cell % width;
        const y = (cell - x) / width;
        if (Math.max(Math.abs(x - anchorX), Math.abs(y - anchorY)) >= radius) {
          continue;
        }
        for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
          const next = cellAt(x + dx, y + dy, width, height);
          if (next !== -1 && !seen.has(next) && (grid[next] === PACKED_ROAD || grid[next] === COBBLE)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
    }

    // Structures spiral outward from the plaza in deterministic ring order.
    // Towns lead with civic specials then a channel-rolled village mix;
    // outposts follow their purpose (settlements.plans v2, the W5.1 brief).
    const variety = channel(config.seed, "settlements.variety");
    let sequence: StructureType[];
    if (kind === "town") {
      sequence = [...TOWN_SPECIALS.slice(0, Math.min(TOWN_SPECIALS.length, rules.townLots))];
      for (let slot = sequence.length; slot < rules.townLots; slot += 1) {
        const pick = variety.weightedPickAt(anchorX, anchorY, TOWN_FILL.map((f) => f.weight), slot);
        sequence.push((TOWN_FILL[pick] as { type: StructureType }).type);
      }
    } else {
      const pool = OUTPOST_SEQUENCES[purpose];
      sequence = Array.from(
        { length: rules.outpostLots },
        (_, slot) => pool[Math.min(slot, pool.length - 1)] as StructureType,
      );
    }
    const placed: PlacedStructure[] = [];

    if (kind === "town") {
      // Plaza legibility (W5.1): the fountain anchors the square. Its 2x2
      // footprint centers on the plaza; the south-side cobble is the
      // approach. Falls back to the classic well if the plaza is clipped.
      const fountainOrigin = cellAt(anchorX - 1, anchorY - 1, width, height);
      let fountainDown = false;
      if (fountainOrigin !== -1) {
        let clear = true;
        for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
          const cell = cellAt(anchorX - 1 + sx, anchorY - 1 + sy, width, height);
          if (cell === -1 || grid[cell] !== COBBLE || structureLayer[cell] !== 0) {
            clear = false;
            break;
          }
        }
        if (clear) {
          // The entrance is whichever perimeter cell already joins the
          // street network (plazas can be clipped by streams).
          let entrance = -1;
          const perimeter: (readonly [number, number])[] = [];
          for (let sx = -1; sx <= 2; sx += 1) perimeter.push([anchorX - 1 + sx, anchorY + 1]);
          for (let sy = -1; sy <= 2; sy += 1) perimeter.push([anchorX + 1, anchorY - 1 + sy]);
          for (let sx = -1; sx <= 2; sx += 1) perimeter.push([anchorX - 1 + sx, anchorY - 2]);
          for (let sy = -1; sy <= 2; sy += 1) perimeter.push([anchorX - 2, anchorY - 1 + sy]);
          for (const [px, py] of perimeter) {
            const cell = cellAt(px, py, width, height);
            if (cell !== -1 && structureLayer[cell] === 0 && (grid[cell] === COBBLE || grid[cell] === PACKED_ROAD)) {
              entrance = cell;
              break;
            }
          }
          if (entrance !== -1) {
            for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
              const cell = (anchorY - 1 + sy) * width + anchorX - 1 + sx;
              structureLayer[cell] = STRUCTURE_LAYER_VALUE["structure.fountain"];
            }
            placed.push({
              type: "structure.fountain",
              x: anchorX - 1,
              y: anchorY - 1,
              width: 2,
              height: 2,
              entranceX: entrance % width,
              entranceY: Math.trunc(entrance / width),
            });
            fountainDown = true;
          }
        }
      }
      if (!fountainDown) {
        const wellCell = cellAt(anchorX, anchorY, width, height);
        if (wellCell !== -1 && grid[wellCell] === COBBLE && structureLayer[wellCell] === 0) {
          structureLayer[wellCell] = STRUCTURE_LAYER_VALUE["structure.well"];
          placed.push({
            type: "structure.well",
            x: anchorX,
            y: anchorY,
            width: 1,
            height: 1,
            entranceX: anchorX,
            entranceY: anchorY,
          });
        }
      }
    }

    let sequenceIndex = 0;
    outer: for (let ring = plazaRadius + 1; ring <= radius && sequenceIndex < sequence.length; ring += 1) {
      for (let dy = -ring; dy <= ring && sequenceIndex < sequence.length; dy += 1) {
        for (let dx = -ring; dx <= ring && sequenceIndex < sequence.length; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) {
            continue;
          }
          const type = sequence[sequenceIndex] as StructureType;
          const footprint = STRUCTURE_FOOTPRINTS[type];
          if (footprint === undefined) {
            sequenceIndex += 1;
            continue;
          }
          const [fw, fh] = footprint;
          const originX = anchorX + dx;
          const originY = anchorY + dy;
          if (!footprintFits(originX, originY, fw, fh, grid, structureLayer, hydro, width, height)) {
            continue;
          }
          // Stamp provisionally; a placement whose entrance cannot join the
          // street network is rolled back and the ring scan continues.
          const savedMaterial: number[] = [];
          for (let sy = 0; sy < fh; sy += 1) {
            for (let sx = 0; sx < fw; sx += 1) {
              const cell = (originY + sy) * width + originX + sx;
              savedMaterial.push(grid[cell] as number);
              structureLayer[cell] = STRUCTURE_LAYER_VALUE[type];
              grid[cell] = COBBLE;
            }
          }
          const entranceX = originX + Math.trunc(fw / 2);
          const entranceY = originY + fh;
          const connected = carveApproach(entranceX, entranceY, grid, structureLayer, hydro, rules.approachMaxLength, width, height);
          if (!connected) {
            let restore = 0;
            for (let sy = 0; sy < fh; sy += 1) {
              for (let sx = 0; sx < fw; sx += 1) {
                const cell = (originY + sy) * width + originX + sx;
                structureLayer[cell] = 0;
                grid[cell] = savedMaterial[restore] as number;
                restore += 1;
              }
            }
            continue;
          }
          placed.push({ type, x: originX, y: originY, width: fw, height: fh, entranceX, entranceY });
          sequenceIndex += 1;
          if (sequenceIndex >= sequence.length) {
            break outer;
          }
        }
      }
    }

    const required = sequence[0] as StructureType;
    if (!placed.some((structure) => structure.type === required)) {
      errors.push(`settlement ${rank} (${kind}) could not place its required ${required}`);
    }

    plans.push({ id: rank, kind, anchorX, anchorY, purpose, radius, structures: placed });
  }
  return plans;
}

function derivePurpose(
  anchorX: number,
  anchorY: number,
  radius: number,
  grid: readonly number[],
  hydro: HydrologyResult,
  width: number,
  height: number,
): SettlementPlan["purpose"] {
  const anchor = anchorY * width + anchorX;
  const coast = hydro.coastDistance[anchor] as number;
  if (coast >= 0 && coast <= radius + 4 && hydro.oceanCellCount > 0) {
    return "harbor";
  }
  let riverNear = false;
  let rockNear = false;
  let grassCells = 0;
  let landCells = 0;
  for (let dy = -radius - 2; dy <= radius + 2; dy += 1) {
    for (let dx = -radius - 2; dx <= radius + 2; dx += 1) {
      const cell = cellAt(anchorX + dx, anchorY + dy, width, height);
      if (cell === -1) {
        continue;
      }
      if (hydro.isRiver[cell] === 1 && Math.max(Math.abs(dx), Math.abs(dy)) <= 4) {
        riverNear = true;
      }
      if (grid[cell] === ROCK) {
        rockNear = true;
      }
      if (hydro.waterKind[cell] === WATER_NONE) {
        landCells += 1;
        if (grid[cell] === GRASS) {
          grassCells += 1;
        }
      }
    }
  }
  if (riverNear) {
    return "crossing";
  }
  if (landCells > 0 && grassCells * 100 >= landCells * 45) {
    return "farming";
  }
  if (rockNear) {
    return "mining";
  }
  return "waypoint";
}

function footprintFits(
  originX: number,
  originY: number,
  fw: number,
  fh: number,
  grid: readonly number[],
  structureLayer: Uint8Array,
  hydro: HydrologyResult,
  width: number,
  height: number,
): boolean {
  // The footprint plus a one-cell gap must be clear of other structures.
  for (let sy = -1; sy <= fh; sy += 1) {
    for (let sx = -1; sx <= fw; sx += 1) {
      const cell = cellAt(originX + sx, originY + sy, width, height);
      if (cell === -1) {
        return false;
      }
      if (structureLayer[cell] !== 0) {
        return false;
      }
      const inFootprint = sx >= 0 && sx < fw && sy >= 0 && sy < fh;
      if (inFootprint && !isOpenLand(cell, grid, hydro)) {
        return false;
      }
    }
  }
  return true;
}

function carveApproach(
  startX: number,
  startY: number,
  grid: number[],
  structureLayer: Uint8Array,
  hydro: HydrologyResult,
  maxLength: number,
  width: number,
  height: number,
): boolean {
  // Deterministic BFS to the nearest street (cobble or road); carve cobble.
  const start = cellAt(startX, startY, width, height);
  if (start === -1) {
    return false;
  }
  if (grid[start] === COBBLE || grid[start] === PACKED_ROAD) {
    return true;
  }
  if (!isOpenLand(start, grid, hydro) || structureLayer[start] !== 0) {
    return false;
  }
  const previous = new Map<number, number>();
  const queue = [start];
  previous.set(start, -1);
  for (let head = 0; head < queue.length && head <= maxLength * 8; head += 1) {
    const cell = queue[head] as number;
    if ((grid[cell] === COBBLE || grid[cell] === PACKED_ROAD) && cell !== start) {
      let cursor: number = previous.get(cell) as number;
      while (cursor !== -1 && cursor !== start) {
        grid[cursor] = COBBLE;
        cursor = previous.get(cursor) as number;
      }
      grid[start] = COBBLE;
      return true;
    }
    const x = cell % width;
    const y = (cell - x) / width;
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
      const next = cellAt(x + dx, y + dy, width, height);
      if (next === -1 || previous.has(next)) {
        continue;
      }
      const open = isOpenLand(next, grid, hydro) || grid[next] === COBBLE || grid[next] === PACKED_ROAD;
      if (open && structureLayer[next] === 0) {
        previous.set(next, cell);
        queue.push(next);
      }
    }
  }
  return false;
}

function isOpenLand(cell: number, grid: readonly number[], hydro: HydrologyResult): boolean {
  return (
    hydro.waterKind[cell] === WATER_NONE &&
    hydro.isRiver[cell] === 0 &&
    grid[cell] !== DEEP &&
    grid[cell] !== SHALLOW &&
    grid[cell] !== PACKED_ROAD
  );
}

function cellAt(x: number, y: number, width: number, height: number): number {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return -1;
  }
  return y * width + x;
}
