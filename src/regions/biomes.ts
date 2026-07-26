/**
 * Region and biome primitives (docs/ARCHITECTURE_AND_CONTRACTS.md,
 * component 6). Land classification uses strict threshold order; confetti
 * smoothing merges sub-minimum regions into their dominant border neighbor
 * with a bounded pass count. World composition (water, wetlands, regions)
 * lives in src/generation/composeWorld.ts.
 */

import type { BiomeRules } from "../recipe/compile.js";

/** Land biomes; the first five entries of WORLD_PALETTE. */
export const BIOME_KEYS = [
  "terrain.dry_grass",
  "terrain.grass",
  "terrain.mud",
  "terrain.rock",
  "terrain.snow",
] as const;

/** Complete semantic palette, alphabetical; material indexes point here. */
export const WORLD_PALETTE = [
  ...BIOME_KEYS,
  "terrain.swamp",
  "water.deep",
  "water.shallow",
] as const;

export type PaletteKey = (typeof WORLD_PALETTE)[number];

export const PALETTE_INDEX: { readonly [key in PaletteKey]: number } = Object.fromEntries(
  WORLD_PALETTE.map((key, index) => [key, index]),
) as { [key in PaletteKey]: number };

const DRY_GRASS = PALETTE_INDEX["terrain.dry_grass"];
const GRASS = PALETTE_INDEX["terrain.grass"];
const MUD = PALETTE_INDEX["terrain.mud"];
const ROCK = PALETTE_INDEX["terrain.rock"];
const SNOW = PALETTE_INDEX["terrain.snow"];

export interface RegionSummary {
  readonly id: number;
  readonly biome: PaletteKey;
  readonly cellCount: number;
}

/** Strict first-match classification; order is part of the rule pack. */
export function classifyCell(
  elevation: number,
  moisture: number,
  temperature: number,
  thresholds: BiomeRules["thresholds"],
): number {
  if (elevation >= thresholds.rockElevationMin) {
    return ROCK;
  }
  if (temperature < thresholds.snowTemperatureMax) {
    return SNOW;
  }
  if (moisture >= thresholds.mudMoistureMin && elevation <= thresholds.mudElevationMax) {
    return MUD;
  }
  if (moisture < thresholds.dryMoistureMax && temperature >= thresholds.dryTemperatureMin) {
    return DRY_GRASS;
  }
  return GRASS;
}

export interface Component {
  readonly biome: number;
  readonly cellCount: number;
  readonly firstCell: number;
}

export interface Labeling {
  readonly labels: Int32Array;
  readonly components: Component[];
}

/** Scan-order flood fill: component ids are deterministic first-encounter order. */
export function labelComponents(grid: readonly number[], width: number, height: number): Labeling {
  const labels = new Int32Array(width * height).fill(-1);
  const components: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < grid.length; start += 1) {
    if (labels[start] !== -1) {
      continue;
    }
    const label = components.length;
    const biome = grid[start] as number;
    let cellCount = 0;
    stack.push(start);
    labels[start] = label;
    while (stack.length > 0) {
      const index = stack.pop() as number;
      cellCount += 1;
      const x = index % width;
      const y = (index - x) / width;
      for (const neighbor of neighborsOf(x, y, width, height)) {
        if (labels[neighbor] === -1 && grid[neighbor] === biome) {
          labels[neighbor] = label;
          stack.push(neighbor);
        }
      }
    }
    components.push({ biome, cellCount, firstCell: start });
  }
  return { labels, components };
}

/**
 * Bounded confetti removal: each pass rewrites every sub-minimum component to
 * the value of the neighbor component it shares the longest border with
 * (ties: lower component id). Border counts come from the pass's snapshot, so
 * the result does not depend on processing order within a pass.
 */
export function smoothConfetti(
  grid: number[],
  width: number,
  height: number,
  minRegionCells: number,
  passes: number,
): void {
  for (let pass = 0; pass < passes; pass += 1) {
    const { labels, components } = labelComponents(grid, width, height);
    const smallLabels: number[] = [];
    for (let label = 0; label < components.length; label += 1) {
      if ((components[label] as Component).cellCount < minRegionCells) {
        smallLabels.push(label);
      }
    }
    if (smallLabels.length === 0) {
      return;
    }

    const borderCounts = new Map<number, Map<number, number>>();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const label = labels[index] as number;
        if (x < width - 1) {
          const neighborLabel = labels[index + 1] as number;
          if (neighborLabel !== label) {
            bumpBorder(borderCounts, label, neighborLabel);
            bumpBorder(borderCounts, neighborLabel, label);
          }
        }
        if (y < height - 1) {
          const neighborLabel = labels[index + width] as number;
          if (neighborLabel !== label) {
            bumpBorder(borderCounts, label, neighborLabel);
            bumpBorder(borderCounts, neighborLabel, label);
          }
        }
      }
    }

    const targetValue = new Map<number, number>();
    for (const label of smallLabels) {
      const neighbors = borderCounts.get(label);
      if (neighbors === undefined) {
        continue;
      }
      let bestLabel = -1;
      let bestCount = -1;
      for (const [neighborLabel, count] of neighbors) {
        if (count > bestCount || (count === bestCount && neighborLabel < bestLabel)) {
          bestLabel = neighborLabel;
          bestCount = count;
        }
      }
      if (bestLabel !== -1) {
        targetValue.set(label, (components[bestLabel] as Component).biome);
      }
    }
    if (targetValue.size === 0) {
      return;
    }
    for (let index = 0; index < grid.length; index += 1) {
      const replacement = targetValue.get(labels[index] as number);
      if (replacement !== undefined) {
        grid[index] = replacement;
      }
    }
  }
}

function bumpBorder(counts: Map<number, Map<number, number>>, from: number, to: number): void {
  let inner = counts.get(from);
  if (inner === undefined) {
    inner = new Map<number, number>();
    counts.set(from, inner);
  }
  inner.set(to, (inner.get(to) ?? 0) + 1);
}

function neighborsOf(x: number, y: number, width: number, height: number): number[] {
  const result: number[] = [];
  if (x > 0) result.push(y * width + x - 1);
  if (x < width - 1) result.push(y * width + x + 1);
  if (y > 0) result.push((y - 1) * width + x);
  if (y < height - 1) result.push((y + 1) * width + x);
  return result;
}
