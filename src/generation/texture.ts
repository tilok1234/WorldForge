/**
 * Terrain texture (behavior 39, terrain.texture v1): large single-material
 * regions gain fine-grained variety — small mottled patches in their
 * interiors and dithered edges where two ground materials meet — so a fen
 * is not one unbroken sheet of mud, a steppe not one sheet of dry grass.
 *
 * The pass is deliberately cosmetic-material only. It runs AFTER routes,
 * settlements, landmarks, and farm planning (nothing structural can move)
 * and BEFORE decoration (props and POIs follow the textured ground). Every
 * swap stays inside the walkable ground-material set — no cell ever gains
 * or loses walkability here; swamp, rock, water, and sand (whose beach law
 * demands adjacent standing water) are never written. Guards keep
 * corridors, structures, crops, fences, piers, fords, and river cells
 * untouched, and a closing sweep enforces the confetti law: no texture may
 * leave a one-cell 4-connected region, its own or an enclosed original.
 */

import { PALETTE_INDEX } from "../regions/biomes.js";
import { channel } from "../core/channels.js";
import type { ResolvedWorldConfig } from "../recipe/compile.js";
import { WATER_NONE, type HydrologyResult } from "../hydrology/hydrology.js";

const GRASS = PALETTE_INDEX["terrain.grass"];
const DRY_GRASS = PALETTE_INDEX["terrain.dry_grass"];
const MUD = PALETTE_INDEX["terrain.mud"];
const SNOW = PALETTE_INDEX["terrain.snow"];
const GRAVEL = PALETTE_INDEX["terrain.gravel"];

/** Ground materials the pass may read as texture substrate. */
const SOURCE = new Set<number>([GRASS, DRY_GRASS, MUD, SNOW]);

/**
 * Mottle pairs: interior patches of a large region become the paired
 * material. Chosen for in-world sense (grass tussocks in a fen, parched
 * patches in a meadow, gravelly hardpan in steppe, windswept scree in
 * snow) and for identical walkability on both sides of every swap.
 */
const MOTTLE_TARGET: ReadonlyMap<number, number> = new Map([
  [MUD, GRASS],
  [GRASS, DRY_GRASS],
  [DRY_GRASS, GRAVEL],
  [SNOW, GRAVEL],
]);

export interface TextureStats {
  readonly mottledCells: number;
  readonly ditheredCells: number;
}

export function applyTerrainTexture(
  grid: number[],
  structureLayer: Uint8Array | Uint16Array | number[],
  pathLayer: Uint8Array | number[],
  farmLayers: { readonly cropLayer: Uint8Array; readonly fenceLayer: Uint8Array; readonly pierLayer: Uint8Array },
  hydro: HydrologyResult,
  streetFordCells: ReadonlySet<number>,
  config: ResolvedWorldConfig,
): TextureStats {
  const rules = config.texture;
  const { width, height } = config.world;
  const jitter = channel(config.seed, "terrain.texture");

  const eligible = (index: number, x: number, y: number): boolean => {
    if (!SOURCE.has(grid[index] as number)) return false;
    if ((pathLayer[index] as number) !== 0) return false;
    if ((structureLayer[index] as number) !== 0) return false;
    if (farmLayers.cropLayer[index] !== 0 || farmLayers.fenceLayer[index] !== 0 || farmLayers.pierLayer[index] !== 0) {
      return false;
    }
    if (streetFordCells.has(index)) return false;
    if (hydro.waterKind[index] !== WATER_NONE || hydro.isRiver[index] === 1) return false;
    return x >= 1 && y >= 1 && x < width - 1 && y < height - 1;
  };

  // Every change the pass makes, so the confetti sweep can revert cleanly.
  const changed = new Map<number, "mottle" | "dither">();

  // Phase 1 — mottle seeds: interior cells (all 8 neighbours share the
  // material) roll for a patch seed, then 4-neighbours of each seed adopt
  // with their own roll, growing organic patches. Both steps read the
  // pre-pass snapshot so patches never cascade.
  const snapshot = grid.slice();
  const interior = (index: number, x: number, y: number): boolean => {
    const material = snapshot[index] as number;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        if (snapshot[(y + dy) * width + (x + dx)] !== material) return false;
      }
    }
    return true;
  };
  const seeds: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (!eligible(index, x, y)) continue;
      if (!interior(index, x, y)) continue;
      if (jitter.intAt(x, y, 0, 999, 0) >= rules.mottleSeedPermille) continue;
      grid[index] = MOTTLE_TARGET.get(snapshot[index] as number) as number;
      seeds.push(index);
      changed.set(index, "mottle");
    }
  }
  for (const seed of seeds) {
    const sx = seed % width;
    const sy = (seed - sx) / width;
    const material = snapshot[seed] as number;
    const target = MOTTLE_TARGET.get(material) as number;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = sx + dx;
      const y = sy + dy;
      const index = y * width + x;
      if (snapshot[index] !== material || changed.has(index)) continue;
      if (!eligible(index, x, y)) continue;
      if (jitter.intAt(x, y, 0, 999, 1) >= rules.mottleGrowPermille) continue;
      grid[index] = target;
      changed.set(index, "mottle");
    }
  }

  // Phase 2 — edge dithering: where two SOURCE materials meet, boundary
  // cells (enough 8-neighbours of the other material in the post-mottle
  // snapshot) flip with a roll, breaking ruler-straight threshold lines.
  const ditherBase = grid.slice();
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (changed.has(index)) continue;
      if (!eligible(index, x, y)) continue;
      const own = ditherBase[index] as number;
      const counts = new Map<number, number>();
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const neighbor = ditherBase[(y + dy) * width + (x + dx)] as number;
          if (neighbor !== own && SOURCE.has(neighbor)) {
            counts.set(neighbor, (counts.get(neighbor) ?? 0) + 1);
          }
        }
      }
      let best = -1;
      let bestCount = 0;
      for (const [material, count] of counts) {
        if (count > bestCount || (count === bestCount && material < best)) {
          best = material;
          bestCount = count;
        }
      }
      if (best < 0 || bestCount < rules.ditherNeighborMin) continue;
      if (jitter.intAt(x, y, 0, 999, 2) >= rules.ditherPermille) continue;
      grid[index] = best;
      changed.set(index, "dither");
    }
  }

  // Confetti sweep: regions are 4-connected, so any cell left without a
  // same-material 4-neighbour would become one-cell confetti and fail the
  // artifact validator. Revert textured singletons, and when texture has
  // ENCLOSED an untouched original cell, reopen it by reverting one
  // textured neighbour that shared its material. Iterate to a fixpoint;
  // each round reverts at least one change or exits.
  let dirty = true;
  while (dirty) {
    dirty = false;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const own = grid[index] as number;
        let connected = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (grid[ny * width + nx] === own) {
            connected = true;
            break;
          }
        }
        if (connected) continue;
        if (changed.has(index)) {
          grid[index] = snapshot[index] as number;
          changed.delete(index);
          dirty = true;
          continue;
        }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = ny * width + nx;
          if (changed.has(neighbor) && snapshot[neighbor] === own) {
            grid[neighbor] = snapshot[neighbor] as number;
            changed.delete(neighbor);
            dirty = true;
            break;
          }
        }
      }
    }
  }

  let mottledCells = 0;
  let ditheredCells = 0;
  for (const kind of changed.values()) {
    if (kind === "mottle") mottledCells += 1;
    else ditheredCells += 1;
  }
  return { mottledCells, ditheredCells };
}
