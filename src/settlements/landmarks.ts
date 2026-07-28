/**
 * Authored landmark stamps (docs/GENERATION_RULES.md, "Landmarks and authored
 * content"; Milestone W5). Stamps are versioned WorldForge-owned inputs under
 * fixtures/stamps/. Placement validates substrate, writes material and
 * structure cells atomically, carves a trail approach from the gate, and
 * blends the surroundings with a channel-driven gravel scatter so the edge is
 * never an unexplained hard rectangle.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { channel } from "../core/channels.js";
import type { ResolvedWorldConfig } from "../recipe/compile.js";
import type { HydrologyResult } from "../hydrology/hydrology.js";
import { WATER_NONE } from "../hydrology/hydrology.js";
import type { MacroFields } from "../fields/macroFields.js";
import type { RoutesResult } from "../routes/routes.js";
import { PALETTE_INDEX, WORLD_PALETTE, type PaletteKey } from "../regions/biomes.js";
import { STRUCTURE_LAYER_VALUE, type StructureType } from "./structures.js";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const COBBLE = PALETTE_INDEX["terrain.cobble"];
const PACKED_ROAD = PALETTE_INDEX["terrain.packed_road"];
const GRAVEL = PALETTE_INDEX["terrain.gravel"];

interface Stamp {
  readonly type: string;
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly entranceX: number;
  readonly entranceY: number;
  readonly maxSlopePermille: number;
  readonly blendRadius: number;
  /** Per cell: material palette index or -1, structure layer value or 0. */
  readonly material: readonly number[];
  readonly structure: readonly number[];
  /** 1 where the legend marks road: "ruined" (the old kingdom's streets). */
  readonly ruinedRoad: readonly number[];
}

export interface LandmarkPlan {
  readonly id: number;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly entranceX: number;
  readonly entranceY: number;
  /** World cell indexes rendered as ruined road by the adapter. */
  readonly ruinedRoadCells?: readonly number[];
}

const stampCache = new Map<string, Stamp>();

/** The recipe.<name> namespace: authored per-recipe stamps (behavior 36). */
const RECIPE_STAMP_PREFIX = "recipe.";

/**
 * Parse and structurally validate one stampFormat-1 definition. Shared by the
 * fixture loader below and the recipe validator (per-recipe authored stamps
 * go through exactly the same checks as the committed library).
 */
export function parseStampDefinition(input: unknown, type: string): Stamp {
  const raw = input as {
    stampFormat: number;
    type: string;
    footprint: { width: number; height: number };
    anchor: { x: number; y: number };
    entrance: { x: number; y: number };
    substrate: { maxSlopePermille: number };
    blendRadius: number;
    legend: Record<string, { structure?: string; material?: string; road?: string }>;
    cells: string[];
  };
  if (raw === null || typeof raw !== "object") {
    throw new Error(`stamp ${type}: definition must be an object`);
  }
  if (raw.stampFormat !== 1 || raw.type !== type) {
    throw new Error(`stamp ${type}: unsupported format or mismatched type`);
  }
  const { width, height } = raw.footprint;
  if (raw.cells.length !== height || raw.cells.some((row) => row.length !== width)) {
    throw new Error(`stamp ${type}: cells must be ${width}x${height}`);
  }
  const material = new Array<number>(width * height).fill(-1);
  const structure = new Array<number>(width * height).fill(0);
  const ruinedRoad = new Array<number>(width * height).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const token = (raw.cells[y] as string)[x] as string;
      if (token === ".") {
        continue;
      }
      const entry = raw.legend[token];
      if (entry === undefined) {
        throw new Error(`stamp ${type}: cell token "${token}" missing from legend`);
      }
      if (entry.material !== undefined) {
        if (!(WORLD_PALETTE as readonly string[]).includes(entry.material)) {
          throw new Error(`stamp ${type}: unknown material ${entry.material}`);
        }
        material[y * width + x] = PALETTE_INDEX[entry.material as PaletteKey];
      }
      if (entry.structure !== undefined) {
        const value = STRUCTURE_LAYER_VALUE[entry.structure as StructureType];
        if (value === undefined) {
          throw new Error(`stamp ${type}: unknown structure ${entry.structure}`);
        }
        structure[y * width + x] = value;
      }
      if (entry.road !== undefined) {
        if (entry.road !== "ruined") {
          throw new Error(`stamp ${type}: unknown road kind ${entry.road}`);
        }
        ruinedRoad[y * width + x] = 1;
      }
    }
  }
  return {
    type,
    width,
    height,
    anchorX: raw.anchor.x,
    anchorY: raw.anchor.y,
    entranceX: raw.entrance.x,
    entranceY: raw.entrance.y,
    maxSlopePermille: raw.substrate.maxSlopePermille,
    blendRadius: raw.blendRadius,
    material,
    structure,
    ruinedRoad,
  };
}

