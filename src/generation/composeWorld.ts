/**
 * World composition (Milestone W3): raw fields -> hydrology -> coastal
 * moisture -> land biomes -> confetti smoothing -> water and wetland overlay
 * -> one-cell cleanup -> regions. Every stage is integer-only and reads the
 * same global plan, so chunk borders agree by construction.
 */

import { clampInt } from "../core/fixedPoint.js";
import { floorDiv } from "../core/coords.js";
import { channel } from "../core/channels.js";
import type { ResolvedWorldConfig } from "../recipe/compile.js";
import { buildMacroFields, type MacroFields } from "../fields/macroFields.js";
import { buildHydrology, WATER_DEEP, WATER_NONE, WATER_SHALLOW, type HydrologyResult } from "../hydrology/hydrology.js";
import { decorateWorld, type DecorationResult } from "../decoration/decorate.js";
import { planFarmsAndPiers, type FarmResult } from "../settlements/farms.js";
import { applyTerrainTexture, type TextureStats } from "./texture.js";
import { planPois, type PlacedPoi } from "../decoration/pois.js";
import {
  classifyCell,
  labelComponents,
  smoothConfetti,
  PALETTE_INDEX,
  WORLD_PALETTE,
  type PaletteKey,
  type RegionSummary,
} from "../regions/biomes.js";
import { buildRoutes, verifyRouteConnectivity, type RoutesResult } from "../routes/routes.js";
import { planSettlements, type SettlementPlan } from "../settlements/settlements.js";
import { placeLandmarks, type LandmarkPlan } from "../settlements/landmarks.js";

const SWAMP = PALETTE_INDEX["terrain.swamp"];
const DEEP = PALETTE_INDEX["water.deep"];
const SHALLOW = PALETTE_INDEX["water.shallow"];
const GRASS = PALETTE_INDEX["terrain.grass"];
const DRY_GRASS = PALETTE_INDEX["terrain.dry_grass"];
const MUD = PALETTE_INDEX["terrain.mud"];

export interface ComposedWorld {
  readonly width: number;
  readonly height: number;
  /** Row-major WORLD_PALETTE indexes. */
  readonly grid: readonly number[];
  readonly regions: readonly RegionSummary[];
  readonly residualSmallRegions: number;
  readonly fields: MacroFields;
  /** Moisture after the coastal-influence halo. */
  readonly moistureAdjusted: readonly number[];
  readonly hydro: HydrologyResult;
  readonly wetlandCellCount: number;
  readonly routesResult: RoutesResult;
  readonly structureLayer: Uint8Array;
  readonly settlementPlans: readonly SettlementPlan[];
  readonly landmarkPlans: readonly LandmarkPlan[];
  readonly decoration: DecorationResult;
  readonly farms: FarmResult;
  /** Terrain texture pass counters (behavior 39). */
  readonly textureStats: TextureStats;
  readonly pois: readonly PlacedPoi[];
  /**
   * Street-level crossings: river cells that carry corridor material or run
   * between corridor cells on opposite sides. Walkable in every model; the
   * TileForge adapter renders them as ford decals.
   */
  readonly streetFordCells: readonly number[];
}

