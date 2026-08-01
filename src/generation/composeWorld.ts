/**
 * World composition (Milestone W3): raw fields -> hydrology -> coastal
 * moisture -> land biomes -> confetti smoothing -> water and wetland overlay
 * -> one-cell cleanup -> regions. Every stage is integer-only and reads the
 * same global plan, so chunk borders agree by construction.
 */

import { clampInt } from "../core/fixedPoint.js";
import { floorDiv } from "../core/coords.js";
import { channel } from "../core/channels.js";
import type { ResolvedWorldConfig } from "../recipe/compile.js";
import { buildMacroFields, type MacroFields } from "../fields/macroFields.js";
import { buildHydrology, WATER_DEEP, WATER_NONE, WATER_SHALLOW, type HydrologyResult } from "../hydrology/hydrology.js";
import { decorateWorld, type DecorationResult } from "../decoration/decorate.js";
import { planFarmsAndPiers, type FarmResult } from "../settlements/farms.js";
import { applyTerrainTexture, type TextureStats } from "./texture.js";
import { planPois, type PlacedPoi } from "../decoration/pois.js";
import {
  classifyCell,
  labelComponents,
  smoothConfetti,
  PALETTE_INDEX,
  WORLD_PALETTE,
  type PaletteKey,
  type RegionSummary,
} from "../regions/biomes.js";
import { buildRoutes, gradeRockCell, verifyRouteConnectivity, type RoutesResult } from "../routes/routes.js";
import { planSettlements, type SettlementPlan, type SettlementQuarter } from "../settlements/settlements.js";
import { placeLandmarks, type LandmarkPlan } from "../settlements/landmarks.js";

const SWAMP = PALETTE_INDEX["terrain.swamp"];
const DEEP = PALETTE_INDEX["water.deep"];
const SHALLOW = PALETTE_INDEX["water.shallow"];
const GRASS = PALETTE_INDEX["terrain.grass"];
const DRY_GRASS = PALETTE_INDEX["terrain.dry_grass"];
const MUD = PALETTE_INDEX["terrain.mud"];

export interface ComposedWorld {
  readonly width: number;
  readonly height: number;
  /** Row-major WORLD_PALETTE indexes. */
  readonly grid: readonly number[];
  readonly regions: readonly RegionSummary[];
  readonly residualSmallRegions: number;
  readonly fields: MacroFields;
  /** Moisture after the coastal-influence halo. */
  readonly moistureAdjusted: readonly number[];
  readonly hydro: HydrologyResult;
  readonly wetlandCellCount: number;
  readonly routesResult: RoutesResult;
  readonly structureLayer: Uint8Array;
  readonly settlementPlans: readonly SettlementPlan[];
  /** City quarters (behavior 59): reserved market/church/green squares. */
  readonly quarters: readonly SettlementQuarter[];
  readonly landmarkPlans: readonly LandmarkPlan[];
  readonly decoration: DecorationResult;
  readonly farms: FarmResult;
  /** Terrain texture pass counters (behavior 39). */
  readonly textureStats: TextureStats;
  readonly pois: readonly PlacedPoi[];
  /**
   * Street-level crossings: river cells that carry corridor material or run
   * between corridor cells on opposite sides. Walkable in every model; the
   * TileForge adapter renders them as ford decals.
   */
  readonly streetFordCells: readonly number[];
}

