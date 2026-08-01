/**
 * WALKABLE WOODS re-spacing — ARCHIVED, NOT WIRED INTO GENERATION.
 *
 * Built for planning sl-0075 (2026-08-01), validated end to end
 * (cluster gates over six seeds, per-species counts byte-equal, floods
 * typed TS=Godot, the game's diag_pinch census 1143 -> 258 on-flood
 * prop pinches) and designer-render-approved — then PARKED UNRELEASED
 * the same day: sl-0075 closed SUPERSEDED by the art-direction ruling
 * (prop composition ships as authored; navigation through prop fields
 * is solved game-side by art-matched prop collision, sl-0078). No
 * behavior number consumed. The module stays callable as a possible
 * future designer-OPT-IN art tool, exercised by tests/walkableWoods
 * so it cannot rot; wiring it back into composeWorld is a designer
 * decision, never a refactor.
 *
 * Wilderness prop fields are POROUS: the player weaves BETWEEN trees, a
 * copse never forces rim-walking, and solid walls stay reserved for
 * deliberate barriers (cliffs, built walls, authored hedges). The rule's
 * mechanical gates, designer-tunable:
 *
 *   1. connected solid-prop clusters <= MAX_CLUSTER cells (8-connected,
 *      pairs ORTHOGONAL only — a diagonal pair is exactly the zero-width
 *      corner-touch pinch of the sl-0072 census);
 *   2. bounded detour (<= 2.0x straight line around/inside a field);
 *   3. a weave lane through any band every ~4 cells of frontage.
 *
 * Gate 1 plus the orthogonal-pair discipline CONSTRUCTS gates 2 and 3:
 * clusters cap at two cells with cheb >= 2 separation, so every band has
 * an opening within any 3 cells of frontage and local detours stay under
 * 2x. Gates 2/3 are measured, not enforced, by the validation tooling.
 *
 * Implementation is RELOCATION, never deletion (W-13: density preserved —
 * the designer's word gates any thinning): governed solids that violate
 * the cluster rule move to the nearest legal same-material cell in a
 * deterministic spiral. Governed = the wilderness scatter writers only
 * (forest roll, flat scatter, character zones — decorate marks them in
 * wildernessProps); POI dressing, farm/orchard/pen pieces, roadside
 * markers, shore vignettes, settlement furniture and every other authored
 * arrangement is immovable, and governed solids may not even touch one
 * (8-adjacency), so ambient trees can never extend an authored wall.
 */

import { channel } from "../core/channels.js";
import { PALETTE_INDEX } from "../regions/biomes.js";
import { WATER_NONE, type HydrologyResult } from "../hydrology/hydrology.js";
import { DECOR_TYPES, PROP_WALKABILITY, TWO_PART_KEYS, type DecorationResult } from "./decorate.js";

/** Gate 1: largest permitted connected solid cluster (designer knob). */
const MAX_CLUSTER = 2;
/**
 * Relocation search cap, chebyshev rings around the origin (knob). Rings
 * are searched nearest-first, so only the desperate travel: a copse jammed
 * over the ~33% porosity ceiling (the pair-packing maximum) MUST shed its
 * excess outward, and the border-jammed strips need the reach.
 */
const RELOCATE_RADIUS = 32;

/** Terrain families that read as solid ground (bog per the sl-0072 probe). */
const TERRAIN_SOLID = new Set<number>([
  PALETTE_INDEX["terrain.rock"],
  PALETTE_INDEX["terrain.swamp"],
]);

export interface RespaceResult {
  /** Governed solids left in place (already legal). */
  readonly kept: number;
  /** Governed solids relocated to a nearby legal cell. */
  readonly moved: number;
  /** Violations with no legal cell in range — kept in place, reported. */
  readonly stuck: number;
}

interface RespaceArgs {
  readonly grid: readonly number[];
  readonly width: number;
  readonly height: number;
  readonly structureLayer: Uint8Array;
  readonly hydro: HydrologyResult;
  readonly pathLayer: Uint8Array;
  readonly fenceLayer: Uint8Array;
  readonly pierLayer: Uint8Array;
  readonly cropLayer: Uint8Array;
  readonly decoration: DecorationResult;
  readonly seed: number;
}

