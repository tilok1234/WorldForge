/**
 * World composition (Milestone W3): raw fields -> hydrology -> coastal
 * moisture -> land biomes -> confetti smoothing -> water and wetland overlay
 * -> one-cell cleanup -> regions. Every stage is integer-only and reads the
 * same global plan, so chunk borders agree by construction.
 */

import { clampInt } from "../core/fixedPoint.js";
import { floorDiv } from "../core/coords.js";
import type { ResolvedWorldConfig } from "../recipe/compile.js";
import { buildMacroFields, type MacroFields } from "../fields/macroFields.js";
import { buildHydrology, WATER_DEEP, WATER_SHALLOW, type HydrologyResult } from "../hydrology/hydrology.js";
import { decorateWorld, type DecorationResult } from "../decoration/decorate.js";
import { planFarmsAndPiers, type FarmResult } from "../settlements/farms.js";
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
  smoothConfetti(grid, width, height, 2, 2, new Set([PALETTE_INDEX["terrain.packed_road"], PALETTE_INDEX["terrain.cobble"]]));
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
    for (let index = 0; index < grid.length; index += 1) {
      if (hydro.isRiver[index] !== 1) continue;
      const x = index % width;
      const y = (index - x) / width;
      const northSouth = y > 0 && y < height - 1 && corridor(index - width) && corridor(index + width);
      const eastWest = x > 0 && x < width - 1 && corridor(index - 1) && corridor(index + 1);
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
  const decoration = decorateWorld(grid, structureLayer, hydro, routesResult, entranceCells, config, farms);

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
