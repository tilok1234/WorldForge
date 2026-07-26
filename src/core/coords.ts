/**
 * Canonical coordinate conventions (docs/ARCHITECTURE_AND_CONTRACTS.md,
 * "Coordinate and hash kernel"; artifact `coordinates` block).
 *
 * World cells use (x, y) with origin top-left, x increasing eastward, y
 * increasing southward. Chunk coordinates divide world coordinates by the
 * chunk dimensions using floor division, so negative world coordinates map to
 * negative chunk coordinates without a double-width chunk at zero. Cell and
 * chunk iteration is row-major.
 *
 * Supported coordinate domain: safe integers. Division helpers throw on a
 * zero divisor and on non-integer inputs rather than guessing.
 */

export interface ChunkCoord {
  readonly cx: number;
  readonly cy: number;
}

export interface LocalCoord {
  readonly lx: number;
  readonly ly: number;
}

/**
 * Floor division: rounds toward negative infinity. floorDiv(-7, 3) === -3.
 * Computed from the exact integer remainder rather than flooring a float
 * quotient, which can mis-round near the safe-integer extremes.
 */
export function floorDiv(value: number, divisor: number): number {
  assertIntegerPair(value, divisor);
  const truncRemainder = value % divisor;
  const truncQuotient = (value - truncRemainder) / divisor;
  return truncRemainder !== 0 && (truncRemainder < 0) !== (divisor < 0)
    ? truncQuotient - 1
    : truncQuotient;
}

/** Floor modulo: result has the divisor's sign magnitude range [0, |d|) for d > 0. */
export function floorMod(value: number, divisor: number): number {
  assertIntegerPair(value, divisor);
  const remainder = value % divisor;
  return remainder !== 0 && (remainder < 0) !== (divisor < 0) ? remainder + divisor : remainder;
}

export function worldToChunk(x: number, y: number, chunkWidth: number, chunkHeight: number): ChunkCoord {
  return { cx: floorDiv(x, chunkWidth), cy: floorDiv(y, chunkHeight) };
}

export function worldToLocal(x: number, y: number, chunkWidth: number, chunkHeight: number): LocalCoord {
  return { lx: floorMod(x, chunkWidth), ly: floorMod(y, chunkHeight) };
}

/** World coordinate of a chunk's top-left cell. */
export function chunkOrigin(cx: number, cy: number, chunkWidth: number, chunkHeight: number): { x: number; y: number } {
  assertIntegerPair(cx, chunkWidth);
  assertIntegerPair(cy, chunkHeight);
  return { x: cx * chunkWidth, y: cy * chunkHeight };
}

/** Row-major index of a cell inside a width-wide grid. */
export function cellIndexRowMajor(lx: number, ly: number, width: number): number {
  assertIntegerPair(lx, width);
  if (!Number.isSafeInteger(ly)) {
    throw new Error("cell coordinates must be integers");
  }
  if (lx < 0 || lx >= width || ly < 0) {
    throw new Error(`cell (${lx}, ${ly}) is outside a width-${width} row-major grid`);
  }
  return ly * width + lx;
}

function assertIntegerPair(value: number, divisor: number): void {
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(divisor)) {
    throw new Error("coordinate math requires safe integers");
  }
  if (divisor === 0) {
    throw new Error("divisor must not be zero");
  }
}