/**
 * Resolve a stamp by type: "recipe.<name>" reads the authored per-recipe
 * definitions (never cached — they differ per world), everything else the
 * committed fixture library (cached — fixtures are process-stable).
 */
export function loadStamp(
  type: string,
  authoredStamps?: Readonly<Record<string, unknown>>,
): Stamp {
  if (type.startsWith(RECIPE_STAMP_PREFIX)) {
    const name = type.slice(RECIPE_STAMP_PREFIX.length);
    const raw = authoredStamps?.[name];
    if (raw === undefined) {
      throw new Error(`stamp ${type}: no authored stamp named "${name}" in this recipe`);
    }
    return parseStampDefinition(raw, type);
  }
  const cached = stampCache.get(type);
  if (cached !== undefined) {
    return cached;
  }
  const path = join(ROOT, "fixtures", "stamps", `${type.replaceAll("_", "-")}.json`);
  const stamp = parseStampDefinition(JSON.parse(readFileSync(path, "utf8")), type);
  stampCache.set(type, stamp);
  return stamp;
}

export function placeLandmarks(
  grid: number[],
  structureLayer: Uint8Array,
  pathLayer: Uint8Array,
  fields: MacroFields,
  hydro: HydrologyResult,
  routes: RoutesResult,
  config: ResolvedWorldConfig,
  errors: string[],
): LandmarkPlan[] {
  const { width, height } = fields;
  const plans: LandmarkPlan[] = [];
  const blend = channel(config.seed, "landmark.blend");
  const anchors = routes.destinations.filter((d) => d.kind === "landmark_candidate");

  for (let slot = 0; slot < anchors.length; slot += 1) {
    const spec = config.landmarkSpecs[slot] ?? { type: "ancient_fortress", relation: null, at: null, near: null };
    const stamp = loadStamp(spec.type, config.authoring.stamps);
    const anchorCell = (anchors[slot] as { cell: number }).cell;
    const anchorX = anchorCell % width;
    const anchorY = (anchorCell - anchorX) / width;
    const originX = anchorX - stamp.anchorX;
    const originY = anchorY - stamp.anchorY;

    const problem = substrateProblem(originX, originY, stamp, grid, structureLayer, fields, hydro, width, height);
    if (problem !== null) {
      errors.push(`landmark ${slot} (${spec.type}) cannot be stamped: ${problem}`);
      continue;
    }

    for (let sy = 0; sy < stamp.height; sy += 1) {
      for (let sx = 0; sx < stamp.width; sx += 1) {
        const cell = (originY + sy) * width + originX + sx;
        const stampIndex = sy * stamp.width + sx;
        const material = stamp.material[stampIndex] as number;
        if (material !== -1) {
          grid[cell] = material;
        }
        const structure = stamp.structure[stampIndex] as number;
        // A ruined city's wall BREACHES where an old trail passes
        // (behavior 47): routes soft-avoid stamp footprints, but in a
        // mountain notch the only corridor may thread the site — painting
        // the wall over that trail severed the-eight-lands' west spur.
        // Ruins keep crumbled gaps; intact landmarks keep their walls.
        if (structure !== 0 && !(spec.type === "ruined_city" && pathLayer[cell] !== 0)) {
          structureLayer[cell] = structure;
          // A building interrupts any trail it covers (behavior 47).
          // Leaving pathLayer set under walls made the compose-time graph
          // walk THROUGH buildings and let the approach carver "join" a
          // severed trail under the stamp (the-eight-lands' lodge sat
          // astride its own spur with a dead-end approach). The gateway
          // repaint below restores the gate's pass line.
          pathLayer[cell] = 0;
        }
      }
    }

    // Gate approach joins the trail network so the landmark stays
    // reachable. Approach cells that cross bare rock are graded to gravel
    // (landmarks.stamps v2): a mountain landmark earns a real climbing
    // path, and the walkable network reaches its gate.
    const gateX = originX + stamp.entranceX;
    const gateY = originY + stamp.entranceY;
    const approach = carveTrailApproach(
      gateX,
      gateY + 1,
      grid,
      structureLayer,
      pathLayer,
      hydro,
      width,
      height,
      { x0: originX, y0: originY, x1: originX + stamp.width - 1, y1: originY + stamp.height - 1 },
    );
    const rockIndex = PALETTE_INDEX["terrain.rock"];
    for (const cell of approach) {
      if (grid[cell] === rockIndex) {
        grid[cell] = GRAVEL;
      }
    }
    // The gateway itself joins the trail (behavior 24): the corridor runs
    // through the arch, so the gate is corridor-reachable on its own and
    // never depends on a lucky through-trail.
    const gateCell = gateY * width + gateX;
    if (hydro.waterKind[gateCell] === WATER_NONE && hydro.isRiver[gateCell] === 0) {
      pathLayer[gateCell] = 1;
      if (grid[gateCell] === rockIndex) {
        grid[gateCell] = GRAVEL;
      }
    }

    // Procedural blending: gravel scatter fading outward, never a hard edge.
    const probabilities = [650, 400, 180];
    for (let ring = 1; ring <= stamp.blendRadius; ring += 1) {
      const probability = probabilities[ring - 1] ?? 120;
      for (let sy = -ring; sy < stamp.height + ring; sy += 1) {
        for (let sx = -ring; sx < stamp.width + ring; sx += 1) {
          const onRing =
            sx === -ring || sy === -ring || sx === stamp.width + ring - 1 || sy === stamp.height + ring - 1;
          if (!onRing) {
            continue;
          }
          const x = originX + sx;
          const y = originY + sy;
          if (x < 0 || y < 0 || x >= width || y >= height) {
            continue;
          }
          const cell = y * width + x;
          if (
            hydro.waterKind[cell] === WATER_NONE &&
            hydro.isRiver[cell] === 0 &&
            structureLayer[cell] === 0 &&
            grid[cell] !== COBBLE &&
            grid[cell] !== PACKED_ROAD &&
            pathLayer[cell] === 0 &&
            blend.chanceAt(x, y, probability)
          ) {
            grid[cell] = GRAVEL;
          }
        }
      }
    }

    const ruinedRoadCells: number[] = [];
    for (let sy = 0; sy < stamp.height; sy += 1) {
      for (let sx = 0; sx < stamp.width; sx += 1) {
        if (stamp.ruinedRoad[sy * stamp.width + sx] === 1) {
          ruinedRoadCells.push((originY + sy) * width + originX + sx);
        }
      }
    }

    plans.push({
      id: slot,
      type: spec.type,
      x: originX,
      y: originY,
      width: stamp.width,
      height: stamp.height,
      entranceX: gateX,
      entranceY: gateY,
      ...(ruinedRoadCells.length === 0 ? {} : { ruinedRoadCells }),
    });
  }
  return plans;
}

