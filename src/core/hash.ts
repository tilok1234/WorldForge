/**
 * Fixed-width integer hash primitives (docs/decisions/ADR-0001-typescript.md,
 * "Determinism constraints").
 *
 * Every operation is defined on unsigned 32-bit integers: multiplication uses
 * `Math.imul` (exact 32-bit wrapping semantics) and every intermediate is
 * normalized with `>>> 0`. Inputs outside the 32-bit range wrap via `| 0`
 * before hashing — the documented coordinate hashing domain is int32. No
 * floating-point value ever influences a hash.
 */

/** Final avalanche mixer (murmur3 fmix32). Input and output are uint32. */
export function mix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Combine a uint32 into a running hash state. */
export function combine32(state: number, value: number): number {
  const mixed = mix32(value);
  let h = (state >>> 0) ^ mixed;
  h = Math.imul(h, 0x01000193) >>> 0; // FNV-1a prime keeps combination order-sensitive
  return h >>> 0;
}

/**
 * FNV-1a over the string's UTF-8 bytes, finished with mix32. Stable across
 * platforms because it never consults locale or normalization APIs.
 */
export function hashString32(text: string): number {
  const bytes = new TextEncoder().encode(text);
  let h = 0x811c9dc5;
  for (const byte of bytes) {
    h = (h ^ byte) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return mix32(h);
}

/**
 * Position hash: uncorrelated uint32 for (seed, x, y, salt). Coordinates wrap
 * to int32 (`| 0`); distinct odd constants decorrelate the axes so (x, y) and
 * (y, x) differ.
 */
export function hashCoords(seed: number, x: number, y: number, salt = 0): number {
  const hx = Math.imul(x | 0, 0x9e3779b1) >>> 0;
  const hy = Math.imul(y | 0, 0x85ebca77) >>> 0;
  let h = mix32(((seed >>> 0) ^ hx) >>> 0);
  h = mix32((h ^ hy) >>> 0);
  if (salt !== 0) {
    h = mix32((h ^ (salt >>> 0)) >>> 0);
  }
  return h >>> 0;
}
