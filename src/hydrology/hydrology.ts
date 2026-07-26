/**
 * Hydrology compiler (docs/ARCHITECTURE_AND_CONTRACTS.md, component 5).
 *
 * Deterministic, integer-only:
 * - priority-flood depression filling over a binary heap keyed
 *   (filledElevation, cell index) — the pop order is total, so the resulting
 *   drainage parent tree is identical on every platform;
 * - land flow directions are the steepest strictly-lower filled neighbor;
 *   plateau cells route by deterministic BFS from their spill side (never by
 *   scan order), and every path descends or stays level until it reaches the
 *   world border or water, so rivers always have a destination;
 * - flow accumulation processed in descending (filled, index) order;
 * - ocean = flooded cells reachable from the border at or below sea level;
 *   other flooded or below-sea-level cells are lakes (1-2 cell ponds are
 *   absorbed as land rather than becoming confetti);
 * - coast distance by multi-source BFS from ocean cells.
 */

import type { WaterRules } from "../recipe/compile.js";

export const WATER_NONE = 0;
export const WATER_SHALLOW = 1;
export const WATER_DEEP = 2;

export interface RiverTrace {
  readonly sourceCell: number;
  readonly mouthCell: number;
  readonly length: number;
  readonly destination: "ocean" | "lake" | "edge";
}

export interface HydrologyResult {
  readonly width: number;
  readonly height: number;
  readonly filledElevation: readonly number[];
  /** 0 land, 1 shallow water, 2 deep water. */
  readonly waterKind: Uint8Array;
  readonly isOcean: Uint8Array;
  /** Downstream cell index per land cell; -1 for water cells and border sinks. */
  readonly flowDir: Int32Array;
  readonly accumulation: readonly number[];
  readonly isRiver: Uint8Array;
  /** The artifact/debug river layer: accumulation over the major threshold. */
  readonly isMajorRiver: Uint8Array;
  readonly riverTraces: readonly RiverTrace[];
  /** BFS cell distance to the nearest ocean cell; -1 when no ocean exists. */
  readonly coastDistance: Int32Array;
  readonly oceanCellCount: number;
  readonly lakeCount: number;
  readonly riverCellCount: number;
  readonly majorRiverCellCount: number;
  /** Topology violations; must be empty for a releasable world. */
  readonly topologyErrors: readonly string[];
}