export function composeWorld(config: ResolvedWorldConfig): ComposedWorld {
  const { width, height } = config.world;
  const fields = buildMacroFields(config);
  const hydro = buildHydrology(fields.elevation, width, height, config.water);
  const moistureAdjusted = applyCoastalMoisture(fields.moisture, hydro, config);

  // Land classification everywhere; water overlays afterwards so smoothing
  // cannot eat hydrology output.
  const grid = new Array<number>(width * height);
  for (let index = 0; index < grid.length; index += 1) {
    grid[index] = classifyCell(
      fields.elevation[index] as number,
      moistureAdjusted[index] as number,
      fields.temperature[index] as number,
      config.biomes.thresholds,
    );
  }
  smoothConfetti(grid, width, height, config.biomes.minRegionCells, config.biomes.smoothingPasses);

  for (let index = 0; index < grid.length; index += 1) {
    const kind = hydro.waterKind[index];
    if (kind === WATER_DEEP) {
      grid[index] = DEEP;
    } else if (kind === WATER_SHALLOW) {
      grid[index] = SHALLOW;
    }
  }

  // Wetlands: moist land beside water or a river, on soft ground only.
  let wetlandCellCount = 0;
  const wetland = new Uint8Array(grid.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const biome = grid[index] as number;
      if (biome !== GRASS && biome !== DRY_GRASS && biome !== MUD) {
        continue;
      }
      if ((moistureAdjusted[index] as number) < config.water.wetlandMoistureMin) {
        continue;
      }
      if (!bordersWater(index, x, y, width, height, grid, hydro)) {
        continue;
      }
      wetland[index] = 1;
    }
  }
  for (let index = 0; index < grid.length; index += 1) {
    if (wetland[index] === 1) {
      grid[index] = SWAMP;
      wetlandCellCount += 1;
    }
  }

  // Beaches (behavior 14) run AFTER wetlands: marsh coasts survive as swamp
  // ribbons, remaining low shoreline land becomes sand. The elevation gate
  // keeps beaches to sea-level coasts, and the first row/column is excluded —
  // the pinned package's §2.7 sand margin cannot represent sand there.
  const beachOriginals = new Map<number, number>();
  {
    const SAND = PALETTE_INDEX["terrain.sand"];
    const sandable = new Set<number>([GRASS, DRY_GRASS, MUD]);
    const beachElevationMax = config.water.seaLevelPermille + 45;
    const placements = beachOriginals;
    for (let y = 2; y < height - 2; y += 1) {
      for (let x = 2; x < width - 2; x += 1) {
        const index = y * width + x;
        if (hydro.waterKind[index] !== WATER_NONE) continue;
        if (!sandable.has(grid[index] as number)) continue;
        if ((fields.elevation[index] as number) > beachElevationMax) continue;
        if (hydro.isRiver[index] === 1) continue;
        let besideWater = false;
        for (const neighbor of [index - width, index + width, index - 1, index + 1]) {
          if (neighbor < 0 || neighbor >= grid.length) continue;
          if (x === 0 && neighbor === index - 1) continue;
          if (x === width - 1 && neighbor === index + 1) continue;
          if (hydro.waterKind[neighbor] !== WATER_NONE) {
            besideWater = true;
            break;
          }
        }
        if (besideWater) {
          placements.set(index, grid[index] as number);
          grid[index] = SAND;
        }
      }
    }
    // Fill pockets fully enclosed by sand/water (swamp specks included) so
    // smoothing — barred from spreading sand — never meets an unabsorbable
    // one-cell hole behind the ribbon.
    const fillable = new Set<number>([GRASS, DRY_GRASS, MUD, SWAMP]);
    let filled = true;
    while (filled) {
      filled = false;
      // The §2.7 sand margin holds on ALL four edges (behavior 31): the
      // dual grid cannot represent sand on the outermost rows/columns.
      for (let y = 2; y < height - 2; y += 1) {
        for (let x = 2; x < width - 2; x += 1) {
          const index = y * width + x;
          if (hydro.waterKind[index] !== WATER_NONE) continue;
          if (!fillable.has(grid[index] as number)) continue;
          if ((fields.elevation[index] as number) > beachElevationMax) continue;
          if (hydro.isRiver[index] === 1) continue;
          let enclosed = true;
          for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              enclosed = false;
              break;
            }
            const value = grid[ny * width + nx] as number;
            if (value !== SAND && value !== SHALLOW && value !== DEEP) {
              enclosed = false;
              break;
            }
          }
          if (enclosed) {
            placements.set(index, grid[index] as number);
            grid[index] = SAND;
            filled = true;
          }
        }
      }
    }
  }

  // Rocky knolls (macro.biomes 3, the 90%-unused verdict): small scattered
  // rock outcrops texture the open midlands and anchor wilderness dungeons.
  // They stamp BEFORE routes so corridors respect them, and keep off water,
  // rivers, beaches, and the existing rock mass.
  {
    const ROCK = PALETTE_INDEX["terrain.rock"];
    const SAND_VALUE = PALETTE_INDEX["terrain.sand"];
    const knolls = channel(config.seed, "macro.knolls");
    const centers: Array<readonly [number, number]> = [];
    const rockNearby = (cx: number, cy: number, radius: number): boolean => {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          if (grid[y * width + x] === ROCK) return true;
        }
      }
      return false;
    };
    const target = config.biomes.knollCount;
    for (let attempt = 0; attempt < target * 22 && centers.length < target; attempt += 1) {
      const cx = knolls.intAt(attempt, 0, 8, width - 16, 0) + 8;
      const cy = knolls.intAt(attempt, 1, 8, height - 16, 0) + 8;
      const center = cy * width + cx;
      if (hydro.waterKind[center] !== WATER_NONE || hydro.isRiver[center] === 1) continue;
      if (grid[center] === SAND_VALUE || grid[center] === ROCK) continue;
      if (rockNearby(cx, cy, 7)) continue;
      if (centers.some(([ox, oy]) => Math.max(Math.abs(ox - cx), Math.abs(oy - cy)) < 14)) continue;
      const radius = 2 + knolls.intAt(attempt, 2, 0, 3, 0);
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
          const index = y * width + x;
          if (hydro.waterKind[index] !== WATER_NONE || hydro.isRiver[index] === 1) continue;
          if (grid[index] === SAND_VALUE) continue;
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          // Rough-edged blob: certainty at the core, jitter at the rim.
          if (knolls.permilleAt(x, y, 3) < 940 - distance * (720 / radius)) {
            grid[index] = ROCK;
          }
        }
      }
      centers.push([cx, cy]);
    }
  }

  // Routes stamp packed-road corridors into the material grid after all
  // terrain passes, so decoration-era passes can never sever them unnoticed:
  // connectivity is re-verified on the final grid.
  let routesResult = buildRoutes(grid, fields, hydro, config);

  // Settlement and landmark planning (W5): plans mutate the grid (plazas,
  // cobble streets, structure footprints, stamps, blending) before cleanup.
  const structureLayer = new Uint8Array(width * height);
  const planErrors: string[] = [];
  const settlementPlans = planSettlements(grid, structureLayer, fields, hydro, routesResult, config, planErrors);
  const landmarkPlans = placeLandmarks(grid, structureLayer, routesResult.pathLayer, fields, hydro, routesResult, config, planErrors);

  // Absorb one-cell regions introduced by overlays and road carving. Road
  // cells are protected: traversal-critical corridors are never rewritten,
  // and connectivity is re-verified afterwards on the final grid.
  // A beach is at least two contiguous cells: sand is confetti-protected, so
  // lone survivors — including cells orphaned when settlement streets paved
  // their neighbors — revert to their original material. Runs after every
  // pass that can rewrite shoreline cells.
  {
    const SAND = PALETTE_INDEX["terrain.sand"];
    const lonely: number[] = [];
    for (const index of beachOriginals.keys()) {
      if (grid[index] !== SAND) continue;
      const x = index % width;
      let hasSandNeighbor = false;
      for (const neighbor of [index - width, index + width, index - 1, index + 1]) {
        if (neighbor < 0 || neighbor >= grid.length) continue;
        if (x === 0 && neighbor === index - 1) continue;
        if (x === width - 1 && neighbor === index + 1) continue;
        if (grid[neighbor] === SAND) {
          hasSandNeighbor = true;
          break;
        }
      }
      if (!hasSandNeighbor) {
        lonely.push(index);
      }
    }
    for (const index of lonely) {
      grid[index] = beachOriginals.get(index) as number;
    }
  }

  // Sand is protected like the corridors, and additionally barred as an
  // absorption target: smoothing must neither erase a beach nor spread sand
  // to cells the beach rule (and its §2.7 margin) never blessed.
  smoothConfetti(
    grid, width, height, 2, 2,
    new Set([
      PALETTE_INDEX["terrain.packed_road"],
      PALETTE_INDEX["terrain.cobble"],
      PALETTE_INDEX["terrain.sand"],
    ]),
    new Set([PALETTE_INDEX["terrain.sand"]]),
  );
  const postCleanupErrors: string[] = [...planErrors];
  verifyRouteConnectivity(grid, routesResult.pathLayer, routesResult.routes, routesResult.destinations, width, height, postCleanupErrors);
  // Street-level crossings (single source of truth; the adapter renders
  // these as ford decals): a stream cell is a crossing when it carries a
  // corridor material or separates corridor cells on opposite sides.
  const streetFordCells: number[] = [];
  {
    const cobbleValue = PALETTE_INDEX["terrain.cobble"];
    const roadValue = PALETTE_INDEX["terrain.packed_road"];
    const corridor = (index: number): boolean =>
      grid[index] === roadValue || grid[index] === cobbleValue;
    const river = (index: number): boolean => hydro.isRiver[index] === 1;
    // A run of one or two stream cells with corridor at both ends fords —
    // two matches the street arms' skippedWet allowance, which would
    // otherwise sever settlement fabric on double-wide streams.
    const bridged = (index: number, stride: number, room: boolean, room2: boolean): boolean => {
      if (!room) return false;
      const before = corridor(index - stride);
      const after = corridor(index + stride);
      if (before && after) return true;
      if (!room2) return false;
      if (before && river(index + stride) && corridor(index + 2 * stride)) return true;
      if (after && river(index - stride) && corridor(index - 2 * stride)) return true;
      return false;
    };
    for (let index = 0; index < grid.length; index += 1) {
      if (!river(index)) continue;
      const x = index % width;
      const y = (index - x) / width;
      const northSouth = bridged(index, width, y > 0 && y < height - 1, y > 1 && y < height - 2);
      const eastWest = bridged(index, 1, x > 0 && x < width - 1, x > 1 && x < width - 2);
      if (corridor(index) || northSouth || eastWest) {
        streetFordCells.push(index);
      }
    }
  }

  // Entrance reachability (W5 exit criterion): every structure entrance and
  // landmark gate joins the walkable network.
  {
    const walkable = new Uint8Array(grid.length);
    const cobbleValue = PALETTE_INDEX["terrain.cobble"];
    const roadValue = PALETTE_INDEX["terrain.packed_road"];
    for (let index = 0; index < grid.length; index += 1) {
      if (grid[index] === roadValue || grid[index] === cobbleValue || routesResult.pathLayer[index] === 1) {
        walkable[index] = 1;
      }
    }
    for (const route of routesResult.routes) {
      for (const crossing of route.crossings) {
        walkable[crossing.cell] = 1;
      }
    }
    for (const cell of streetFordCells) {
      walkable[cell] = 1;
    }
    const seeds: number[] = [];
    if (settlementPlans.length > 0) {
      seeds.push((settlementPlans[0] as SettlementPlan).anchorY * width + (settlementPlans[0] as SettlementPlan).anchorX);
    }
    const reached = new Uint8Array(grid.length);
    const queue: number[] = [];
    for (const seed of seeds) {
      walkable[seed] = 1;
      reached[seed] = 1;
      queue.push(seed);
    }
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head] as number;
      const x = index % width;
      for (const neighbor of [index - width, index + width, index - 1, index + 1]) {
        if (neighbor < 0 || neighbor >= grid.length) continue;
        if (x === 0 && neighbor === index - 1) continue;
        if (x === width - 1 && neighbor === index + 1) continue;
        if (reached[neighbor] === 0 && walkable[neighbor] === 1) {
          reached[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    for (const plan of settlementPlans) {
      for (const structure of plan.structures) {
        const entrance = structure.entranceY * width + structure.entranceX;
        if (entrance >= 0 && entrance < grid.length && reached[entrance] === 0) {
          postCleanupErrors.push(
            `settlement ${plan.id}: entrance of ${structure.type} at (${structure.entranceX}, ${structure.entranceY}) is unreachable`,
          );
        }
      }
    }
    for (const plan of landmarkPlans) {
      const gate = plan.entranceY * width + plan.entranceX;
      if (reached[gate] === 0) {
        postCleanupErrors.push(`landmark ${plan.id}: gate at (${plan.entranceX}, ${plan.entranceY}) is unreachable`);
      }
    }
  }
  if (postCleanupErrors.length > 0) {
    routesResult = { ...routesResult, errors: [...routesResult.errors, ...postCleanupErrors] };
  }

  // Farm plots and harbor piers (stage 3) are settlement infrastructure:
  // planned after every traversal-critical pass, before decoration.
  const farms = planFarmsAndPiers(grid, structureLayer, hydro, routesResult.pathLayer, settlementPlans, config);

  // Terrain texture (behavior 39): cosmetic-material mottle + edge dither.
  // After everything structural (nothing can move) and before decoration
  // (props and POIs follow the textured ground). Walkability-neutral by
  // construction: swaps stay inside the walkable ground-material set.
  const textureStats = applyTerrainTexture(
    grid,
    structureLayer,
    routesResult.pathLayer,
    farms,
    hydro,
    new Set(streetFordCells),
    config,
  );

  // Decoration runs last: it never writes corridor, crossing, structure,
  // entrance, crop, fence, or pier cells.
  const entranceCells: number[] = [];
  for (const plan of settlementPlans) {
    for (const structure of plan.structures) {
      entranceCells.push(structure.entranceY * width + structure.entranceX);
    }
  }
  for (const plan of landmarkPlans) {
    entranceCells.push(plan.entranceY * width + plan.entranceX);
  }
  const decoration = decorateWorld(grid, structureLayer, hydro, routesResult, entranceCells, config, farms, streetFordCells);

  // Points of interest stamp after ambient decoration and overwrite it:
  // deliberate discoveries beat scattered flavor.
  const pois = planPois(grid, structureLayer, hydro, routesResult, settlementPlans, landmarkPlans, farms, decoration, config);

  // Wilderness spur paths (behavior 21): worked or visited discoveries —
  // mines, crypts, graveyards, stone rings, fishing spots, cave mouths,
  // prospector camps — earn a rough dirt path to the nearest corridor.
  // Hidden or lost places (witch circles, bandit camps, wrecks, the
  // skeleton) stay pathless by design. Purely additive: pathLayer only.
  {
    const SPUR_KINDS = new Set([
      "poi.mine",
      "poi.crypt",
      "poi.graveyard",
      "poi.standing_stones",
      "poi.stone_circle",
      "poi.fishing_spot",
      "poi.cave",
      "poi.prospector_camp",
      "poi.ruin",
      "poi.trapper_camp",
    ]);
    const cobbleValue = PALETTE_INDEX["terrain.cobble"];
    const roadValue = PALETTE_INDEX["terrain.packed_road"];
    const rockIdx = PALETTE_INDEX["terrain.rock"];
    const swampIdx = PALETTE_INDEX["terrain.swamp"];
    const pathLayer = routesResult.pathLayer;
    const maxSpur = 20;
    for (const poi of pois) {
      if (!SPUR_KINDS.has(poi.type)) continue;
      // BFS over open walkable land from the POI's doorstep to the nearest
      // corridor cell (path, road, or cobble), bounded by maxSpur steps.
      const start = poi.y * width + poi.x;
      const previous = new Map<number, number>();
      const depth = new Map<number, number>();
      previous.set(start, -1);
      depth.set(start, 0);
      const queue = [start];
      let goal = -1;
      for (let head = 0; head < queue.length && goal === -1; head += 1) {
        const cell = queue[head] as number;
        const steps = depth.get(cell) as number;
        if (steps >= maxSpur) continue;
        const cx = cell % width;
        const cy = (cell - cx) / width;
        for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (previous.has(next)) continue;
          if (pathLayer[next] === 1 || grid[next] === roadValue || grid[next] === cobbleValue) {
            previous.set(next, cell);
            goal = next;
            break;
          }
          if (hydro.waterKind[next] !== WATER_NONE || hydro.isRiver[next] === 1) continue;
          if (grid[next] === rockIdx || grid[next] === swampIdx) continue;
          if (structureLayer[next] !== 0) continue;
          if (decoration.propLayer[next] !== 0) continue; // no paths under props
          previous.set(next, cell);
          depth.set(next, steps + 1);
          queue.push(next);
        }
      }
      if (goal === -1) continue;
      let cursor = previous.get(goal) as number;
      while (cursor !== -1 && cursor !== start) {
        if (pathLayer[cursor] === 0) pathLayer[cursor] = 1;
        cursor = previous.get(cursor) as number;
      }
    }
  }

  // Lone-cobble cleanup (behavior 21): an approach or street stump with no
  // orthogonal corridor neighbor is one-cell confetti, not a corridor —
  // orthogonal chains mean nothing routes THROUGH a lone cell, so reverting
  // it to a land neighbor's material can never sever traversal. A street
  // ford IS a corridor continuation: the far bank of a ford keeps its
  // cobble, or the ford's own justification (corridor on both sides)
  // silently evaporates and consumers disagree.
  {
    const cobbleValue = PALETTE_INDEX["terrain.cobble"];
    const roadValue = PALETTE_INDEX["terrain.packed_road"];
    const fordSet = new Set(streetFordCells);
    for (let index = 0; index < grid.length; index += 1) {
      if (grid[index] !== cobbleValue || structureLayer[index] !== 0) continue;
      const x = index % width;
      const y = (index - x) / width;
      let corridorNeighbor = false;
      let landFallback = -1;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const neighbor = ny * width + nx;
        const material = grid[neighbor] as number;
        if (material === cobbleValue || material === roadValue || fordSet.has(neighbor)) {
          corridorNeighbor = true;
          break;
        }
        if (landFallback === -1 && hydro.waterKind[neighbor] === WATER_NONE && hydro.isRiver[neighbor] === 0) {
          landFallback = material;
        }
      }
      if (!corridorNeighbor && landFallback !== -1) {
        grid[index] = landFallback;
      }
    }
  }

  // Authored cell overrides (behavior 36): the designer's spot decisions,
  // applied last so they win over every procedural pass, before validation
  // and resolution so every validator still judges the final world. Water
  // materials are rejected at recipe validation (hydrology owns water), so
  // nothing here can desync the river/water layers.
  for (const override of config.authoring.cellOverrides) {
    const cell = (override.cell[1] as number) * width + (override.cell[0] as number);
    if (override.material !== null) {
      grid[cell] = PALETTE_INDEX[override.material as PaletteKey];
    }
    if (override.clearProp) {
      decoration.propLayer[cell] = 0;
    }
    if (override.clearDecal) {
      decoration.decalLayer[cell] = 0;
    }
  }

  const labeling = labelComponents(grid, width, height);
  const regions: RegionSummary[] = labeling.components.map((component, id) => ({
    id,
    biome: WORLD_PALETTE[component.biome] as PaletteKey,
    cellCount: component.cellCount,
  }));
  const residualSmallRegions = labeling.components.filter(
    (component) => component.cellCount < config.biomes.minRegionCells,
  ).length;

  return {
    width,
    height,
    grid,
    regions,
    residualSmallRegions,
    fields,
    moistureAdjusted,
    hydro,
    wetlandCellCount,
    routesResult,
    structureLayer,
    settlementPlans,
    landmarkPlans,
    decoration,
    farms,
    textureStats,
    pois,
    streetFordCells,
  };
}

