/**
 * Macro debug renders (Milestones W2-W3). Debug colors are WorldForge-owned
 * so field and hydrology data stay inspectable with no TileForge package
 * involved (docs/ROADMAP.md, W2 exit criteria).
 */

import type { ComposedWorld } from "../generation/composeWorld.js";
import { WORLD_PALETTE, type PaletteKey } from "../regions/biomes.js";
import { encodePng } from "./png.js";

export const PALETTE_DEBUG_COLORS: { readonly [key in PaletteKey]: readonly [number, number, number] } = {
  "terrain.cobble": [156, 146, 130],
  "terrain.dry_grass": [162, 154, 84],
  "terrain.grass": [79, 143, 62],
  "terrain.gravel": [128, 120, 108],
  "terrain.mud": [97, 70, 47],
  "terrain.packed_road": [174, 144, 102],
  "terrain.rock": [138, 141, 144],
  "terrain.snow": [232, 237, 242],
  "terrain.swamp": [70, 105, 82],
  "water.deep": [36, 86, 148],
  "water.shallow": [86, 156, 205],
  "terrain.sand": [214, 197, 143],
};

const RIVER_COLOR: readonly [number, number, number] = [50, 110, 190];

export function cellColor(paletteIndex: number): readonly [number, number, number] {
  const key = WORLD_PALETTE[paletteIndex] as PaletteKey;
  return PALETTE_DEBUG_COLORS[key];
}

/** One pixel per cell, palette debug colors. */
export function renderWorldGridPng(width: number, height: number, grid: readonly number[]): Buffer {
  const rgb = new Uint8Array(width * height * 3);
  for (let index = 0; index < grid.length; index += 1) {
    const [r, g, b] = cellColor(grid[index] as number);
    rgb[index * 3] = r;
    rgb[index * 3 + 1] = g;
    rgb[index * 3 + 2] = b;
  }
  return encodePng(width, height, rgb);
}

/** Biome map with river cells overlaid — the hydrology review render. */
export function renderHydrologyPng(composed: ComposedWorld): Buffer {
  const { width, height, grid, hydro } = composed;
  const rgb = new Uint8Array(width * height * 3);
  for (let index = 0; index < grid.length; index += 1) {
    const [r, g, b] = hydro.isMajorRiver[index] === 1 ? RIVER_COLOR : cellColor(grid[index] as number);
    rgb[index * 3] = r;
    rgb[index * 3 + 1] = g;
    rgb[index * 3 + 2] = b;
  }
  return encodePng(width, height, rgb);
}

const TRAIL_COLOR: readonly [number, number, number] = [206, 162, 74];
const BRIDGE_COLOR: readonly [number, number, number] = [40, 40, 44];
const FORD_COLOR: readonly [number, number, number] = [150, 180, 210];
const SETTLEMENT_COLOR: readonly [number, number, number] = [16, 16, 16];
const LANDMARK_COLOR: readonly [number, number, number] = [150, 30, 150];

/** Routes review render: grid + trails + crossings + destination anchors. */
export function renderRoutesPng(composed: ComposedWorld): Buffer {
  const { width, height, grid, routesResult } = composed;
  const rgb = new Uint8Array(width * height * 3);
  for (let index = 0; index < grid.length; index += 1) {
    const color = routesResult.pathLayer[index] === 1 ? TRAIL_COLOR : cellColor(grid[index] as number);
    rgb[index * 3] = color[0];
    rgb[index * 3 + 1] = color[1];
    rgb[index * 3 + 2] = color[2];
  }
  const paint = (cell: number, color: readonly [number, number, number], radius: number): void => {
    const x = cell % width;
    const y = (cell - x) / width;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const pixel = (ny * width + nx) * 3;
          rgb[pixel] = color[0];
          rgb[pixel + 1] = color[1];
          rgb[pixel + 2] = color[2];
        }
      }
    }
  };
  for (const route of routesResult.routes) {
    for (const crossing of route.crossings) {
      paint(crossing.cell, crossing.kind === "bridge" ? BRIDGE_COLOR : FORD_COLOR, 0);
    }
  }
  for (const destination of routesResult.destinations) {
    paint(destination.cell, destination.kind === "landmark_candidate" ? LANDMARK_COLOR : SETTLEMENT_COLOR, 1);
  }
  return encodePng(width, height, rgb);
}

const PROFILE_SEPARATOR = 2;
const PROFILE_WIDTH = 48;
const PROFILE_BACKGROUND = 20;

/**
 * One pixel per cell, permille value as a FIXED gray mapping
 * (gray = value * 255 / 999) — never normalized per image, so two renders are
 * comparable and absolute levels are readable. A right-hand row-mean profile
 * strip makes gradients (e.g. the north elevation bias) verifiable in the
 * image itself: each row's bar length and brightness encode that row's mean.
 */