export function buildHydrology(
  elevation: readonly number[],
  width: number,
  height: number,
  rules: WaterRules,
): HydrologyResult {
  const cellCount = width * height;
  const filled = new Array<number>(cellCount);
  const parent = new Int32Array(cellCount).fill(-1);
  const visited = new Uint8Array(cellCount);

  // Priority-flood from the world border inward.
  const heap = new MinHeap(cellCount);
  for (let x = 0; x < width; x += 1) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  function seed(index: number): void {
    if (visited[index] === 0) {
      visited[index] = 1;
      filled[index] = elevation[index] as number;
      heap.push(filled[index] as number, index);
    }
  }
  while (heap.size > 0) {
    const current = heap.pop();
    const currentFilled = filled[current] as number;
    const cx = current % width;
    const cy = (current - cx) / width;
    for (const neighbor of neighborIndexes(cx, cy, width, height)) {
      if (visited[neighbor] === 1) {
        continue;
      }
      visited[neighbor] = 1;
      const raw = elevation[neighbor] as number;
      filled[neighbor] = raw > currentFilled ? raw : currentFilled;
      parent[neighbor] = current;
      heap.push(filled[neighbor] as number, neighbor);
    }
  }

  // Ocean: border-reachable cells at or below sea level (on filled elevation).
  const isOcean = new Uint8Array(cellCount);
  let oceanCellCount = 0;
  {
    const queue: number[] = [];
    for (let x = 0; x < width; x += 1) {
      for (const index of [x, (height - 1) * width + x]) {
        if ((filled[index] as number) <= rules.seaLevelPermille && isOcean[index] === 0) {
          isOcean[index] = 1;
          queue.push(index);
        }
      }
    }
    for (let y = 1; y < height - 1; y += 1) {
      for (const index of [y * width, y * width + width - 1]) {
        if ((filled[index] as number) <= rules.seaLevelPermille && isOcean[index] === 0) {
          isOcean[index] = 1;
          queue.push(index);
        }
      }
    }
    queue.sort((a, b) => a - b);
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head] as number;
      oceanCellCount += 1;
      const x = index % width;
      const y = (index - x) / width;
      for (const neighbor of neighborIndexes(x, y, width, height)) {
        if (isOcean[neighbor] === 0 && (filled[neighbor] as number) <= rules.seaLevelPermille) {
          isOcean[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
  }

  // Lakes: flooded depressions and landlocked below-sea-level basins.
  const isLakeCell = new Uint8Array(cellCount);
  for (let index = 0; index < cellCount; index += 1) {
    if (isOcean[index] === 1) {
      continue;
    }
    const raw = elevation[index] as number;
    const level = filled[index] as number;
    if (level > raw || level <= rules.seaLevelPermille) {
      isLakeCell[index] = 1;
    }
  }
  // Absorb 1-2 cell ponds as land so they cannot become region confetti.
  const lakeCount = pruneAndCountLakes(isLakeCell, elevation, filled, rules.seaLevelPermille, width, height, 3, 12);

  const waterKind = new Uint8Array(cellCount);
  for (let index = 0; index < cellCount; index += 1) {
    const raw = elevation[index] as number;
    if (isOcean[index] === 1) {
      const depth = rules.seaLevelPermille - raw;
      waterKind[index] = depth > rules.shallowBandPermille ? WATER_DEEP : WATER_SHALLOW;
    } else if (isLakeCell[index] === 1) {
      const depth = (filled[index] as number) - raw;
      waterKind[index] = depth > rules.shallowBandPermille ? WATER_DEEP : WATER_SHALLOW;
    }
  }

  // Flow directions: steepest strictly-lower filled neighbor. Plateau cells
  // (no strictly lower neighbor) route by deterministic multi-source BFS from
  // their spill side, so flat flow converges toward the exit instead of
  // sweeping in scan order — scan-order parenting reads as straight parallel
  // capillaries on the map (W3 iteration brief).
  const flowDir = new Int32Array(cellCount).fill(-1);
  const flatUnrouted: number[] = [];
  for (let index = 0; index < cellCount; index += 1) {
    if (waterKind[index] !== WATER_NONE) {
      continue;
    }
    const x = index % width;
    const y = (index - x) / width;
    const level = filled[index] as number;
    let best = -1;
    let bestLevel = level;
    for (const neighbor of neighborIndexes(x, y, width, height)) {
      const neighborLevel = filled[neighbor] as number;
      if (neighborLevel < bestLevel) {
        bestLevel = neighborLevel;
        best = neighbor;
      }
    }
    if (best !== -1) {
      flowDir[index] = best;
    } else {
      flatUnrouted.push(index);
    }
  }
  if (flatUnrouted.length > 0) {
    routeFlats(flatUnrouted, flowDir, filled, waterKind, parent, width, height);
  }

  // Accumulation in descending (filled, index) order.
  const order = Array.from({ length: cellCount }, (_, index) => index).sort((a, b) => {
    const diff = (filled[b] as number) - (filled[a] as number);
    return diff !== 0 ? diff : a - b;
  });
  const accumulation = new Array<number>(cellCount).fill(0);
  for (const index of order) {
    if (waterKind[index] !== WATER_NONE) {
      continue;
    }
    accumulation[index] = (accumulation[index] as number) + 1;
    const downstream = flowDir[index] as number;
    if (downstream !== -1 && waterKind[downstream] === WATER_NONE) {
      accumulation[downstream] = (accumulation[downstream] as number) + (accumulation[index] as number);
    }
  }

  const isRiver = new Uint8Array(cellCount);
  const isMajorRiver = new Uint8Array(cellCount);
  let riverCellCount = 0;
  let majorRiverCellCount = 0;
  for (let index = 0; index < cellCount; index += 1) {
    if (waterKind[index] !== WATER_NONE) {
      continue;
    }
    const flow = accumulation[index] as number;
    if (flow >= rules.riverAccumulationThreshold) {
      isRiver[index] = 1;
      riverCellCount += 1;
    }
    if (flow >= rules.majorRiverAccumulationThreshold) {
      isMajorRiver[index] = 1;
      majorRiverCellCount += 1;
    }
  }

  // Trace rivers from their sources; verify every trace terminates.
  const topologyErrors: string[] = [];
  const hasRiverInflow = new Uint8Array(cellCount);
  for (let index = 0; index < cellCount; index += 1) {
    if (isMajorRiver[index] === 1) {
      const downstream = flowDir[index] as number;
      if (downstream !== -1 && isMajorRiver[downstream] === 1) {
        hasRiverInflow[downstream] = 1;
      }
    }
  }
  const riverTraces: RiverTrace[] = [];
  for (let index = 0; index < cellCount; index += 1) {
    if (isMajorRiver[index] !== 1 || hasRiverInflow[index] === 1) {
      continue;
    }
    let cursor = index;
    let length = 1;
    let destination: RiverTrace["destination"] | null = null;
    let guard = cellCount + 1;
    while (guard > 0) {
      guard -= 1;
      const downstream = flowDir[cursor] as number;
      if (downstream === -1) {
        destination = "edge";
        break;
      }
      if (waterKind[downstream] !== WATER_NONE) {
        destination = isOcean[downstream] === 1 ? "ocean" : "lake";
        break;
      }
      const stepUphill = (filled[downstream] as number) > (filled[cursor] as number);
      if (stepUphill) {
        topologyErrors.push(`river at cell ${cursor} steps uphill to ${downstream}`);
        destination = "edge";
        break;
      }
      cursor = downstream;
      length += 1;
    }
    if (destination === null) {
      topologyErrors.push(`river from cell ${index} never terminated (cycle suspected)`);
      destination = "edge";
    }
    riverTraces.push({ sourceCell: index, mouthCell: cursor, length, destination });
  }

  // Coast distance for the coastal moisture halo.
  const coastDistance = new Int32Array(cellCount).fill(-1);
  if (oceanCellCount > 0) {
    const queue: number[] = [];
    for (let index = 0; index < cellCount; index += 1) {
      if (isOcean[index] === 1) {
        coastDistance[index] = 0;
        queue.push(index);
      }
    }
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head] as number;
      const x = index % width;
      const y = (index - x) / width;
      for (const neighbor of neighborIndexes(x, y, width, height)) {
        if (coastDistance[neighbor] === -1) {
          coastDistance[neighbor] = (coastDistance[index] as number) + 1;
          queue.push(neighbor);
        }
      }
    }
  }

  return {
    width,
    height,
    filledElevation: filled,
    waterKind,
    isOcean,
    flowDir,
    accumulation,
    isRiver,
    isMajorRiver,
    riverTraces,
    coastDistance,
    oceanCellCount,
    lakeCount,
    riverCellCount,
    majorRiverCellCount,
    topologyErrors,
  };
}

