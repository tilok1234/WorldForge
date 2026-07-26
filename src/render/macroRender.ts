/**
 * Macro debug renders (Milestones W2-W3). Debug colors are WorldForge-owned
 * so field and hydrology data stay inspectable with no TileForge package
 * involved (docs/ROADMAP.md, W2 exit criteria).
 */

import type { ComposedWorld } from "../generation/composeWorld.js";
import { WORLD_PALETTE, type PaletteKey } from "../regions/biomes.js";
import { encodePng } from "./png.js";

export const PALETTE_DEBUG_COLORS: { readonly [key in PaletteKey]: readonly [number, number, number] } = {
  "terrain.dry_grass": [162, 154, 84],
  "terrain.grass": [79, 143, 62],
  "terrain.mud": [97, 70, 47],
  "terrain.packed_road": [174, 144, 102],
  "terrain.rock": [138, 141, 144],
  "terrain.snow": [232, 237, 242],
  "terrain.swamp": [70, 105, 82],
  "water.deep": [36, 86, 148],
  "water.shallow": [86, 156, 205],
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

const TRAIL_COLOR: readonly [number, number, number] = [122, 92, 58];
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

export interface MacroRenderSet {
  readonly biomes: Buffer;
  readonly hydrology: Buffer;
  readonly routes: Buffer;
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
    elevation: renderFieldPng(width, height, fields.elevation),
    moisture: renderFieldPng(width, height, composed.moistureAdjusted),
    temperature: renderFieldPng(width, height, fields.temperature),
  };
}