export function renderFieldPng(width: number, height: number, values: readonly number[]): Buffer {
  const fullWidth = width + PROFILE_SEPARATOR + PROFILE_WIDTH;
  const rgb = new Uint8Array(fullWidth * height * 3);

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      const value = values[y * width + x] as number;
      rowSum += value;
      const gray = Math.trunc((value * 255) / 999);
      const pixel = (y * fullWidth + x) * 3;
      rgb[pixel] = gray;
      rgb[pixel + 1] = gray;
      rgb[pixel + 2] = gray;
    }
    const rowMean = Math.trunc(rowSum / width);
    const meanGray = Math.trunc((rowMean * 255) / 999);
    const barLength = Math.trunc((rowMean * PROFILE_WIDTH) / 999);
    for (let x = 0; x < PROFILE_SEPARATOR + PROFILE_WIDTH; x += 1) {
      const inBar = x >= PROFILE_SEPARATOR && x - PROFILE_SEPARATOR < barLength;
      const shade = x < PROFILE_SEPARATOR ? 0 : inBar ? meanGray : PROFILE_BACKGROUND;
      const pixel = (y * fullWidth + width + x) * 3;
      rgb[pixel] = shade;
      rgb[pixel + 1] = shade;
      rgb[pixel + 2] = shade;
    }
  }
  return encodePng(fullWidth, height, rgb);
}

const STRUCTURE_COLOR: readonly [number, number, number] = [70, 40, 36];
const GATE_COLOR: readonly [number, number, number] = [128, 64, 44];

/** Settlements review render: routes base + structure cells. */
export function renderSettlementsPng(composed: ComposedWorld): Buffer {
  const { width, height, grid, routesResult, structureLayer } = composed;
  const rgb = new Uint8Array(width * height * 3);
  for (let index = 0; index < grid.length; index += 1) {
    let color = routesResult.pathLayer[index] === 1 ? [206, 162, 74] as const : cellColor(grid[index] as number);
    const structure = structureLayer[index] as number;
    if (structure !== 0) {
      color = structure === 1 ? GATE_COLOR : STRUCTURE_COLOR;
    }
    rgb[index * 3] = color[0];
    rgb[index * 3 + 1] = color[1];
    rgb[index * 3 + 2] = color[2];
  }
  return encodePng(width, height, rgb);
}

/** Nearest-neighbor upscaled crop centered on the town for review. */
export function renderTownCropPng(composed: ComposedWorld, scale = 4): Buffer | null {
  const town = composed.settlementPlans[0];
  if (town === undefined) {
    return null;
  }
  const half = town.radius + 8;
  const { width, height } = composed;
  const x0 = Math.max(0, town.anchorX - half);
  const y0 = Math.max(0, town.anchorY - half);
  const x1 = Math.min(width - 1, town.anchorX + half);
  const y1 = Math.min(height - 1, town.anchorY + half);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const rgb = new Uint8Array(cw * scale * ch * scale * 3);
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      const index = (y0 + y) * width + x0 + x;
      let color = composed.routesResult.pathLayer[index] === 1 ? [206, 162, 74] as const : cellColor(composed.grid[index] as number);
      const structure = composed.structureLayer[index] as number;
      if (structure !== 0) {
        color = structure === 1 ? GATE_COLOR : STRUCTURE_COLOR;
      }
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const pixel = ((y * scale + sy) * cw * scale + x * scale + sx) * 3;
          rgb[pixel] = color[0];
          rgb[pixel + 1] = color[1];
          rgb[pixel + 2] = color[2];
        }
      }
    }
  }
  return encodePng(cw * scale, ch * scale, rgb);
}

export interface MacroRenderSet {
  readonly biomes: Buffer;
  readonly hydrology: Buffer;
  readonly routes: Buffer;
  readonly settlements: Buffer;
  readonly townCrop: Buffer | null;
  readonly elevation: Buffer;
  readonly moisture: Buffer;
  readonly temperature: Buffer;
}

export function renderMacroSet(composed: ComposedWorld): MacroRenderSet {
  const { width, height, fields } = composed;
  return {
    biomes: renderWorldGridPng(width, height, composed.grid),
    hydrology: renderHydrologyPng(composed),
    routes: renderRoutesPng(composed),
    settlements: renderSettlementsPng(composed),
    townCrop: renderTownCropPng(composed),
    elevation: renderFieldPng(width, height, fields.elevation),
    moisture: renderFieldPng(width, height, composed.moistureAdjusted),
    temperature: renderFieldPng(width, height, fields.temperature),
  };
}