function substrateProblem(
  originX: number,
  originY: number,
  stamp: Stamp,
  grid: readonly number[],
  structureLayer: Uint8Array,
  fields: MacroFields,
  hydro: HydrologyResult,
  width: number,
  height: number,
): string | null {
  if (originX < 1 || originY < 1 || originX + stamp.width >= width - 1 || originY + stamp.height >= height - 1) {
    return "footprint leaves the world interior";
  }
  const anchorElevation = fields.elevation[(originY + stamp.anchorY) * width + originX + stamp.anchorX] as number;
  for (let sy = 0; sy < stamp.height; sy += 1) {
    for (let sx = 0; sx < stamp.width; sx += 1) {
      const cell = (originY + sy) * width + originX + sx;
      if (hydro.waterKind[cell] !== WATER_NONE || hydro.isRiver[cell] === 1) {
        return `water inside the footprint at (${originX + sx}, ${originY + sy})`;
      }
      if (structureLayer[cell] !== 0) {
        return "another structure occupies the footprint";
      }
      if (grid[cell] === COBBLE || grid[cell] === PACKED_ROAD) {
        return "a street or road crosses the footprint";
      }
      if (Math.abs((fields.elevation[cell] as number) - anchorElevation) > stamp.maxSlopePermille) {
        return "substrate is too steep";
      }
    }
  }
  return null;
}