export function respaceWildernessProps(args: RespaceArgs): RespaceResult {
  const { grid, width, height, structureLayer, hydro, pathLayer, fenceLayer, pierLayer, cropLayer, decoration, seed } = args;
  const { propLayer, decalLayer, mossLayer, wildernessProps, protectedCells, fordCells } = decoration;
  const cellCount = width * height;
  const ring = channel(seed, "decor.respace");

  const blockingType = new Uint8Array(DECOR_TYPES.length + 1);
  const twoPartType = new Uint8Array(DECOR_TYPES.length + 1);
  DECOR_TYPES.forEach((key, index) => {
    if (PROP_WALKABILITY[key] !== "carpet") blockingType[index + 1] = 1;
    if (TWO_PART_KEYS.has(key)) twoPartType[index + 1] = 1;
  });

  const blockingProp = (cell: number): boolean => blockingType[propLayer[cell] as number] === 1;
  const terrainSolid = (cell: number): boolean =>
    TERRAIN_SOLID.has(grid[cell] as number) ||
    hydro.waterKind[cell] !== WATER_NONE ||
    hydro.isMajorRiver[cell] === 1;
  const anySolid = (cell: number): boolean =>
    blockingProp(cell) || structureLayer[cell] !== 0 || fenceLayer[cell] !== 0 || terrainSolid(cell);

  // Governed = wilderness-scatter cells whose species blocks AND whose
  // ground walks. A prop standing on rock/bog/water blocks via TERRAIN
  // no matter where it stands — it belongs to the deliberate-barrier
  // class (the walls the rule reserves), is exempt from re-spacing, and
  // counts as untouchable context below so governed solids never lean
  // a chain onto the barrier's edge.
  const governed: number[] = [];
  for (let cell = 0; cell < cellCount; cell += 1) {
    if (wildernessProps[cell] === 1 && blockingProp(cell) && !terrainSolid(cell)) governed.push(cell);
  }

  // paired[cell] = 1 once a governed solid is one half of an accepted
  // pair; a pair never grows. Authored solids are immovable context.
  const paired = new Uint8Array(cellCount);
  const neighbors8 = (cell: number): number[] => {
    const x = cell % width;
    const y = Math.trunc(cell / width);
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) out.push(ny * width + nx);
      }
    }
    return out;
  };
  const isOrthogonal = (a: number, b: number): boolean => {
    const ax = a % width;
    const ay = Math.trunc(a / width);
    const bx = b % width;
    const by = Math.trunc(b / width);
    return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
  };

  /**
   * Cluster legality of a governed solid AT `cell` given the current
   * layers: no authored contact, at most one governed prop neighbor, that
   * neighbor orthogonal and not already in a pair.
   */
  const clusterLegal = (cell: number): { ok: boolean; mate: number } => {
    let mate = -1;
    for (const n of neighbors8(cell)) {
      if (!blockingProp(n)) continue;
      if (wildernessProps[n] !== 1 || terrainSolid(n)) return { ok: false, mate: -1 };
      if (mate !== -1) return { ok: false, mate: -1 };
      mate = n;
    }
    if (mate === -1) return { ok: true, mate };
    if (!isOrthogonal(cell, mate) || paired[mate] === 1) return { ok: false, mate: -1 };
    // The mate must itself have no third contact once we join it.
    for (const n of neighbors8(mate)) {
      if (n === cell || !blockingProp(n)) continue;
      return { ok: false, mate: -1 };
    }
    return { ok: true, mate };
  };

  /** Would a solid at `cell` create a zero-width corner-touch pinch? */
  const makesCornerPinch = (cell: number): boolean => {
    const x = cell % width;
    const y = Math.trunc(cell / width);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const diagonal = ny * width + nx;
      if (!anySolid(diagonal)) continue;
      const sideA = y * width + nx;
      const sideB = ny * width + x;
      if (!anySolid(sideA) && !anySolid(sideB)) return true;
    }
    return false;
  };

  /**
   * Local articulation guard: refuse a target whose open orthogonal
   * neighbors sit in different open arcs of the 8-ring — placing there
   * could sever a one-wide natural passage (the crossing-number test).
   */
  const locallyLoadBearing = (cell: number): boolean => {
    const x = cell % width;
    const y = Math.trunc(cell / width);
    const ringOffsets = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]] as const;
    const open: boolean[] = ringOffsets.map(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false;
      return !anySolid(ny * width + nx);
    });
    let arcs = 0;
    for (let i = 0; i < 8; i += 1) {
      if ((open[i] as boolean) && !(open[(i + 7) % 8] as boolean)) arcs += 1;
    }
    if (arcs <= 1) return false;
    // Which arcs hold the open ORTHOGONAL neighbors (ring slots 1,3,5,7)?
    const arcId: number[] = new Array(8).fill(-1);
    let current = -1;
    // Start the walk at a closed slot so an arc never wraps unlabeled.
    let start = open.findIndex((o) => !o);
    if (start === -1) return false;
    for (let step = 0; step < 8; step += 1) {
      const i = (start + step) % 8;
      if (!(open[i] as boolean)) {
        current = -1;
        continue;
      }
      if (current === -1) {
        current = i;
      }
      arcId[i] = current;
    }
    const orthogonalArcs = new Set<number>();
    for (const i of [1, 3, 5, 7]) {
      if (open[i] as boolean) orthogonalArcs.add(arcId[i] as number);
    }
    return orthogonalArcs.size > 1;
  };

  /**
   * A cell can host a relocated solid either empty or by SWAPPING with a
   * governed carpet prop (the understory trades places — both counts and
   * both substrates survive because origin and target share a material).
   * Dense forest cores NEED the swap lane: at 50%+ total prop occupancy
   * there are not enough empty cells inside the copse for pure moves.
   */
  const carpetSwappable = (cell: number): boolean =>
    propLayer[cell] !== 0 && !blockingProp(cell) && wildernessProps[cell] === 1;

  const targetLegal = (cell: number, typeValue: number, material: number, swap: boolean): boolean => {
    if (swap ? !carpetSwappable(cell) : propLayer[cell] !== 0) return false;
    // Cosmetic ground decals coexist (drawn under the prop); moss marks
    // rock and is excluded with it.
    if (mossLayer[cell] !== 0) return false;
    if (structureLayer[cell] !== 0 || fenceLayer[cell] !== 0 || pierLayer[cell] !== 0 || cropLayer[cell] !== 0) return false;
    if (pathLayer[cell] !== 0 || protectedCells[cell] === 1 || fordCells[cell] === 1) return false;
    if (grid[cell] !== material || terrainSolid(cell)) return false;
    const y = Math.trunc(cell / width);
    if (twoPartType[typeValue] === 1 && y > 0 && structureLayer[cell - width] !== 0) return false;
    // Mirror decorate's frozen near-structure guard: a relocated solid
    // never lands flush against a building (entrance aprons are already
    // protected; this keeps walls breathing room too).
    const x = cell % width;
    if (
      (cell - width >= 0 && structureLayer[cell - width] !== 0) ||
      (cell + width < cellCount && structureLayer[cell + width] !== 0) ||
      (x > 0 && structureLayer[cell - 1] !== 0) ||
      (x < width - 1 && structureLayer[cell + 1] !== 0)
    ) {
      return false;
    }
    // Clear space: never lean a relocated solid on ANY existing prop
    // (authored vignettes keep their breathing room; governed handled by
    // clusterLegal below), never mint a pinch, never plug a local pass.
    for (const n of neighbors8(cell)) {
      if (propLayer[n] !== 0 && wildernessProps[n] !== 1) return false;
    }
    // Cluster legality from the target's perspective (reads neighbors
    // only, so it is valid to ask before placing): at most one governed
    // contact, orthogonal, into an unpaired single.
    if (!clusterLegal(cell).ok) return false;
    if (makesCornerPinch(cell)) return false;
    if (locallyLoadBearing(cell)) return false;
    return true;
  };

  // PHASE 1 — greedy keeps (maximal independent pairs): decide scanline;
  // a cell keeps when the DECIDED keeps and the authored context allow it,
  // ignoring undecided governed neighbors (they adapt or move). A wall
  // therefore decomposes into in-place pairs along its own line instead of
  // dispersing wholesale — the copse keeps its silhouette.
  const kept8 = new Uint8Array(cellCount); // decided keeps
  const toMove: number[] = [];
  for (const cell of governed) {
    let authoredContact = false;
    let mate = -1;
    let contacts = 0;
    for (const n of neighbors8(cell)) {
      if (!blockingProp(n)) continue;
      if (wildernessProps[n] !== 1 || terrainSolid(n)) {
        authoredContact = true;
        break;
      }
      if (kept8[n] !== 1) continue; // undecided or moving — ignore
      contacts += 1;
      mate = n;
    }
    if (authoredContact || contacts > 1) {
      toMove.push(cell);
      continue;
    }
    if (mate !== -1) {
      if (!isOrthogonal(cell, mate) || paired[mate] === 1) {
        toMove.push(cell);
        continue;
      }
      paired[cell] = 1;
      paired[mate] = 1;
    }
    kept8[cell] = 1;
  }
  const kept = governed.length - toMove.length;

  // PHASE 2 — clear every mover off the layers FIRST so targets are
  // judged against the true end-state, then place spiral-nearest. The
  // intra-ring start angle rides a channel so copse edges scatter
  // organically instead of combing to one side.
  interface Pending {
    readonly origin: number;
    readonly typeValue: number;
    readonly material: number;
  }
  const pending: Pending[] = toMove.map((origin) => {
    const typeValue = propLayer[origin] as number;
    const material = grid[origin] as number;
    propLayer[origin] = 0;
    wildernessProps[origin] = 0;
    return { origin, typeValue, material };
  });

  let moved = 0;
  let stuck = 0;
  for (const { origin, typeValue, material } of pending) {
    const ox = origin % width;
    const oy = Math.trunc(origin / width);
    let placedAt = -1;
    let swapAt = -1;
    // Radius 0 first: the origin itself may be legal now that the rest of
    // its cluster cleared — the tree "stays" and the wall thins around it.
    if (targetLegal(origin, typeValue, material, false)) {
      placedAt = origin;
    }
    // Two spirals: empty cells first (least churn), then carpet swaps.
    for (const swap of [false, true]) {
      if (placedAt !== -1) break;
      for (let radius = 1; radius <= RELOCATE_RADIUS && placedAt === -1; radius += 1) {
        const perimeter: number[] = [];
        for (let dx = -radius; dx <= radius; dx += 1) {
          for (const dy of dx === -radius || dx === radius ? Array.from({ length: 2 * radius + 1 }, (_, i) => i - radius) : [-radius, radius]) {
            const nx = ox + dx;
            const ny = oy + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height) perimeter.push(ny * width + nx);
          }
        }
        if (perimeter.length === 0) continue;
        const start = ring.intAt(ox, oy, 0, perimeter.length, radius);
        for (let step = 0; step < perimeter.length; step += 1) {
          const target = perimeter[(start + step) % perimeter.length] as number;
          if (targetLegal(target, typeValue, material, swap)) {
            placedAt = target;
            if (swap) swapAt = target;
            break;
          }
        }
      }
    }
    if (placedAt === -1) {
      // No legal cell in range: the prop returns to its origin untouched —
      // reported, never deleted. (Origins stay clear of authored contact by
      // construction, so the violation is a residual cluster, not a lean.)
      propLayer[origin] = typeValue;
      wildernessProps[origin] = 1;
      stuck += 1;
      continue;
    }
    if (swapAt !== -1) {
      // The carpet prop rides back to the vacated origin: both species
      // survive on the same substrate (origin and target share material).
      propLayer[origin] = propLayer[swapAt] as number;
      wildernessProps[origin] = 1;
    }
    propLayer[placedAt] = typeValue;
    wildernessProps[placedAt] = 1;
    const after = clusterLegal(placedAt);
    if (after.mate !== -1) {
      paired[placedAt] = 1;
      paired[after.mate] = 1;
    }
    moved += 1; // radius-0 re-seats count as moved: the cluster around them changed
  }
  return { kept, moved, stuck };
}
