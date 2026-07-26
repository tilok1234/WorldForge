/**
 * Macro debug renders (Milestone W2). Debug colors are WorldForge-owned so
 * field data stays inspectable with no TileForge package involved
 * (docs/ROADMAP.md, W2 exit criteria).
 */

import type { MacroFields } from "../fields/macroFields.js";
import type { BiomeWorld } from "../regions/biomes.js";
import { BIOME_KEYS, type BiomeKey } from "../regions/biomes.js";
import { encodePng } from "./png.js";

export const BIOME_DEBUG_COLORS: { readonly [key in BiomeKey]: readonly [number, number, number] } = {
  "terrain.dry_grass": [162, 154, 84],
  "terrain.grass": [79, 143, 62],
  "terrain.mud": [97, 70, 47],
  "terrain.rock": [138, 141, 144],
  "terrain.snow": [232, 237, 242],
};

/** One pixel per cell, biome debug colors. */
export function renderBiomePng(biomeWorld: BiomeWorld): Buffer {
  const { width, height, biomeGrid } = biomeWorld;
  const rgb = new Uint8Array(width * height * 3);
  for (let index = 0; index < biomeGrid.length; index += 1) {
    const key = BIOME_KEYS[biomeGrid[index] as number] as BiomeKey;
    const [r, g, b] = BIOME_DEBUG_COLORS[key];
    rgb[index * 3] = r;
    rgb[index * 3 + 1] = g;
    rgb[index * 3 + 2] = b;
  }
  return encodePng(width, height, rgb);
}

/** One pixel per cell, permille value as grayscale. */
export function renderFieldPng(width: number, height: number, values: readonly number[]): Buffer {
  const rgb = new Uint8Array(width * height * 3);
  for (let index = 0; index < values.length; index += 1) {
    const gray = Math.trunc(((values[index] as number) * 255) / 999);
    rgb[index * 3] = gray;
    rgb[index * 3 + 1] = gray;
    rgb[index * 3 + 2] = gray;
  }
  return encodePng(width, height, rgb);
}

export interface MacroRenderSet {
  readonly biomes: Buffer;
  readonly elevation: Buffer;
  readonly moisture: Buffer;
  readonly temperature: Buffer;
}

export function renderMacroSet(fields: MacroFields, biomeWorld: BiomeWorld): MacroRenderSet {
  return {
    biomes: renderBiomePng(biomeWorld),
    elevation: renderFieldPng(fields.width, fields.height, fields.elevation),
    moisture: renderFieldPng(fields.width, fields.height, fields.moisture),
    temperature: renderFieldPng(fields.width, fields.height, fields.temperature),
  };
}