export function composeWorld(config: ResolvedWorldConfig): ComposedWorld {
  const { width, height } = config.world;
  const fields = buildMacroFields(config);
  const hydro = buildHydrology(fields.elevation, width, height, config.water);
  const moistureAdjusted = applyCoastalMoisture(fields.moisture, hydro, config);

  // Land classification everywhere; water overlays afterwards so smoothing
  // cannot eat hydrology output.
  const grid = new Array<number>(width * height);
  for (let index = 0; index < grid.length; index += 1) {
    grid[index] = classifyCell(
      fields.elevation[index] as number,
      moistureAdjusted[index] as number,
      fields.temperature[index] as number,
      config.biomes.thresholds,
    );
  }
  smoothConfetti(grid, width, height, config.biomes.minRegionCells, config.biomes.smoothingPasses);

  for (let index = 0; index < grid.length; index += 1) {
    const kind = hydro.waterKind[index];
    if (kind === WATER_DEEP) {
      grid[index] = DEEP;
    } else if (kind === WATER_SHALLOW) {
      grid[index] = SHALLOW;
    }
  }

  // Wetlands: moist land beside water or a river, on soft ground only.
  let wetlandCellCount = 0;
  const wetland = new Uint8Array(grid.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const biome = grid[index] as number;
      if (biome !== GRASS && biome !== DRY_GRASS && biome !== MUD) {
        continue;
      }
      if ((moistureAdjusted[index] as number) < config.water.wetlandMoistureMin) {
        continue;
      }
      if (!bordersWater(index, x, y, width, height, grid, hydro)) {
        continue;
      }
      wetland[index] = 1;
    }
  }
  for (let index = 0; index < grid.length; index += 1) {
    if (wetland[index] === 1) {
      grid[index] = SWAMP;
      wetlandCellCount += 1;
    }
  }

  // Beaches (behavior 14) run AFTER wetlands: marsh coasts survive as swamp
  // ribbons, remaining low shoreline land becomes sand. The elevation gate
  // keeps beaches to sea-level coasts, and the first row/column is excluded —
  // the pinned package's §2.7 sand margin cannot represent sand there.
  const beachOriginals = new Map<number, number>();
  {
    const SAND = PALETTE_INDEX["terrain.sand"];
    const sandable = new Set<number>([GRASS, DRY_GRASS, MUD]);
    const beachElevationMax = config.water.seaLevelPermille + 45;
    const placements = beachOriginals;
    for (let y = 2; y < height - 2; y += 1) {
      for (let x = 2; x < width - 2; x += 1) {
        const index = y * width + x;
        if (hydro.waterKind[index] !== WATER_NONE) continue;
        if (!sandable.has(grid[index] as number)) continue;
        if ((fields.elevation[index] as number) > beachElevationMax) continue;
        if (hydro.isRiver[index] === 1) continue;
        let besideWater = false;
        for (const neighbor of [index - width, index + width, index - 1, index + 1]) {
          if (neighbor < 0 || neighbor >= grid.length) continue;
          if (x === 0 && neighbor === index - 1) continue;
          if (x === width - 1 && neighbor === index + 1) continue;
          if (hydro.waterKind[neighbor] !== WATER_NONE) {
            besideWater = true;
            break;
          }
        }
        if (besideWater) {
          placements.set(index, grid[index] as number);
          grid[index] = SAND;
        }
      }
    }
    // Fill pockets fully enclosed by sand/water (swamp specks included) so
    // smoothing — barred from spreading sand — never meets an unabsorbable
    // one-cell hole behind the ribbon.
    const fillable = new Set<number>([GRASS, DRY_GRASS, MUD, SWAMP]);
    let filled = true;
    while (filled) {
      filled = false;
      // The §2.7 sand margin holds on ALL four edges (behavior 31): the
      // dual grid cannot represent sand on the outermost rows/columns.
      for (let y = 2; y < height - 2; y += 1) {
        for (let x = 2; x < width - 2; x += 1) {
          const index = y * width + x;
          if (hydro.waterKind[index] !== WATER_NONE) continue;
          if (!fillable.has(grid[index] as number)) continue;
          if ((fields.elevation[index] as number) > beachElevationMax) continue;
          if (hydro.isRiver[index] === 1) continue;
          let enclosed = true;
          for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              enclosed = false;
              break;
            }
            const value = grid[ny * width + nx] as number;
            if (value !== SAND && value !== SHALLOW && value !== DEEP) {
              enclosed = false;
              break;
            }
          }
          if (enclosed) {
            placements.set(index, grid[index] as number);
            grid[index] = SAND;
            filled = true;
          }
        }
      }
    }
  }

  // Rocky knolls (macro.biomes 3, the 90%-unused verdict): small scattered
  // rock outcrops texture the open midlands and anchor wilderness dungeons.
  // They stamp BEFORE routes so corridors respect them, and keep off water,
  // rivers, beaches, and the existing rock mass.
  {
    const ROCK = PALETTE_INDEX["terrain.rock"];
    const SAND_VALUE = PALETTE_INDEX["terrain.sand"];
    const knolls = channel(config.seed, "macro.knolls");
    const centers: Array<readonly [number, number]> = [];
    const rockNearby = (cx: number, cy: number, radius: number): boolean => {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          if (grid[y * width + x] === ROCK) return true;
        }
      }
      return false;
    };
    const target = config.biomes.knollCount;
    for (let attempt = 0; attempt < target * 22 && centers.length < target; attempt += 1) {
      const cx = knolls.intAt(attempt, 0, 8, width - 16, 0) + 8;
      const cy = knolls.intAt(attempt, 1, 8, height - 16, 0) + 8;
      const center = cy * width + cx;
      if (hydro.waterKind[center] !== WATER_NONE || hydro.isRiver[center] === 1) continue;
      if (grid[center] === SAND_VALUE || grid[center] === ROCK) continue;
      if (rockNearby(cx, cy, 7)) continue;
      if (centers.some(([ox, oy]) => Math.max(Math.abs(ox - cx), Math.abs(oy - cy)) < 14)) continue;
      const radius = 2 + knolls.intAt(attempt, 2, 0, 3, 0);
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
          const index = y * width + x;
          if (hydro.waterKind[index] !== WATER_NONE || hydro.isRiver[index] === 1) continue;
          if (grid[index] === SAND_VALUE) continue;
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          // Rough-edged blob: certainty at the core, jitter at the rim.
          if (knolls.permilleAt(x, y, 3) < 940 - distance * (720 / radius)) {
            grid[index] = ROCK;
          }
        }
      }
      centers.push([cx, cy]);
    }
  }

  // Routes stamp packed-road corridors into the material grid after all
  // terrain passes, so decoration-era passes can never sever them unnoticed:
  // connectivity is re-verified on the final grid.
  let routesResult = buildRoutes(grid, fields, hydro, config);

  // Settlement and landmark planning (W5): plans mutate the grid (plazas,
  // cobble streets, structure footprints, stamps, blending) before cleanup.
  const structureLayer = new Uint8Array(width * height);
  const planErrors: string[] = [];
  // Verified-but-unpainted approach routes (behavior 50 worn/none lanes):
  // decoration must keep blocking props off them exactly as solid cobble
  // kept itself clear. Empty for every style-free recipe.
  const laneCells: number[] = [];
  const quarters: SettlementQuarter[] = [];
  const settlementPlans = planSettlements(grid, structureLayer, fields, hydro, routesResult, config, planErrors, laneCells, quarters);
  const landmarkPlans = placeLandmarks(grid, structureLayer, routesResult.pathLayer, fields, hydro, routesResult, config, planErrors);

  // Country roads ride the band (behavior 72, style-gated on narrowStreets;
  // follows the road-layer restoration ruling that made the road band
  // first-class again). Outside settlement bounds the b52 corridors kept
  // their two-three wide packed-road material — the same blob-rendered slab
  // look the b56 ruling banished from cities ("wide reads as solid
  // clutter"; the band IS the one-tile look). Under narrowStreets the
  // country stretches now neck to their centerline and draw as the road
  // band over restored ground, flanks restored from the painter's records —
  // so every road in a styled world (city lane, country highway,
  // wilderness trail) is a band line. Style-free worlds keep their classic
  // material corridors byte-identically. Restored centerline ground may be
  // the rock the corridor once paved over: the b71 grading applies, so the
  // band never rides rock material and the cliff relief stays off
  // traversal. Water centerline cells are crossings and stay untouched.
  if (config.settlements.narrowStreets) {
    const ROAD_BAND = 2; // pathLayer vocabulary (b57): 2 = the road band
    const pathLayer = routesResult.pathLayer;
    const packedRoad = PALETTE_INDEX["terrain.packed_road"];
    const rockIndex = PALETTE_INDEX["terrain.rock"];
    for (const cell of routesResult.corridorCenterline) {
      if (grid[cell] !== packedRoad) continue; // in-bounds cells already gave ground back
      // Overlapping routes never record centerPrev (the cell was already
      // pavement when the second route arrived) — the flank record has the
      // original ground then, the same fallback the b56 in-bounds
      // give-back uses.
      const prev =
        routesResult.corridorCenterPrev.get(cell) ?? routesResult.corridorFlankPrev.get(cell);
      if (prev === undefined) continue;
      grid[cell] = prev;
      if (pathLayer[cell] === 0) {
        pathLayer[cell] = ROAD_BAND;
      }
      if (grid[cell] === rockIndex) {
        gradeRockCell(cell, grid, width, height);
      }
    }
    for (const [cell, prev] of routesResult.corridorFlankPrev) {
      if (grid[cell] !== packedRoad) continue;
      if (routesResult.corridorCenterline.has(cell)) continue;
      grid[cell] = prev;
      // A flank that a trail joins is a JUNCTION, not shoulder: landmark
      // approaches and spurs targeted any corridor-material cell, flanks
      // included — restoring one to bare ground would strand the trail a
      // cell short of the centerline band (the compose gate caught the
      // two north landmarks exactly this way on the first cut). Such
      // flanks become band cells so the join keeps walking.
      const x = cell % width;
      let joins = false;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const nx = x + dx;
        const ny = Math.trunc(cell / width) + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (pathLayer[ny * width + nx] === 1) {
          joins = true;
          break;
        }
      }
      if (joins && pathLayer[cell] === 0) {
        pathLayer[cell] = ROAD_BAND;
        if (grid[cell] === rockIndex) {
          gradeRockCell(cell, grid, width, height);
        }
      }
    }
  }

  // Absorb one-cell regions introduced by overlays and road carving. Road
  // cells are protected: traversal-critical corridors are never rewritten,
  // and connectivity is re-verified afterwards on the final grid.
  // A beach is at least two contiguous cells: sand is confetti-protected, so
  // lone survivors — including cells orphaned when settlement streets paved
  // their neighbors — revert to their original material. Runs after every
  // pass that can rewrite shoreline cells.
  {
    const SAND = PALETTE_INDEX["terrain.sand"];
    const lonely: number[] = [];
    for (const index of beachOriginals.keys()) {
      if (grid[index] !== SAND) continue;
      const x = index % width;
      let hasSandNeighbor = false;
      for (const neighbor of [index - width, index + width, index - 1, index + 1]) {
        if (neighbor < 0 || neighbor >= grid.length) continue;
        if (x === 0 && neighbor === index - 1) continue;
        if (x === width - 1 && neighbor === index + 1) continue;
        if (grid[neighbor] === SAND) {
          hasSandNeighbor = true;
          break;
        }
      }
      if (!hasSandNeighbor) {
        lonely.push(index);
      }
    }
    for (const index of lonely) {
      grid[index] = beachOriginals.get(index) as number;
    }
  }

  // Sand is protected like the corridors, and additionally barred as an
  // absorption target: smoothing must neither erase a beach nor spread sand
  // to cells the beach rule (and its §2.7 margin) never blessed.
  smoothConfetti(
    grid, width, height, 2, 2,
    new Set([
      PALETTE_INDEX["terrain.packed_road"],
      PALETTE_INDEX["terrain.cobble"],
      PALETTE_INDEX["terrain.sand"],
    ]),
    new Set([PALETTE_INDEX["terrain.sand"]]),
  );
  const postCleanupErrors: string[] = [...planErrors];
  verifyRouteConnectivity(grid, routesResult.pathLayer, routesResult.routes, routesResult.destinations, width, height, postCleanupErrors);
  // Street-level crossings (single source of truth; the adapter renders
  // these as ford decals): a stream cell is a crossing when it carries a
  // corridor material or separates corridor cells on opposite sides.
  const streetFordCells: number[] = [];
  {
    const cobbleValue = PALETTE_INDEX["terrain.cobble"];
    const roadValue = PALETTE_INDEX["terrain.packed_road"];
    const corridor = (index: number): boolean =>
      grid[index] === roadValue || grid[index] === cobbleValue;
    const river = (index: number): boolean => hydro.isRiver[index] === 1;
    // A run of one or two stream cells with corridor at both ends fords —
    // two matches the street arms' skippedWet allowance, which would
    // otherwise sever settlement fabric on double-wide streams.
    const bridged = (index: number, stride: number, room: boolean, room2: boolean): boolean => {
      if (!room) return false;
      const before = corridor(index - stride);
      const after = corridor(index + stride);
      if (before && after) return true;
      if (!room2) return false;
      if (before && river(index + stride) && corridor(index + 2 * stride)) return true;
      if (after && river(index - stride) && corridor(index - 2 * stride)) return true;
      return false;
    };
    for (let index = 0; index < grid.length; index += 1) {
      if (!river(index)) continue;
      const x = index % width;
      const y = (index - x) / width;
      const northSouth = bridged(index, width, y > 0 && y < height - 1, y > 1 && y < height - 2);
      const eastWest = bridged(index, 1, x > 0 && x < width - 1, x > 1 && x < width - 2);
      if (corridor(index) || northSouth || eastWest) {
        streetFordCells.push(index);
      }
    }
  }

  // Entrance reachability (W5 exit criterion): every structure entrance and
  // landmark gate joins the walkable network. Two tiers since behavior 50:
  // solid-lane entrances (every pre-50 structure) must join the CORRIDOR
  // network exactly as before, while worn/none-lane entrances are checked
  // against walkable GROUND — their lanes are deliberately gappy or
  // unpainted, so a corridor-only flood would read them as islands, but the
  // recorded lane keep-outs (stamps, fences, crops, blocking props) keep
  // the verified ground route open through every later pass.
  {
    const walkable = new Uint8Array(grid.length);
    const cobbleValue = PALETTE_INDEX["terrain.cobble"];
    const roadValue = PALETTE_INDEX["terrain.packed_road"];
    for (let index = 0; index < grid.length; index += 1) {
      if (grid[index] === roadValue || grid[index] === cobbleValue || routesResult.pathLayer[index] !== 0) {
        walkable[index] = 1;
      }
    }
    for (const route of routesResult.routes) {
      for (const crossing of route.crossings) {
        walkable[crossing.cell] = 1;
      }
    }
    for (const cell of streetFordCells) {
      walkable[cell] = 1;
    }
    const seeds: number[] = [];
    if (settlementPlans.length > 0) {
      seeds.push((settlementPlans[0] as SettlementPlan).anchorY * width + (settlementPlans[0] as SettlementPlan).anchorX);
    }
    const flood = (open: Uint8Array): Uint8Array => {
      const reached = new Uint8Array(grid.length);
      const queue: number[] = [];
      for (const seed of seeds) {
        open[seed] = 1;
        reached[seed] = 1;
        queue.push(seed);
      }
      for (let head = 0; head < queue.length; head += 1) {
        const index = queue[head] as number;
        const x = index % width;
        for (const neighbor of [index - width, index + width, index - 1, index + 1]) {
          if (neighbor < 0 || neighbor >= grid.length) continue;
          if (x === 0 && neighbor === index - 1) continue;
          if (x === width - 1 && neighbor === index + 1) continue;
          if (reached[neighbor] === 0 && open[neighbor] === 1) {
            reached[neighbor] = 1;
            queue.push(neighbor);
          }
        }
      }
      return reached;
    };
    const reached = flood(walkable);
    // Ground tier: corridors plus any open land a player can walk. Built
    // only when a styled settlement actually produced worn/none lanes.
    let groundReached: Uint8Array | null = null;
    if (laneCells.length > 0) {
      const ground = new Uint8Array(walkable);
      const rockValue = PALETTE_INDEX["terrain.rock"];
      const deepValue = PALETTE_INDEX["water.deep"];
      const shallowValue = PALETTE_INDEX["water.shallow"];
      for (let index = 0; index < grid.length; index += 1) {
        if (
          ground[index] === 0 &&
          structureLayer[index] === 0 &&
          hydro.waterKind[index] === WATER_NONE &&
          hydro.isRiver[index] === 0 &&
          grid[index] !== rockValue &&
          grid[index] !== deepValue &&
          grid[index] !== shallowValue
        ) {
          ground[index] = 1;
        }
      }
      groundReached = flood(ground);
    }
    for (const plan of settlementPlans) {
      for (const structure of plan.structures) {
        const entrance = structure.entranceY * width + structure.entranceX;
        if (entrance < 0 || entrance >= grid.length) continue;
        const tier = structure.laneMode === "solid" ? reached : (groundReached ?? reached);
        if (tier[entrance] === 0) {
          postCleanupErrors.push(
            `settlement ${plan.id}: entrance of ${structure.type} at (${structure.entranceX}, ${structure.entranceY}) is unreachable`,
          );
        }
      }
    }
    for (const plan of landmarkPlans) {
      const gate = plan.entranceY * width + plan.entranceX;
      if (reached[gate] === 0) {
        postCleanupErrors.push(`landmark ${plan.id}: gate at (${plan.entranceX}, ${plan.entranceY}) is unreachable`);
      }
    }
  }
  if (postCleanupErrors.length > 0) {
    routesResult = { ...routesResult, errors: [...routesResult.errors, ...postCleanupErrors] };
  }

  // Farm plots and harbor piers (stage 3) are settlement infrastructure:
  // planned after every traversal-critical pass, before decoration.
  const farms = planFarmsAndPiers(grid, structureLayer, hydro, routesResult.pathLayer, settlementPlans, config, laneCells, quarters);

  // Terrain texture (behavior 39): cosmetic-material mottle + edge dither.
  // After everything structural (nothing can move) and before decoration
  // (props and POIs follow the textured ground). Walkability-neutral by
  // construction: swaps stay inside the walkable ground-material set.
  const textureStats = applyTerrainTexture(
    grid,
    structureLayer,
    routesResult.pathLayer,
    farms,
    hydro,
    new Set(streetFordCells),
    config,
  );

  // Decoration runs last: it never writes corridor, crossing, structure,
  // entrance, crop, fence, or pier cells.
  const entranceCells: number[] = [];
  for (const plan of settlementPlans) {
    for (const structure of plan.structures) {
      entranceCells.push(structure.entranceY * width + structure.entranceX);
    }
  }
  for (const plan of landmarkPlans) {
    entranceCells.push(plan.entranceY * width + plan.entranceX);
  }
  const decoration = decorateWorld(grid, structureLayer, hydro, routesResult, entranceCells, config, farms, streetFordCells, laneCells, quarters, settlementPlans);

  // Points of interest stamp after ambient decoration and overwrite it:
  // deliberate discoveries beat scattered flavor.
  const pois = planPois(grid, structureLayer, hydro, routesResult, settlementPlans, landmarkPlans, farms, decoration, config);

  // Wilderness spur paths (behavior 21): worked or visited discoveries —
  // mines, crypts, graveyards, stone rings, fishing spots, cave mouths,
  // prospector camps — earn a rough dirt path to the nearest corridor.
  // Hidden or lost places (witch circles, bandit camps, wrecks, the
  // skeleton) stay pathless by design. Purely additive: pathLayer only.
  {
    const SPUR_KINDS = new Set([
      "poi.mine",
      "poi.crypt",
      "poi.graveyard",
      "poi.standing_stones",
      "poi.stone_circle",
      "poi.fishing_spot",
      "poi.cave",
      "poi.prospector_camp",
      "poi.ruin",
      "poi.trapper_camp",
      "poi.logging_camp",
    ]);
    const cobbleValue = PALETTE_INDEX["terrain.cobble"];
    const roadValue = PALETTE_INDEX["terrain.packed_road"];
    const rockIdx = PALETTE_INDEX["terrain.rock"];
    const swampIdx = PALETTE_INDEX["terrain.swamp"];
    const pathLayer = routesResult.pathLayer;
    const maxSpur = 20;
    for (const poi of pois) {
      if (!SPUR_KINDS.has(poi.type)) continue;
      // BFS over open walkable land from the POI's doorstep to the nearest
      // corridor cell (path, road, or cobble), bounded by maxSpur steps.
      const start = poi.y * width + poi.x;
      const previous = new Map<number, number>();
      const depth = new Map<number, number>();
      // Spurs are not made diagonal either (b75 round-3 doctrine).
      const spurEntryDir = new Map<number, number>();
      previous.set(start, -1);
      depth.set(start, 0);
      const queue = [start];
      let goal = -1;
      for (let head = 0; head < queue.length && goal === -1; head += 1) {
        const cell = queue[head] as number;
        const steps = depth.get(cell) as number;
        if (steps >= maxSpur) continue;
        const cx = cell % width;
        const cy = (cell - cx) / width;
        const baseDirs = [[0, 1], [1, 0], [-1, 0], [0, -1]] as const;
        const into = spurEntryDir.get(cell);
        const order =
          into === undefined ? [...baseDirs] : [baseDirs[into] as readonly [number, number], ...baseDirs.filter((_, i) => i !== into)];
        for (const [dx, dy] of order) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (previous.has(next)) continue;
          if (pathLayer[next] !== 0 || grid[next] === roadValue || grid[next] === cobbleValue) {
            previous.set(next, cell);
            goal = next;
            break;
          }
          if (hydro.waterKind[next] !== WATER_NONE || hydro.isRiver[next] === 1) continue;
          if (grid[next] === rockIdx || grid[next] === swampIdx) continue;
          if (structureLayer[next] !== 0) continue;
          if (decoration.propLayer[next] !== 0) continue; // no paths under props
          // Fences block like they render (behavior 68): a spur must leave
          // a fenced yard through its GATE, never carve through the ring —
          // the round-19 graveyard had its trail walled shut this way.
          if (farms.fenceLayer[next] !== 0) continue;
          previous.set(next, cell);
          spurEntryDir.set(next, baseDirs.findIndex((d) => d[0] === dx && d[1] === dy));
          depth.set(next, steps + 1);
          queue.push(next);
        }
      }
      if (goal === -1) continue;
      let cursor = previous.get(goal) as number;
      while (cursor !== -1 && cursor !== start) {
        if (pathLayer[cursor] === 0) pathLayer[cursor] = 1;
        cursor = previous.get(cursor) as number;
      }
    }
  }

  // No pure diagonals (behavior 75; the "80" verdict, settled TF-side as
  // writer work — the package's port-mask system is orthogonal-only, so
  // two same-class band cells touching only at a corner each render a
  // closed round stub and staircases become chains of loops). After EVERY
  // band writer has run (routes, settlement lanes, landmark approaches,
  // country necking, POI spurs), insert an L-step cell wherever a
  // same-class diagonal pair has no shared orthogonal band cell:
  // deterministic first-fit of the two candidate corners, only onto open
  // already-walkable natural ground — never water, river, rock, swamp,
  // cobble (the plaza), or any occupied cell — so walkability holds by
  // construction. Runs after decoration: lamp seats never see L cells.
  // Mixed-class joins stay as they are (the road-transition arc parks
  // upstream, sl-0054 scope extension).
  //
  // DE-BRAID (same behavior, the designer's "still some left" round): a
  // TRAIL that hugs a road-class line — beside it, or shadowing a
  // staircase diagonally — draws a parallel band or a chain of curl
  // stubs one cell off the road. Two routes carved along one corridor
  // are ONE road to the eye: the trail merges onto the road. Before the
  // L-step pass, iteratively erase every trail cell whose 8-neighborhood
  // holds a road-class cell AND whose every orthogonal trail neighbor
  // also hugs road (parallel runs and staircase shadows both), then
  // sweep hugging orphans. A trail cell where the route genuinely bends
  // away (a neighbor with no road in reach) is the junction — it stays.
  // Erasure guards: never a crossing (water/river) and never ground
  // that only walked BECAUSE of the band (swamp/rock/water materials) —
  // those cells are load-bearing, so the flood cannot move.
  {
    const pathLayer = routesResult.pathLayer;
    const TRAIL = 1;
    // The corridor centerline is the road's own line whatever value it
    // carries (b72 keeps pre-existing trail bands on it) — it is never
    // braid, and a trail hugging it is.
    const centerline = routesResult.corridorCenterline;
    const roadAt = (cell: number): boolean =>
      pathLayer[cell] === 2 || pathLayer[cell] === 3 || (pathLayer[cell] !== 0 && centerline.has(cell));
    const hugsRoad = (x: number, y: number): boolean => {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (roadAt(ny * width + nx)) return true;
        }
      }
      return false;
    };
    const walksWithoutBand = (cell: number): boolean => {
      if (hydro.waterKind[cell] !== WATER_NONE || hydro.isRiver[cell] === 1) return false;
      const material = grid[cell] as number;
      const key = WORLD_PALETTE[material] as string;
      return key !== "terrain.rock" && key !== "terrain.swamp" && key !== "water.deep" && key !== "water.shallow";
    };
    const erasedCells = new Set<number>();
    // FLANK-LINE MERGE (the other braid direction): the b72 junction-flank
    // rule bands a restored flank cell wherever a trail joins the corridor
    // — but a trail running ALONGSIDE the corridor for a stretch qualifies
    // every flank cell on the run, building a second band line one cell
    // off the centerline (the designer's ladder). A non-centerline band
    // RUN that parallels a banded centerline line duplicates the road:
    // erase the run's interior; a run END that continues onward into the
    // network (the genuine join) stays. Same ground guards — the flood
    // cannot move.
    {
      const bandedCenterlineAt = (x: number, y: number): boolean => {
        if (x < 0 || y < 0 || x >= width || y >= height) return false;
        const cell = y * width + x;
        return pathLayer[cell] !== 0 && centerline.has(cell);
      };
      const bandAt = (x: number, y: number): boolean =>
        x >= 0 && y >= 0 && x < width && y < height && pathLayer[y * width + x] !== 0;
      for (const [sideDx, sideDy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const runDx = sideDy === 0 ? 0 : 1;
        const runDy = sideDy === 0 ? 1 : 0;
        const inRun = (x: number, y: number): boolean => {
          if (x < 0 || y < 0 || x >= width || y >= height) return false;
          const cell = y * width + x;
          return (
            pathLayer[cell] !== 0 &&
            !centerline.has(cell) &&
            bandedCenterlineAt(x + sideDx, y + sideDy) &&
            walksWithoutBand(cell)
          );
        };
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            if (!inRun(x, y)) continue;
            // Only process run heads (previous cell along the run is not one).
            if (inRun(x - runDx, y - runDy)) continue;
            let length = 0;
            while (inRun(x + runDx * length, y + runDy * length)) length += 1;
            if (length < 2) continue;
            for (let step = 0; step < length; step += 1) {
              const cx = x + runDx * step;
              const cy = y + runDy * step;
              // A run cell that connects to the band network OUTSIDE the
              // run and its paralleled centerline is a genuine join — the
              // horizontal trail crossing the run's end, the web at a
              // junction. Erasing it would gap a real line; it stays.
              let outsideJoin = false;
              for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (dx === sideDx && dy === sideDy) continue; // the centerline side
                if (inRun(nx, ny)) continue;
                if (bandAt(nx, ny)) {
                  outsideJoin = true;
                  break;
                }
              }
              if (outsideJoin) continue;
              erasedCells.add(cy * width + cx);
            }
          }
        }
      }
      for (const cell of erasedCells) {
        pathLayer[cell] = 0;
      }
    }
    let debraided = true;
    while (debraided) {
      debraided = false;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const cell = y * width + x;
          if (pathLayer[cell] !== TRAIL) continue;
          if (centerline.has(cell)) continue;
          if (!hugsRoad(x, y)) continue;
          if (!walksWithoutBand(cell)) continue;
          let neighbors = 0;
          let allHug = true;
          for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (pathLayer[ny * width + nx] !== TRAIL) continue;
            neighbors += 1;
            if (!hugsRoad(nx, ny)) allHug = false;
          }
          if (neighbors === 0 || allHug) {
            pathLayer[cell] = 0;
            erasedCells.add(cell);
            debraided = true;
          }
        }
      }
    }
    // JUNCTION REMNANTS (the designer's lighthouse-blob round): a
    // road-class cell with NO orthogonal road-class neighbor is not a road
    // — it is a stranded junction cell (an old corridor end or flank-join
    // amid trails), and the road family's near-full-cell slab art renders
    // it as a fat block in the middle of thin dirtpath lines. Repaint it
    // as the trail it serves (value swap only — walkability identical;
    // the centerline legally carries trail value per the b72 doctrine).
    // Snapshot first so a repaint never cascades along a real road.
    {
      const ROAD_CLASS = 2;
      const snapshot: number[] = [];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const cell = y * width + x;
          if (pathLayer[cell] !== ROAD_CLASS) continue;
          let roadNeighbors = 0;
          if (y > 0 && pathLayer[cell - width] === ROAD_CLASS) roadNeighbors += 1;
          if (y < height - 1 && pathLayer[cell + width] === ROAD_CLASS) roadNeighbors += 1;
          if (x > 0 && pathLayer[cell - 1] === ROAD_CLASS) roadNeighbors += 1;
          if (x < width - 1 && pathLayer[cell + 1] === ROAD_CLASS) roadNeighbors += 1;
          if (roadNeighbors === 0) snapshot.push(cell);
        }
      }
      for (const cell of snapshot) {
        pathLayer[cell] = TRAIL;
      }
    }
    // RECONNECT (both passes): an erased cell that sat between two
    // surviving band cells on opposite sides was a through-link — a trail
    // line crossing the flank's course, a junction bridge — not braid.
    // Erasing it gapped a real line; restore it with the lighter class (a
    // trail continues into a junction as a trail). Only ever applied to
    // cells that carried a band before de-braiding, so deliberate gaps
    // (fords, crossings) are untouchable by construction.
    for (const cell of erasedCells) {
      if (pathLayer[cell] !== 0) continue;
      const x = cell % width;
      const y = (cell - x) / width;
      const at = (nx: number, ny: number): number =>
        nx < 0 || ny < 0 || nx >= width || ny >= height ? 0 : (pathLayer[ny * width + nx] as number);
      const pairs = [
        [at(x - 1, y), at(x + 1, y)],
        [at(x, y - 1), at(x, y + 1)],
      ];
      for (const pair of pairs) {
        const a = pair[0] as number;
        const b = pair[1] as number;
        if (a !== 0 && b !== 0) {
          pathLayer[cell] = Math.min(a, b);
          break;
        }
      }
    }
    // NO FILLED SQUARES (same round, LAST — the reconnect above can
    // legitimately restore a through-link that completes a square, so the
    // thinning must see the final state): where lines meet, a solid 2x2
    // same-class block can form (a junction arrives one row beside a
    // through-line; the remnant repaint above can complete one) — and a
    // 2x2 band block renders as a closed loop box, the '8' again. A
    // junction is a T or an L, never a filled square: erase the block
    // corner that has NO band connection outside the block (its lines all
    // continue through the other three cells), first such corner in NW/
    // NE/SW/SE order, ground-guarded like every erasure here. Blocks
    // whose four corners all continue outward are real four-way webs and
    // stay.
    {
      for (let y = 0; y < height - 1; y += 1) {
        for (let x = 0; x < width - 1; x += 1) {
          const nw = y * width + x;
          const cls = pathLayer[nw] as number;
          if (cls === 0) continue;
          const ne = nw + 1;
          const sw = nw + width;
          const se = sw + 1;
          if (pathLayer[ne] !== cls || pathLayer[sw] !== cls || pathLayer[se] !== cls) continue;
          const corners = [
            [nw, x, y],
            [ne, x + 1, y],
            [sw, x, y + 1],
            [se, x + 1, y + 1],
          ] as const;
          for (const [cell, cx, cy] of corners) {
            let outside = false;
            for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
              const ox = cx + dx;
              const oy = cy + dy;
              if (ox < 0 || oy < 0 || ox >= width || oy >= height) continue;
              const other = oy * width + ox;
              if (other === nw || other === ne || other === sw || other === se) continue;
              if (pathLayer[other] !== 0) {
                outside = true;
                break;
              }
            }
            if (!outside && walksWithoutBand(cell)) {
              pathLayer[cell] = 0;
              break;
            }
          }
        }
      }
    }
  }
  {
    const pathLayer = routesResult.pathLayer;
    const rockIdx = PALETTE_INDEX["terrain.rock"];
    const swampIdx = PALETTE_INDEX["terrain.swamp"];
    const cobbleIdx = PALETTE_INDEX["terrain.cobble"];
    const deepIdx = PALETTE_INDEX["water.deep"];
    const shallowIdx = PALETTE_INDEX["water.shallow"];
    const canHostStep = (cell: number): boolean =>
      pathLayer[cell] === 0 &&
      hydro.waterKind[cell] === WATER_NONE &&
      hydro.isRiver[cell] === 0 &&
      structureLayer[cell] === 0 &&
      decoration.propLayer[cell] === 0 &&
      decoration.decalLayer[cell] === 0 &&
      farms.fenceLayer[cell] === 0 &&
      farms.cropLayer[cell] === 0 &&
      farms.pierLayer[cell] === 0 &&
      grid[cell] !== rockIdx &&
      grid[cell] !== swampIdx &&
      grid[cell] !== cobbleIdx &&
      grid[cell] !== deepIdx &&
      grid[cell] !== shallowIdx;
    let inserted = 0;
    let unresolved = 0;
    for (let y = 0; y < height - 1; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cell = y * width + x;
        const cls = pathLayer[cell] as number;
        if (cls === 0) continue;
        for (const dx of [-1, 1] as const) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const diagonal = (y + 1) * width + nx;
          if (pathLayer[diagonal] !== cls) continue;
          const sideA = y * width + nx;
          const sideB = (y + 1) * width + x;
          if (pathLayer[sideA] === cls || pathLayer[sideB] === cls) continue;
          if (canHostStep(sideA)) {
            pathLayer[sideA] = cls;
            inserted += 1;
          } else if (canHostStep(sideB)) {
            pathLayer[sideB] = cls;
            inserted += 1;
          } else {
            // Both corners occupied/hostile: the pair keeps its two stubs
            // (cosmetic only — never a traversal question; diagonal cells
            // do not connect in the loader either direction). The b75 law
            // test counts these on the shipped world so a regression is
            // loud where it matters, without a new plumbing channel here.
            unresolved += 1;
          }
        }
      }
    }
    void inserted;
    void unresolved;
  }

  // Lone-cobble cleanup (behavior 21): an approach or street stump with no
  // orthogonal corridor neighbor is one-cell confetti, not a corridor —
  // orthogonal chains mean nothing routes THROUGH a lone cell, so reverting
  // it to a land neighbor's material can never sever traversal. A street
  // ford IS a corridor continuation: the far bank of a ford keeps its
  // cobble, or the ford's own justification (corridor on both sides)
  // silently evaporates and consumers disagree.
  {
    const cobbleValue = PALETTE_INDEX["terrain.cobble"];
    const roadValue = PALETTE_INDEX["terrain.packed_road"];
    const fordSet = new Set(streetFordCells);
    for (let index = 0; index < grid.length; index += 1) {
      if (grid[index] !== cobbleValue || structureLayer[index] !== 0) continue;
      const x = index % width;
      const y = (index - x) / width;
      let corridorNeighbor = false;
      let landFallback = -1;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const neighbor = ny * width + nx;
        const material = grid[neighbor] as number;
        if (material === cobbleValue || material === roadValue || fordSet.has(neighbor)) {
          corridorNeighbor = true;
          break;
        }
        if (landFallback === -1 && hydro.waterKind[neighbor] === WATER_NONE && hydro.isRiver[neighbor] === 0) {
          landFallback = material;
        }
      }
      if (!corridorNeighbor && landFallback !== -1) {
        grid[index] = landFallback;
      }
    }
  }

  // NOTE (2026-08-01, sl-0075 closed SUPERSEDED): the walkable-woods
  // re-spacing pass was built, validated, designer-render-approved, then
  // PARKED UNRELEASED the same day — the ruling moved: prop composition
  // is art direction and ships as authored; navigation through prop
  // fields is solved game-side (art-matched prop collision, sl-0078).
  // The pass lives dormant in src/decoration/respace.ts (a possible
  // future designer-OPT-IN art tool); it is deliberately NOT called
  // here, so generation is byte-identical to behavior 77.

  // Authored cell overrides (behavior 36): the designer's spot decisions,
  // applied last so they win over every procedural pass, before validation
  // and resolution so every validator still judges the final world. Water
  // materials are rejected at recipe validation (hydrology owns water), so
  // nothing here can desync the river/water layers.
  for (const override of config.authoring.cellOverrides) {
    const cell = (override.cell[1] as number) * width + (override.cell[0] as number);
    if (override.material !== null) {
      grid[cell] = PALETTE_INDEX[override.material as PaletteKey];
    }
    if (override.clearProp) {
      decoration.propLayer[cell] = 0;
      decoration.wildernessProps[cell] = 0;
    }
    if (override.clearDecal) {
      decoration.decalLayer[cell] = 0;
    }
  }

  const labeling = labelComponents(grid, width, height);
  const regions: RegionSummary[] = labeling.components.map((component, id) => ({
    id,
    biome: WORLD_PALETTE[component.biome] as PaletteKey,
    cellCount: component.cellCount,
  }));
  const residualSmallRegions = labeling.components.filter(
    (component) => component.cellCount < config.biomes.minRegionCells,
  ).length;

  return {
    width,
    height,
    grid,
    regions,
    residualSmallRegions,
    fields,
    moistureAdjusted,
    hydro,
    wetlandCellCount,
    routesResult,
    structureLayer,
    settlementPlans,
    quarters,
    landmarkPlans,
    decoration,
    farms,
    textureStats,
    pois,
    streetFordCells,
  };
}

