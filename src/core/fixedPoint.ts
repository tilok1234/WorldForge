/**
 * Integer fixed-point helpers (docs/GENERATION_RULES.md, "Numeric
 * determinism"). Field values and thresholds are integers — typically permille
 * (0..1000) — so classification can never drift with platform floating-point
 * behavior. Rounding is always floor (toward negative infinity), via floorDiv,
 * so negative values round the same way everywhere.
 */

import { floorDiv } from "./coords.js";

export const PERMILLE_ONE = 1000;

export function clampInt(value: number, min: number, max: number): number {
  assertInt(value, "value");
  assertInt(min, "min");
  assertInt(max, "max");
  if (min > max) {
    throw new Error(`clamp range [${min}, ${max}] is inverted`);
  }
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation at tPermille/1000, floor-rounded. */
export function lerpPermille(a: number, b: number, tPermille: number): number {
  assertInt(a, "a");
  assertInt(b, "b");
  assertInt(tPermille, "tPermille");
  return a + floorDiv((b - a) * tPermille, PERMILLE_ONE);
}

/**
 * Map value from [fromLo, fromHi] to [toLo, toHi], floor-rounded. The source
 * range must be non-degenerate; the value is clamped into it first.
 */
export function remapInt(value: number, fromLo: number, fromHi: number, toLo: number, toHi: number): number {
  assertInt(toLo, "toLo");
  assertInt(toHi, "toHi");
  if (fromLo >= fromHi) {
    throw new Error(`remap source range [${fromLo}, ${fromHi}] is degenerate`);
  }
  const clamped = clampInt(value, fromLo, fromHi);
  return toLo + floorDiv((clamped - fromLo) * (toHi - toLo), fromHi - fromLo);
}

/**
 * Band classification: returns the index of the first threshold greater than
 * the value, i.e. band 0 is value < thresholds[0], the last band is value >=
 * every threshold. Thresholds must be strictly ascending integers.
 */
export function classifyByThresholds(value: number, thresholds: readonly number[]): number {
  assertInt(value, "value");
  for (let index = 0; index < thresholds.length; index += 1) {
    const threshold = thresholds[index] as number;
    assertInt(threshold, "threshold");
    if (index > 0 && threshold <= (thresholds[index - 1] as number)) {
      throw new Error("thresholds must be strictly ascending");
    }
  }
  for (let index = 0; index < thresholds.length; index += 1) {
    if (value < (thresholds[index] as number)) {
      return index;
    }
  }
  return thresholds.length;
}

function assertInt(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer, got ${String(value)}`);
  }
}