/**
 * Route plateau cells by BFS from their spill side. Seeds, in ascending cell
 * order: border flats (they drain off-map), flats beside water, and flats
 * beside an already-routed equal-level cell. Expansion is FIFO with a fixed
 * neighbor order, so the flow field is deterministic and converges toward the
 * exit. Cells no seed can reach (not expected after filling) fall back to
 * their priority-flood parent.
 */
function routeFlats(
  flats: readonly number[],
  flowDir: Int32Array,
  filled: readonly number[],
  waterKind: Uint8Array,
  parent: Int32Array,
  width: number,
  height: number,
): void {
  const pending = new Uint8Array(width * height);
  for (const index of flats) {
    pending[index] = 1;
  }
  const queue: number[] = [];
  for (const index of flats) {
    const x = index % width;
    const y = (index - x) / width;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
      flowDir[index] = -1; // drains off the world edge
      pending[index] = 0;
      queue.push(index);
      continue;
    }
    for (const neighbor of neighborIndexes(x, y, width, height)) {
      const routedLand =
        waterKind[neighbor] === WATER_NONE &&
        pending[neighbor] === 0 &&
        flowDir[neighbor] !== -1 &&
        (filled[neighbor] as number) === (filled[index] as number);
      const intoWater =
        waterKind[neighbor] !== WATER_NONE &&
        (filled[neighbor] as number) <= (filled[index] as number);
      if (routedLand || intoWater) {
        flowDir[index] = neighbor;
        pending[index] = 0;
        queue.push(index);
        break;
      }
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head] as number;
    const x = index % width;
    const y = (index - x) / width;
    for (const neighbor of neighborIndexes(x, y, width, height)) {
      if (pending[neighbor] === 1) {
        flowDir[neighbor] = index;
        pending[neighbor] = 0;
        queue.push(neighbor);
      }
    }
  }
  for (const index of flats) {
    if (pending[index] === 1) {
      flowDir[index] = parent[index] as number; // unreachable fallback
      pending[index] = 0;
    }
  }
}