function applyCoastalMoisture(
  moisture: readonly number[],
  hydro: HydrologyResult,
  config: ResolvedWorldConfig,
): number[] {
  const radius = config.water.coastalInfluenceRadius;
  const influence = config.climate.coastalInfluencePermille;
  const result = new Array<number>(moisture.length);
  if (hydro.oceanCellCount === 0 || influence === 0) {
    for (let index = 0; index < moisture.length; index += 1) {
      result[index] = moisture[index] as number;
    }
    return result;
  }
  for (let index = 0; index < moisture.length; index += 1) {
    const distance = hydro.coastDistance[index] as number;
    let boost = 0;
    if (distance > 0 && distance < radius) {
      boost = floorDiv(influence * (radius - distance), radius * 5);
    }
    result[index] = clampInt((moisture[index] as number) + boost, 0, 999);
  }
  return result;
}

function bordersWater(
  index: number,
  x: number,
  y: number,
  width: number,
  height: number,
  grid: readonly number[],
  hydro: HydrologyResult,
): boolean {
  const neighbors: number[] = [];
  if (x > 0) neighbors.push(index - 1);
  if (x < width - 1) neighbors.push(index + 1);
  if (y > 0) neighbors.push(index - width);
  if (y < height - 1) neighbors.push(index + width);
  for (const neighbor of neighbors) {
    const value = grid[neighbor] as number;
    if (value === DEEP || value === SHALLOW || hydro.isRiver[neighbor] === 1) {
      return true;
    }
  }
  return false;
}