function applyCoastalMoisture(
  moisture: readonly number[],
  hydro: HydrologyResult,
  config: ResolvedWorldConfig,
): number[] {
  const radius = config.water.coastalInfluenceRadius;
  const influence = config.climate.coastalInfluencePermille;
  const result = new Array<number>(moisture.length);
  if (hydro.oceanCellCount === 0 || influence === 0) {
    for (let index = 0; index < moisture.length; index += 1) {
      result[index] = moisture[index] as number;
    }
    return result;
  }
  for (let index = 0; index < moisture.length; index += 1) {
    const distance = hydro.coastDistance[index] as number;
    let boost = 0;
    if (distance > 0 && distance < radius) {
      boost = floorDiv(influence * (radius - distance), radius * 5);
    }
    result[index] = clampInt((moisture[index] as number) + boost, 0, 999);
  }
  return result;
}

function bordersWater(
  index: number,
  x: number,
  y: number,
  width: number,
  height: number,
  grid: readonly number[],
  hydro: HydrologyResult,
): boolean {
  const neighbors: number[] = [];
  if (x > 0) neighbors.push(index - 1);
  if (x < width - 1) neighbors.push(index + 1);
  if (y > 0) neighbors.push(index - width);
  if (y < height - 1) neighbors.push(index + width);
  for (const neighbor of neighbors) {
    const value = grid[neighbor] as number;
    if (value === DEEP || value === SHALLOW || hydro.isRiver[neighbor] === 1) {
      return true;
    }
  }
  return false;
}
