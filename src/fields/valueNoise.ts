/**
 * Integer-only value noise on the deterministic kernel. Lattice corners are
 * channel hashes reduced to permille; bilinear interpolation uses
 * lerpPermille with floor rounding. No floating point anywhere, so field
 * values are byte-identical on every platform by construction
 * (docs/GENERATION_RULES.md, "Numeric determinism").
 */

import type { Channel } from "../core/channels.js";
import { floorDiv, floorMod } from "../core/coords.js";
import { clampInt, lerpPermille } from "../core/fixedPoint.js";

export interface NoiseOctave {
  /** Lattice cell size as a power of two (cellSize = 2^cellSizeLog2). */
  readonly cellSizeLog2: number;
  /** Contribution weight in permille; octave weights should sum to 1000. */
  readonly weightPermille: number;
}

/** Single-octave value noise in [0, 1000). The octave index salts the lattice. */
export function valueNoisePermille(
  channel: Channel,
  x: number,
  y: number,
  cellSizeLog2: number,
  salt: number,
): number {
  const size = 1 << cellSizeLog2;
  const x0 = floorDiv(x, size);
  const y0 = floorDiv(y, size);
  const tx = floorDiv(floorMod(x, size) * 1000, size);
  const ty = floorDiv(floorMod(y, size) * 1000, size);
  const c00 = channel.hashAt(x0, y0, salt) % 1000;
  const c10 = channel.hashAt(x0 + 1, y0, salt) % 1000;
  const c01 = channel.hashAt(x0, y0 + 1, salt) % 1000;
  const c11 = channel.hashAt(x0 + 1, y0 + 1, salt) % 1000;
  const top = lerpPermille(c00, c10, tx);
  const bottom = lerpPermille(c01, c11, tx);
  return lerpPermille(top, bottom, ty);
}

/** Weighted multi-octave value noise in [0, 1000). */
export function fbmPermille(
  channel: Channel,
  x: number,
  y: number,
  octaves: readonly NoiseOctave[],
): number {
  let accumulated = 0;
  for (let index = 0; index < octaves.length; index += 1) {
    const octave = octaves[index] as NoiseOctave;
    const sample = valueNoisePermille(channel, x, y, octave.cellSizeLog2, index + 1);
    accumulated += floorDiv(sample * octave.weightPermille, 1000);
  }
  return clampInt(accumulated, 0, 999);
}

/**
 * Linear north-south gradient: +biasPermille/2 at the north edge (y = 0),
 * -biasPermille/2 at the south edge, floor-rounded, zero for a 1-cell world.
 */
export function northGradientPermille(y: number, height: number, biasPermille: number): number {
  if (height <= 1 || biasPermille === 0) {
    return 0;
  }
  return floorDiv(biasPermille * (height - 1 - 2 * y), 2 * (height - 1));
}
