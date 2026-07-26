/**
 * Macro field compiler (docs/ARCHITECTURE_AND_CONTRACTS.md, component 4).
 * Produces the elevation, moisture, and temperature fields for the whole
 * finite world as integer permille grids on named channels.
 */

import { channel } from "../core/channels.js";
import { clampInt } from "../core/fixedPoint.js";
import type { MacroFieldSpec, ResolvedWorldConfig } from "../recipe/compile.js";
import { fbmPermille, northGradientPermille } from "./valueNoise.js";

export interface MacroFields {
  readonly width: number;
  readonly height: number;
  /** Row-major permille grids, one value per world cell. */
  readonly elevation: readonly number[];
  readonly moisture: readonly number[];
  readonly temperature: readonly number[];
}

export function buildMacroFields(config: ResolvedWorldConfig): MacroFields {
  const { width, height } = config.world;
  return {
    width,
    height,
    elevation: buildField(config, "macro.elevation", config.macroFields.elevation),
    moisture: buildField(config, "macro.moisture", config.macroFields.moisture),
    temperature: buildField(config, "macro.temperature", config.macroFields.temperature),
  };
}

function buildField(config: ResolvedWorldConfig, channelName: string, spec: MacroFieldSpec): number[] {
  const { width, height } = config.world;
  const fieldChannel = channel(config.seed, channelName);
  const values = new Array<number>(width * height);
  for (let y = 0; y < height; y += 1) {
    const gradient = northGradientPermille(y, height, spec.northGradientPermille);
    for (let x = 0; x < width; x += 1) {
      const noise = fbmPermille(fieldChannel, x, y, spec.octaves);
      values[y * width + x] = clampInt(noise + spec.offsetPermille + gradient, 0, 999);
    }
  }
  return values;
}
