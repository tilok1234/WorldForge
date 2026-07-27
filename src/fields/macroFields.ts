/**
 * Macro field compiler (docs/ARCHITECTURE_AND_CONTRACTS.md, component 4).
 * Produces the elevation, moisture, and temperature fields for the whole
 * finite world as integer permille grids on named channels.
 */

import { channel } from "../core/channels.js";
import { clampInt } from "../core/fixedPoint.js";
import type { MacroFieldSpec, ResolvedWorldConfig, ZoneRules } from "../recipe/compile.js";
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
  // Zone composition (behavior 43, macro.fields v7): per-zone climate
  // character as additive per-cell offset maps. Elevation stays global —
  // one landmass, one sea level, which is what keeps the world seamless.
  const zoneTemperature = zoneOffsetMap(config, width, height, (zones) => zones.temperatureOffsets);
  const zoneMoisture = zoneOffsetMap(config, width, height, (zones) => zones.moistureOffsets);
  const elevation = buildField(config, "macro.elevation", config.macroFields.elevation, null);
  const temperature = buildField(config, "macro.temperature", config.macroFields.temperature, zoneTemperature);

  // Snow-elevation coupling (macro.fields v2): above the start elevation,
  // temperature falls with altitude so peaks read cold before biome rules run.
  const lapse = config.macroFields.temperatureLapse;
  for (let index = 0; index < temperature.length; index += 1) {
    const above = (elevation[index] as number) - lapse.startElevationPermille;
    if (above > 0) {
      const drop = Math.trunc((above * lapse.strengthPermille) / 1000);
      temperature[index] = clampInt((temperature[index] as number) - drop, 0, 999);
    }
  }

  return {
    width,
    height,
    elevation,
    moisture: buildField(config, "macro.moisture", config.macroFields.moisture, zoneMoisture),
    temperature,
  };
}

function buildField(
  config: ResolvedWorldConfig,
  channelName: string,
  spec: MacroFieldSpec,
  zoneOffsets: readonly number[] | null,
): number[] {
  const { width, height } = config.world;
  const fieldChannel = channel(config.seed, channelName);
  const values = new Array<number>(width * height);
  for (let y = 0; y < height; y += 1) {
    const gradient = northGradientPermille(y, height, spec.northGradientPermille);
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const noise = fbmPermille(fieldChannel, x, y, spec.octaves);
      const zone = zoneOffsets === null ? 0 : (zoneOffsets[index] as number);
      values[index] = clampInt(noise + spec.offsetPermille + gradient + zone, 0, 999);
    }
  }
  return values;
}

/**
 * Per-cell additive offset map for one field. Hard seams (behavior 44):
 * the zone lookup is warped by smooth deterministic noise up to
 * seamJitterCells, so borders stay SHARP but meander like real frontiers
 * instead of running ruler-straight; a 2-cell settle blur de-aliases the
 * wandering line without softening the zone identity. Blended seams: the
 * unwarped map is smoothed with a separable integer box blur of
 * seamBandCells, producing a climate gradient roughly two bands wide.
 * Returns null when the zones carry no offsets for this field, so
 * zone-free worlds pay nothing.
 */
function zoneOffsetMap(
  config: ResolvedWorldConfig,
  width: number,
  height: number,
  pick: (zones: ZoneRules) => readonly number[],
): number[] | null {
  const zones = config.zones;
  if (zones === null) return null;
  const offsets = pick(zones);
  if (offsets.every((value) => value === 0)) return null;
  const zoneWidth = zones.layout === "grid" ? Math.trunc(width / zones.gridColumns) : 0;
  const zoneHeight = zones.layout === "grid" ? Math.trunc(height / zones.gridRows) : 0;
  const jitter = zones.seams === "hard" ? channel(config.seed, "zones.seam") : null;
  const wanderOctaves = [
    { cellSizeLog2: 5, weightPermille: 700 },
    { cellSizeLog2: 3, weightPermille: 300 },
  ];
  const map = new Array<number>(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sampleX = x;
      let sampleY = y;
      if (jitter !== null) {
        // fbm 0-999 -> [-seamJitterCells, +seamJitterCells], smooth in space.
        const wx = fbmPermille(jitter, x, y, wanderOctaves);
        const wy = fbmPermille(jitter, x + 4096, y + 4096, wanderOctaves);
        sampleX = x + Math.trunc(((wx - 500) * zones.seamJitterCells) / 500);
        sampleY = y + Math.trunc(((wy - 500) * zones.seamJitterCells) / 500);
        sampleX = Math.min(width - 1, Math.max(0, sampleX));
        sampleY = Math.min(height - 1, Math.max(0, sampleY));
      }
      map[y * width + x] = offsets[zoneAt(zones, sampleX, sampleY, zoneWidth, zoneHeight)] as number;
    }
  }
  if (zones.seams === "hard") {
    return boxBlur(boxBlur(map, width, height, 2, true), width, height, 2, false);
  }
  return boxBlur(boxBlur(map, width, height, zones.seamBandCells, true), width, height, zones.seamBandCells, false);
}

/**
 * Which zone owns a cell. Grid layout: uniform tiling. Anchors layout
 * (behavior 45): weighted nearest anchor — territory belongs to the anchor
 * minimizing distance/weight, compared in integers as d²·w'² < d'²·w², so
 * heavier zones claim proportionally more land and shapes follow the
 * authored anchor geography instead of squares.
 */
function zoneAt(zones: ZoneRules, x: number, y: number, zoneWidth: number, zoneHeight: number): number {
  if (zones.layout === "grid") {
    const row = Math.min(zones.gridRows - 1, Math.trunc(y / zoneHeight));
    const column = Math.min(zones.gridColumns - 1, Math.trunc(x / zoneWidth));
    return row * zones.gridColumns + column;
  }
  let best = 0;
  let bestDist2 = Number.MAX_SAFE_INTEGER;
  let bestWeight = 1;
  for (let zone = 0; zone < zones.anchors.length; zone += 1) {
    const anchor = zones.anchors[zone] as readonly [number, number];
    const dx = x - anchor[0];
    const dy = y - anchor[1];
    const dist2 = dx * dx + dy * dy;
    const weight = zones.weights[zone] as number;
    // dist2 / weight² < bestDist2 / bestWeight² without division:
    if (dist2 * bestWeight * bestWeight < bestDist2 * weight * weight) {
      best = zone;
      bestDist2 = dist2;
      bestWeight = weight;
    }
  }
  return best;
}

/** Edge-clamped integer box blur along one axis (deterministic). */
function boxBlur(
  values: readonly number[],
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
): number[] {
  const result = new Array<number>(values.length);
  const span = 2 * radius + 1;
  const lanes = horizontal ? height : width;
  const length = horizontal ? width : height;
  for (let lane = 0; lane < lanes; lane += 1) {
    for (let position = 0; position < length; position += 1) {
      let sum = 0;
      for (let delta = -radius; delta <= radius; delta += 1) {
        const clamped = Math.min(length - 1, Math.max(0, position + delta));
        sum += horizontal
          ? (values[lane * width + clamped] as number)
          : (values[clamped * width + lane] as number);
      }
      const index = horizontal ? lane * width + position : position * width + lane;
      result[index] = Math.trunc(sum / span);
    }
  }
  return result;
}
