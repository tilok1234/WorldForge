/**
 * Region and biome compiler (docs/ARCHITECTURE_AND_CONTRACTS.md, component 6).
 * Classifies cells from integer fields via strict threshold order, then
 * removes sub-minimum "confetti" regions by merging them into their dominant
 * border neighbor. Smoothing is bounded (docs/GENERATION_RULES.md, performance
 * restraints); anything still small afterward is reported, never hidden.
 */

import type { BiomeRules, ResolvedWorldConfig } from "../recipe/compile.js";
import type { MacroFields } from "../fields/macroFields.js";

/** Alphabetical; material palette indexes point into this list. */
export const BIOME_KEYS = [
  "terrain.dry_grass",
  "terrain.grass",
  "terrain.mud",
  "terrain.rock",
  "terrain.snow",
] as const;

export type BiomeKey = (typeof BIOME_KEYS)[number];

const DRY_GRASS = BIOME_KEYS.indexOf("terrain.dry_grass");
const GRASS = BIOME_KEYS.indexOf("terrain.grass");
const MUD = BIOME_KEYS.indexOf("terrain.mud");
const ROCK = BIOME_KEYS.indexOf("terrain.rock");
const SNOW = BIOME_KEYS.indexOf("terrain.snow");

export interface RegionSummary {
  readonly id: number;
  readonly biome: BiomeKey;
  readonly cellCount: number;
}

export interface BiomeWorld {
  readonly width: number;
  readonly height: number;
  /** Row-major palette indexes into BIOME_KEYS. */
  readonly biomeGrid: readonly number[];
  readonly regions: readonly RegionSummary[];
  /** Regions still below minRegionCells after bounded smoothing. */
  readonly residualSmallRegions: number;
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

export function buildBiomeWorld(fields: MacroFields, config: ResolvedWorldConfig): BiomeWorld {
  const { width, height } = fields;
  const grid = new Array<number>(width * height);
  for (let index = 0; index < grid.length; index += 1) {
    grid[index] = classifyCell(
      fields.elevation[index] as number,
      fields.moisture[index] as number,
      fields.temperature[index] as number,
      config.biomes.thresholds,
    );
  }

  smoothConfetti(grid, width, height, config.biomes);

  const labeling = labelComponents(grid, width, height);
  const regions: RegionSummary[] = labeling.components.map((component, id) => ({
    id,
    biome: BIOME_KEYS[component.biome] as BiomeKey,
    cellCount: component.cellCount,
  }));
  const residualSmallRegions = labeling.components.filter(
    (component) => component.cellCount < config.biomes.minRegionCells,
  ).length;

  return { width, height, biomeGrid: grid, regions, residualSmallRegions };
}

interface Component {
  readonly biome: number;
  readonly cellCount: number;
  readonly firstCell: number;
}

interface Labeling {
  readonly labels: Int32Array;
  readonly components: Component[];
}

/** Scan-order flood fill: component ids are deterministic first-encounter order. */
function labelComponents(grid: readonly number[], width: number, height: number): Labeling {
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
 * the biome of the neighbor component it shares the longest border with
 * (ties: lower component id). Border counts come from the pass's snapshot, so
 * the result does not depend on processing order within a pass.
 */
function smoothConfetti(grid: number[], width: number, height: number, rules: BiomeRules): void {
  for (let pass = 0; pass < rules.smoothingPasses; pass += 1) {
    const { labels, components } = labelComponents(grid, width, height);
    const smallLabels: number[] = [];
    for (let label = 0; label < components.length; label += 1) {
      if ((components[label] as Component).cellCount < rules.minRegionCells) {
        smallLabels.push(label);
      }
    }
    if (smallLabels.length === 0) {
      return;
    }

    // Shared-border cell counts between adjacent components, from the snapshot.
    const borderCounts = new Map<number, Map<number, number>>();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const label = labels[index] as number;
        for (const neighbor of [index + 1, index + width]) {
          if (neighbor >= labels.length) {
            continue;
          }
          if (x === width - 1 && neighbor === index + 1) {
            continue;
          }
          const neighborLabel = labels[neighbor] as number;
          if (neighborLabel !== label) {
            bumpBorder(borderCounts, label, neighborLabel);
            bumpBorder(borderCounts, neighborLabel, label);
          }
        }
      }
    }

    const targetBiome = new Map<number, number>();
    for (const label of smallLabels) {
      const neighbors = borderCounts.get(label);
      if (neighbors === undefined) {
        continue; // single-component world; nothing to merge into
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
        targetBiome.set(label, (components[bestLabel] as Component).biome);
      }
    }
    if (targetBiome.size === 0) {
      return;
    }
    for (let index = 0; index < grid.length; index += 1) {
      const replacement = targetBiome.get(labels[index] as number);
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
