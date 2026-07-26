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
import {
  classifyCell,
  labelComponents,
  smoothConfetti,
  PALETTE_INDEX,
  WORLD_PALETTE,
  type PaletteKey,
  type RegionSummary,
} from "../regions/biomes.js";

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

  // Absorb any one-cell regions the overlays introduced.
  smoothConfetti(grid, width, height, 2, 2);

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