/** Remove lake components smaller than minCells; return remaining lake count. */
function pruneAndCountLakes(
  isLakeCell: Uint8Array,
  elevation: readonly number[],
  filled: readonly number[],
  seaLevel: number,
  width: number,
  height: number,
  minCells: number,
  minMaxDepth: number,
): number {
  const visited = new Uint8Array(isLakeCell.length);
  let lakeCount = 0;
  for (let start = 0; start < isLakeCell.length; start += 1) {
    if (isLakeCell[start] !== 1 || visited[start] === 1) {
      continue;
    }
    const component: number[] = [start];
    visited[start] = 1;
    for (let head = 0; head < component.length; head += 1) {
      const index = component[head] as number;
      const x = index % width;
      const y = (index - x) / width;
      for (const neighbor of neighborIndexes(x, y, width, height)) {
        if (isLakeCell[neighbor] === 1 && visited[neighbor] === 0) {
          visited[neighbor] = 1;
          component.push(neighbor);
        }
      }
    }
    // A real pond has area: require at least one 2x2 all-lake block, so
    // 1-wide "snake" lakes along noise creases are absorbed as land instead
    // of rendering as straight water lines (W3 iteration review).
    let hasBlock = false;
    let maxDepth = 0;
    for (const index of component) {
      const level = filled[index] as number;
      const raw = elevation[index] as number;
      const depth = Math.max(level - raw, level <= seaLevel ? seaLevel - raw : 0);
      if (depth > maxDepth) {
        maxDepth = depth;
      }
    }
    for (const index of component) {
      const x = index % width;
      const y = (index - x) / width;
      if (
        x < width - 1 &&
        y < height - 1 &&
        isLakeCell[index + 1] === 1 &&
        isLakeCell[index + width] === 1 &&
        isLakeCell[index + width + 1] === 1
      ) {
        hasBlock = true;
        break;
      }
    }
    // Basin explanation (docs/GENERATION_RULES.md): a real lake reaches real
    // depth somewhere; permille-deep crease fills are absorbed as land.
    if (component.length < minCells || !hasBlock || maxDepth < minMaxDepth) {
      for (const index of component) {
        isLakeCell[index] = 0;
      }
    } else {
      lakeCount += 1;
    }
  }
  return lakeCount;
}

function neighborIndexes(x: number, y: number, width: number, height: number): number[] {
  const result: number[] = [];
  if (y > 0) result.push((y - 1) * width + x);
  if (x < width - 1) result.push(y * width + x + 1);
  if (y < height - 1) result.push((y + 1) * width + x);
  if (x > 0) result.push(y * width + x - 1);
  return result;
}

/** Binary min-heap over (value, index) with lexicographic ordering. */
class MinHeap {
  private readonly values: number[];
  private readonly indexes: number[];
  size = 0;

  constructor(capacity: number) {
    this.values = new Array<number>(capacity);
    this.indexes = new Array<number>(capacity);
  }

  push(value: number, index: number): void {
    let slot = this.size;
    this.size += 1;
    this.values[slot] = value;
    this.indexes[slot] = index;
    while (slot > 0) {
      const parentSlot = (slot - 1) >> 1;
      if (this.less(slot, parentSlot)) {
        this.swap(slot, parentSlot);
        slot = parentSlot;
      } else {
        break;
      }
    }
  }

  pop(): number {
    const top = this.indexes[0] as number;
    this.size -= 1;
    if (this.size > 0) {
      this.values[0] = this.values[this.size] as number;
      this.indexes[0] = this.indexes[this.size] as number;
      let slot = 0;
      while (true) {
        const left = slot * 2 + 1;
        const right = left + 1;
        let smallest = slot;
        if (left < this.size && this.less(left, smallest)) {
          smallest = left;
        }
        if (right < this.size && this.less(right, smallest)) {
          smallest = right;
        }
        if (smallest === slot) {
          break;
        }
        this.swap(slot, smallest);
        slot = smallest;
      }
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    const valueA = this.values[a] as number;
    const valueB = this.values[b] as number;
    if (valueA !== valueB) {
      return valueA < valueB;
    }
    return (this.indexes[a] as number) < (this.indexes[b] as number);
  }

  private swap(a: number, b: number): void {
    const value = this.values[a] as number;
    this.values[a] = this.values[b] as number;
    this.values[b] = value;
    const index = this.indexes[a] as number;
    this.indexes[a] = this.indexes[b] as number;
    this.indexes[b] = index;
  }
}
