/**
 * Seed-sweep contact sheet (Milestone W2). Renders the biome map of many
 * seeds into one review grid so milestone review can judge the generator's
 * output distribution instead of overfitting to one blessed seed.
 */

import { compileRecipe } from "../recipe/compile.js";
import type { NormalizedWorldRecipe } from "../recipe/schema.js";
import { SEED_MAX } from "../recipe/schema.js";
import { composeWorld } from "../generation/composeWorld.js";
import { cellColor } from "./macroRender.js";
import { encodePng } from "./png.js";

const GUTTER = 2;
const GUTTER_COLOR: readonly [number, number, number] = [24, 24, 28];

export interface ContactSheetResult {
  readonly png: Buffer;
  readonly index: {
    readonly baseRecipeSeed: number;
    readonly columns: number;
    readonly rows: number;
    readonly tileWidth: number;
    readonly tileHeight: number;
    readonly gutter: number;
    readonly tiles: ReadonlyArray<{
      readonly seed: number;
      readonly column: number;
      readonly row: number;
      readonly residualSmallRegions: number;
    }>;
  };
}

/** Render seedCount consecutive seeds (base, base+1, …, wrapping at SEED_MAX). */
export function buildContactSheet(
  normalized: NormalizedWorldRecipe,
  seedCount: number,
): ContactSheetResult {
  if (!Number.isSafeInteger(seedCount) || seedCount < 1 || seedCount > 64) {
    throw new Error("seedCount must be an integer in [1, 64]");
  }
  const columns = Math.ceil(Math.sqrt(seedCount));
  const rows = Math.ceil(seedCount / columns);

  const baseConfig = compileRecipe(normalized);
  const tileWidth = baseConfig.world.width;
  const tileHeight = baseConfig.world.height;
  const sheetWidth = columns * tileWidth + (columns + 1) * GUTTER;
  const sheetHeight = rows * tileHeight + (rows + 1) * GUTTER;

  const rgb = new Uint8Array(sheetWidth * sheetHeight * 3);
  for (let index = 0; index < sheetWidth * sheetHeight; index += 1) {
    rgb[index * 3] = GUTTER_COLOR[0];
    rgb[index * 3 + 1] = GUTTER_COLOR[1];
    rgb[index * 3 + 2] = GUTTER_COLOR[2];
  }

  const tiles: Array<{
    seed: number;
    column: number;
    row: number;
    residualSmallRegions: number;
  }> = [];
  for (let tile = 0; tile < seedCount; tile += 1) {
    const seed = (normalized.seed + tile) % (SEED_MAX + 1);
    const tileRecipe: NormalizedWorldRecipe = { ...normalized, seed };
    const config = compileRecipe(tileRecipe);
    const composed = composeWorld(config);

    const column = tile % columns;
    const row = (tile - column) / columns;
    const originX = GUTTER + column * (tileWidth + GUTTER);
    const originY = GUTTER + row * (tileHeight + GUTTER);
    for (let y = 0; y < tileHeight; y += 1) {
      for (let x = 0; x < tileWidth; x += 1) {
        const [r, g, b] = cellColor(composed.grid[y * tileWidth + x] as number);
        const pixel = ((originY + y) * sheetWidth + originX + x) * 3;
        rgb[pixel] = r;
        rgb[pixel + 1] = g;
        rgb[pixel + 2] = b;
      }
    }
    tiles.push({ seed, column, row, residualSmallRegions: composed.residualSmallRegions });
  }

  return {
    png: encodePng(sheetWidth, sheetHeight, rgb),
    index: {
      baseRecipeSeed: normalized.seed,
      columns,
      rows,
      tileWidth,
      tileHeight,
      gutter: GUTTER,
      tiles,
    },
  };
}