function carveTrailApproach(
  startX: number,
  startY: number,
  grid: readonly number[],
  structureLayer: Uint8Array,
  pathLayer: Uint8Array,
  hydro: HydrologyResult,
  width: number,
  height: number,
  /** The stamp's own footprint: its internal cobble (courtyards) and gate
   *  lines must not count as "the network" — an enclosed yard would
   *  satisfy the corridor test without ever reaching the world. */
  ownStamp?: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number },
): number[] {
  const carved: number[] = [];
  const start = startY * width + startX;
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) {
    return carved;
  }
  // A trail cell only counts as "the network" if its segment actually
  // reaches a corridor (behavior 47): stamps now interrupt trails they
  // cover, which can orphan a stub on the far side of a building — the
  // lodge's dead-end approach "joined" exactly such a stub. Bounded
  // segment flood, memoized per call.
  const insideOwnStamp = (cell: number): boolean => {
    if (ownStamp === undefined) return false;
    const x = cell % width;
    const y = (cell - x) / width;
    return x >= ownStamp.x0 && x <= ownStamp.x1 && y >= ownStamp.y0 && y <= ownStamp.y1;
  };
  const corridorHere = (cell: number): boolean =>
    (grid[cell] === PACKED_ROAD || grid[cell] === COBBLE) && !insideOwnStamp(cell);
  const segmentVerdict = new Map<number, boolean>();
  const segmentReachesCorridor = (fromCell: number): boolean => {
    const known = segmentVerdict.get(fromCell);
    if (known !== undefined) return known;
    const seen = new Set<number>([fromCell]);
    const segment = [fromCell];
    let reaches = false;
    for (let head = 0; head < segment.length && head < 4096 && !reaches; head += 1) {
      const cell = segment[head] as number;
      const x = cell % width;
      const y = (cell - x) / width;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (corridorHere(next)) {
          reaches = true;
          break;
        }
        if (!seen.has(next) && pathLayer[next] !== 0) {
          seen.add(next);
          segment.push(next);
        } else if (hydro.isRiver[next] === 1) {
          // Trails continue across fords (runs of <= 2 stream cells): hop
          // the ford-width gap or the flood dead-ends at every stream bank
          // and calls a whole wet-world network an orphan (drowned-fen).
          for (const hop of [2, 3] as const) {
            const hx = x + dx * hop;
            const hy = y + dy * hop;
            if (hx < 0 || hy < 0 || hx >= width || hy >= height) break;
            const across = hy * width + hx;
            if (hop === 3 && hydro.isRiver[(y + dy * 2) * width + x + dx * 2] !== 1) break;
            if (corridorHere(across)) {
              reaches = true;
              break;
            }
            if (pathLayer[across] !== 0) {
              if (!seen.has(across)) {
                seen.add(across);
                segment.push(across);
              }
              break;
            }
          }
          if (reaches) break;
        }
      }
    }
    for (const cell of seen) segmentVerdict.set(cell, reaches);
    return reaches;
  };
  // Two passes: prefer targets whose segment provably reaches a corridor;
  // when none exists within bounds (segments can legitimately reach the
  // network in ways this conservative test cannot see), fall back to any
  // outside-stamp trail — never leave a gate stranded that the pre-47
  // carver would have joined. The CLI reachability gate remains the final
  // arbiter of whether the world ships.
  for (const requireCorridor of [true, false]) {
    const previous = new Map<number, number>();
    const queue = [start];
    previous.set(start, -1);
    for (let head = 0; head < queue.length && head < 4096; head += 1) {
      const cell = queue[head] as number;
      const isTarget =
        corridorHere(cell) ||
        (pathLayer[cell] !== 0 &&
          !insideOwnStamp(cell) &&
          (!requireCorridor || segmentReachesCorridor(cell)));
      if (isTarget && cell !== start) {
        let cursor: number = previous.get(cell) as number;
        while (cursor !== -1) {
          if (pathLayer[cursor] === 0 && hydro.waterKind[cursor] === WATER_NONE && hydro.isRiver[cursor] === 0) {
            pathLayer[cursor] = 1;
            carved.push(cursor);
          }
          cursor = previous.get(cursor) as number;
        }
        return carved;
      }
      const x = cell % width;
      const y = (cell - x) / width;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const next = ny * width + nx;
        if (previous.has(next) || structureLayer[next] !== 0) {
          continue;
        }
        if (hydro.waterKind[next] === WATER_NONE && hydro.isRiver[next] === 0) {
          previous.set(next, cell);
          queue.push(next);
        }
      }
    }
  }
  return carved;
}
