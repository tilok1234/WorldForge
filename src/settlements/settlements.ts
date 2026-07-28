/**
 * Settlement planner (docs/ARCHITECTURE_AND_CONTRACTS.md, component 8;
 * Milestone W5). Three tiers since settlements.plans v5: the first
 * (best-scored) candidate becomes the capital city, the next townCount
 * candidates towns, the rest outposts. Purposes derive from geography; plazas
 * and settlement streets are cobble areas per the corridor doctrine;
 * structures place atomically with a one-cell gap, entrances face the street
 * network, and approaches are carved as cobble so every entrance joins
 * required traversal.
 */

import type { ResolvedWorldConfig } from "../recipe/compile.js";
import type { HydrologyResult } from "../hydrology/hydrology.js";
import { WATER_NONE } from "../hydrology/hydrology.js";
import type { MacroFields } from "../fields/macroFields.js";
import type { RoutesResult } from "../routes/routes.js";
import { PALETTE_INDEX } from "../regions/biomes.js";
import { channel, type Channel } from "../core/channels.js";
import {
  STRUCTURE_FOOTPRINTS,
  STRUCTURE_LAYER_VALUE,
  type StructureType,
} from "./structures.js";

/**
 * settlements.plans v5: three tiers. The city leads with a civic core and a
 * market row, towns with civic specials and market stalls; both then fill
 * from a rolled mix along the plaza, street arms, and (city) the ring road.
 * Outposts grew into villages: nine-lot purpose kits instead of six.
 */
const CITY_SPECIALS: readonly StructureType[] = [
  "structure.town_hall",
  "structure.manor",
  "structure.chapel",
  "structure.smithy",
  "structure.tavern",
  "structure.stall",
  "structure.stall",
  "structure.bakery",
  "structure.stall",
  "structure.tavern",
  "structure.manor",
  "structure.well",
];
const CITY_FILL: readonly { readonly type: StructureType; readonly weight: number }[] = [
  { type: "structure.house", weight: 38 },
  { type: "structure.cottage", weight: 26 },
  { type: "structure.bakery", weight: 9 },
  { type: "structure.stall", weight: 9 },
  { type: "structure.tavern", weight: 6 },
  { type: "structure.smithy", weight: 5 },
  { type: "structure.well", weight: 7 },
];
const TOWN_SPECIALS: readonly StructureType[] = [
  "structure.town_hall",
  "structure.tavern",
  "structure.smithy",
  "structure.stall",
  "structure.stall",
  "structure.chapel",
  "structure.manor",
  "structure.bakery",
];
const TOWN_FILL: readonly { readonly type: StructureType; readonly weight: number }[] = [
  { type: "structure.cottage", weight: 40 },
  { type: "structure.house", weight: 28 },
  { type: "structure.bakery", weight: 10 },
  { type: "structure.stall", weight: 8 },
  { type: "structure.tavern", weight: 6 },
  { type: "structure.well", weight: 8 },
];
const OUTPOST_SEQUENCES: { readonly [key in SettlementPlan["purpose"]]: readonly StructureType[] } = {
  farming: ["structure.farmhouse", "structure.barn", "structure.stall", "structure.cottage", "structure.cottage", "structure.house", "structure.cottage", "structure.barn", "structure.well"],
  mining: ["structure.watchtower", "structure.cottage", "structure.stall", "structure.cottage", "structure.house", "structure.smithy", "structure.cottage", "structure.house", "structure.well"],
  harbor: ["structure.watchtower", "structure.cottage", "structure.stall", "structure.cottage", "structure.house", "structure.tavern", "structure.cottage", "structure.house", "structure.well"],
  crossing: ["structure.watchtower", "structure.tavern", "structure.cottage", "structure.cottage", "structure.house", "structure.stall", "structure.cottage", "structure.house", "structure.well"],
  waypoint: ["structure.watchtower", "structure.cottage", "structure.cottage", "structure.cottage", "structure.house", "structure.stall", "structure.cottage", "structure.house", "structure.well"],
};

/**
 * Behavior 49 variety: purpose-flavored additions from the newly rostered
 * package structures. City/town packs SPLICE into the civic specials after
 * the leading institutions; outpost swaps replace filler slots in the
 * purpose kits. Only consulted when rules.variety is true.
 */
const CITY_PURPOSE_SPECIALS: { readonly [key in SettlementPlan["purpose"]]: readonly StructureType[] } = {
  harbor: ["structure.warehouse", "structure.fisher_hut", "structure.store"],
  crossing: ["structure.watermill", "structure.store", "structure.guardhouse"],
  farming: ["structure.windmill", "structure.store", "structure.guardhouse"],
  mining: ["structure.quarry", "structure.store", "structure.guardhouse"],
  waypoint: ["structure.guardhouse", "structure.store", "structure.warehouse"],
};
const TOWN_PURPOSE_SPECIALS: { readonly [key in SettlementPlan["purpose"]]: readonly StructureType[] } = {
  harbor: ["structure.fisher_hut", "structure.store"],
  crossing: ["structure.watermill", "structure.guardhouse"],
  farming: ["structure.windmill", "structure.guardhouse"],
  mining: ["structure.quarry", "structure.guardhouse"],
  waypoint: ["structure.guardhouse", "structure.store"],
};
const VARIETY_CITY_FILL: readonly { readonly type: StructureType; readonly weight: number }[] = [
  ...CITY_FILL,
  { type: "structure.store", weight: 6 },
  { type: "structure.guardhouse", weight: 4 },
];
const VARIETY_TOWN_FILL: readonly { readonly type: StructureType; readonly weight: number }[] = [
  ...TOWN_FILL,
  { type: "structure.store", weight: 5 },
  { type: "structure.guardhouse", weight: 4 },
];
// Swap slots stay below the smallest outpostLots (tiny: 6) so every size
// carries its flavor structure.
const OUTPOST_VARIETY_SWAPS: { readonly [key in SettlementPlan["purpose"]]: readonly (readonly [number, StructureType])[] } = {
  farming: [[2, "structure.windmill"]],
  mining: [[2, "structure.quarry"]],
  harbor: [[2, "structure.fisher_hut"]],
  crossing: [[5, "structure.guardhouse"]],
  waypoint: [[1, "structure.tent"], [5, "structure.guardhouse"]],
};

const COBBLE = PALETTE_INDEX["terrain.cobble"];
const PACKED_ROAD = PALETTE_INDEX["terrain.packed_road"];
const GRASS = PALETTE_INDEX["terrain.grass"];
const ROCK = PALETTE_INDEX["terrain.rock"];
const DEEP = PALETTE_INDEX["water.deep"];
/** Path-layer value for in-settlement lanes (behavior 57): renders as the
 * heavier "road" band while wilderness trails (1) keep dirtpath. */
const CITY_LANE = 2;
const SHALLOW = PALETTE_INDEX["water.shallow"];

export interface PlacedStructure {
  readonly type: StructureType;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly entranceX: number;
  readonly entranceY: number;
  /**
   * How the approach was expressed (behavior 50; internal — never
   * serialized into the artifact). Solid entrances must join the corridor
   * network; worn/none entrances are verified against walkable ground.
   */
  readonly laneMode: "solid" | "worn" | "none";
}

export interface SettlementPlan {
  readonly id: number;
  readonly kind: "city" | "town" | "outpost";
  readonly anchorX: number;
  readonly anchorY: number;
  readonly purpose: "harbor" | "crossing" | "farming" | "mining" | "waypoint";
  readonly radius: number;
  readonly structures: readonly PlacedStructure[];
}

export function planSettlements(
  grid: number[],
  structureLayer: Uint8Array,
  fields: MacroFields,
  hydro: HydrologyResult,
  routes: RoutesResult,
  config: ResolvedWorldConfig,
  errors: string[],
  laneCells: number[] = [],
): SettlementPlan[] {
  const { width, height } = fields;
  const rules = config.settlements;
  const plans: SettlementPlan[] = [];
  const candidates = routes.destinations.filter((d) => d.kind === "settlement_candidate");
  // Behavior 49 channels. Positional and salt-keyed, so consulting them only
  // when the style knobs are non-zero keeps style-free worlds byte-identical.
  const organics = channel(config.seed, "settlements.organics");
  const scatterChannel = channel(config.seed, "settlements.scatter");
  const wear = channel(config.seed, "settlements.wear");
  // Lane cells double as a stamp keep-out (like pathLayer): a later house
  // must not build over an earlier house's verified way to its door.
  const laneSet = new Set<number>();

  for (let rank = 0; rank < candidates.length; rank += 1) {
    const anchor = (candidates[rank] as { cell: number }).cell;
    const anchorX = anchor % width;
    const anchorY = (anchor - anchorX) / width;
    const kind =
      rank < rules.cityCount ? "city" : rank < rules.cityCount + rules.townCount ? "town" : "outpost";
    const baseRadius =
      kind === "city" ? rules.cityRadius : kind === "town" ? rules.townRadius : rules.outpostRadius;
    // Growth roll (behavior 49): squared so most settlements stay near base
    // and a few approach the cap — cities roll the full growthPermille,
    // towns half, outposts none. Zero style means zero bonus, and radius,
    // lots, and the approach budget all fall through to their v11 values.
    const growthCap =
      kind === "city" ? rules.growthPermille : kind === "town" ? Math.trunc(rules.growthPermille / 2) : 0;
    const growthRoll = growthCap > 0 ? organics.permilleAt(anchorX, anchorY) : 0;
    const growthPermille = Math.trunc((growthCap * growthRoll * growthRoll) / 1_000_000);
    const grownRadius = baseRadius + Math.trunc((baseRadius * growthPermille) / 1000);
    // Scatter EXTENDS the fabric's reach on top of growth: the same lot
    // list redistributes over a wider footprint (dense core, thin rim)
    // instead of thinning inside the old bound and losing its tail — on
    // small radii the rings would otherwise run out before the lots do.
    const radius = grownRadius + Math.trunc((grownRadius * rules.scatterPermille) / 1000);
    const totalBonusPermille = Math.trunc(((radius - baseRadius) * 1000) / baseRadius);
    const approachBudget =
      rules.approachMaxLength + Math.trunc((rules.approachMaxLength * totalBonusPermille) / 1000);

    // Purpose reads the BASE-radius surroundings: what a settlement is comes
    // from its geography, not from how large the growth roll let it sprawl.
    const purpose = derivePurpose(anchorX, anchorY, baseRadius, grid, hydro, width, height);

    // Through-roads neck down inside the hold (behavior 52): a wide corridor
    // between buildings reads as a solid clutter of road (round-4 verdict),
    // so under narrowStreets the route painter's flank cells give their
    // ground back within settlement bounds and only the centerline lane
    // runs on. Fords and bridges are path cells — never flanks — so every
    // crossing keeps its full walkable line, and the freed ground rejoins
    // the lot pool before any building places.
    if (rules.narrowStreets) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const cell = cellAt(anchorX + dx, anchorY + dy, width, height);
          if (cell === -1 || grid[cell] !== PACKED_ROAD) continue;
          if (routes.corridorCenterline.has(cell)) {
            // Line roads (behavior 56): the through-route inside the hold
            // gives its ground back too and draws as the one-tile band —
            // the same look as its wilderness trail continuation.
            const prev =
              routes.corridorCenterPrev.get(cell) ?? routes.corridorFlankPrev.get(cell);
            if (prev !== undefined) {
              grid[cell] = prev;
              routes.pathLayer[cell] = CITY_LANE;
            }
            continue;
          }
          const previous = routes.corridorFlankPrev.get(cell);
          if (previous !== undefined) {
            grid[cell] = previous;
          }
        }
      }
    }

    // Plaza and settlement streets are cobble areas (band-free doctrine).
    const plazaRadius =
      kind === "city" ? rules.cityPlazaRadius : kind === "town" ? rules.townPlazaRadius : rules.outpostPlazaRadius;
    for (let dy = -plazaRadius; dy <= plazaRadius; dy += 1) {
      for (let dx = -plazaRadius; dx <= plazaRadius; dx += 1) {
        const cell = cellAt(anchorX + dx, anchorY + dy, width, height);
        if (cell !== -1 && isOpenLand(cell, grid, hydro)) {
          grid[cell] = COBBLE;
        }
      }
    }
    // Street arms (v4): two-cell-wide cobble streets radiate from the plaza
    // so buildings line them and the settlement reads as connected fabric.
    // Streams interrupt an arm without stopping it — the gap cells become
    // street fords downstream.
    const armLength =
      kind === "city" ? rules.cityStreetArmLength : kind === "town" ? rules.streetArmLength : 0;
    if (armLength > 0) {
      const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
      for (let direction = 0; direction < directions.length; direction += 1) {
        const [dirX, dirY] = directions[direction] as readonly [number, number];
        // Lived-in streets (behavior 50): each arm rolls its own length
        // (50%-130% of base) so the cross reads as grown, not drafted.
        const rolledArm = rules.organicStreets
          ? Math.max(2, Math.trunc((armLength * (500 + Math.trunc((wear.permilleAt(anchorX, anchorY, 100 + direction) * 800) / 1000))) / 1000))
          : armLength;
        let skippedWet = 0;
        for (let step = plazaRadius + 1; step <= plazaRadius + rolledArm; step += 1) {
          const armX = anchorX + dirX * step;
          const armY = anchorY + dirY * step;
          const lane = cellAt(armX, armY, width, height);
          const side = cellAt(armX + Math.abs(dirY), armY + Math.abs(dirX), width, height);
          if (lane === -1) break;
          if (!isOpenLand(lane, grid, hydro) && grid[lane] !== COBBLE && grid[lane] !== PACKED_ROAD) {
            // A stream or pond: allow a short gap, stop at real water bodies.
            if (hydro.isRiver[lane] === 1 && skippedWet < 2) {
              skippedWet += 1;
              continue;
            }
            break;
          }
          skippedWet = 0;
          // Line roads (behavior 56): under narrowStreets the arm draws as
          // the one-tile PATH BAND over natural ground — cobble is an area
          // material whose blob rendering reads two-three tiles wide however
          // few cells it covers (the round-7 verdict, screenshot-confirmed).
          // Without the style the arm keeps its classic two-cell cobble.
          if (isOpenLand(lane, grid, hydro)) {
            if (rules.narrowStreets) {
              routes.pathLayer[lane] = CITY_LANE;
            } else {
              grid[lane] = COBBLE;
            }
          }
          const boulevard = !rules.narrowStreets;
          if (boulevard && side !== -1 && isOpenLand(side, grid, hydro)) grid[side] = COBBLE;
        }
      }
    }
    // City ring road (v5): a one-wide cobble square at the ring radius ties
    // the four arms into an urban grid. Best-effort per cell — streams stay
    // wet (composeWorld turns corridor-flanked stream cells into fords) and
    // blocked terrain simply gaps the ring; approaches provide connectivity.
    if (kind === "city" && rules.cityRingRadius > 0) {
      const ring = rules.cityRingRadius;
      for (let d = -ring; d <= ring; d += 1) {
        for (const [rx, ry] of [
          [anchorX + d, anchorY - ring],
          [anchorX + d, anchorY + ring],
          [anchorX - ring, anchorY + d],
          [anchorX + ring, anchorY + d],
        ] as const) {
          const cell = cellAt(rx, ry, width, height);
          if (cell !== -1 && isOpenLand(cell, grid, hydro)) {
            if (rules.narrowStreets) {
              routes.pathLayer[cell] = CITY_LANE;
            } else {
              grid[cell] = COBBLE;
            }
          }
        }
      }
    }
    // Settlement streets: the road cells connected to the plaza, converted
    // contiguously so no isolated cobble islands appear in corridor runs.
    {
      const queue: number[] = [];
      const seen = new Set<number>();
      for (let dy = -plazaRadius; dy <= plazaRadius; dy += 1) {
        for (let dx = -plazaRadius; dx <= plazaRadius; dx += 1) {
          const cell = cellAt(anchorX + dx, anchorY + dy, width, height);
          if (cell !== -1 && (grid[cell] === COBBLE || grid[cell] === PACKED_ROAD)) {
            queue.push(cell);
            seen.add(cell);
          }
        }
      }
      for (let head = 0; head < queue.length; head += 1) {
        const cell = queue[head] as number;
        if (grid[cell] === PACKED_ROAD) {
          grid[cell] = COBBLE;
        }
        const x = cell % width;
        const y = (cell - x) / width;
        if (Math.max(Math.abs(x - anchorX), Math.abs(y - anchorY)) >= radius) {
          continue;
        }
        for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
          const next = cellAt(x + dx, y + dy, width, height);
          if (next !== -1 && !seen.has(next) && (grid[next] === PACKED_ROAD || grid[next] === COBBLE)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
    }

    // Structures spiral outward from the plaza in deterministic ring order.
    // The city and towns lead with civic specials then a channel-rolled fill
    // mix; outposts follow their purpose kit (settlements.plans v5; the v12
    // variety packs and lot growth join inside buildStructureSequence).
    const variety = channel(config.seed, "settlements.variety");
    const { sequence, alwaysPlace } = buildStructureSequence(
      kind, purpose, rules, growthPermille, variety, anchorX, anchorY,
    );
    const placed: PlacedStructure[] = [];

    if (kind === "city" || kind === "town") {
      // Plaza legibility (W5.1): the fountain anchors the square. Its 2x2
      // footprint centers on the plaza; the south-side cobble is the
      // approach. Falls back to the classic well if the plaza is clipped.
      // Neither may sit on pathLayer (behavior 47): a spur trail may thread
      // the plaza, and in a mountain notch that trail can be the ONLY
      // corridor — the-eight-lands' ruined-city spur was severed by a
      // fountain exactly this way. Trails win; the square stays open.
      const fountainOrigin = cellAt(anchorX - 1, anchorY - 1, width, height);
      let fountainDown = false;
      if (fountainOrigin !== -1) {
        let clear = true;
        for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
          const cell = cellAt(anchorX - 1 + sx, anchorY - 1 + sy, width, height);
          if (cell === -1 || grid[cell] !== COBBLE || structureLayer[cell] !== 0 || routes.pathLayer[cell] !== 0) {
            clear = false;
            break;
          }
        }
        if (clear) {
          // The entrance is whichever perimeter cell already joins the
          // street network (plazas can be clipped by streams).
          let entrance = -1;
          const perimeter: (readonly [number, number])[] = [];
          for (let sx = -1; sx <= 2; sx += 1) perimeter.push([anchorX - 1 + sx, anchorY + 1]);
          for (let sy = -1; sy <= 2; sy += 1) perimeter.push([anchorX + 1, anchorY - 1 + sy]);
          for (let sx = -1; sx <= 2; sx += 1) perimeter.push([anchorX - 1 + sx, anchorY - 2]);
          for (let sy = -1; sy <= 2; sy += 1) perimeter.push([anchorX - 2, anchorY - 1 + sy]);
          for (const [px, py] of perimeter) {
            const cell = cellAt(px, py, width, height);
            if (cell !== -1 && structureLayer[cell] === 0 && (grid[cell] === COBBLE || grid[cell] === PACKED_ROAD)) {
              entrance = cell;
              break;
            }
          }
          if (entrance !== -1) {
            for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
              const cell = (anchorY - 1 + sy) * width + anchorX - 1 + sx;
              structureLayer[cell] = STRUCTURE_LAYER_VALUE["structure.fountain"];
            }
            placed.push({
              type: "structure.fountain",
              x: anchorX - 1,
              y: anchorY - 1,
              width: 2,
              height: 2,
              entranceX: entrance % width,
              entranceY: Math.trunc(entrance / width),
              laneMode: "solid",
            });
            fountainDown = true;
          }
        }
      }
      if (!fountainDown) {
        const wellCell = cellAt(anchorX, anchorY, width, height);
        if (wellCell !== -1 && grid[wellCell] === COBBLE && structureLayer[wellCell] === 0 && routes.pathLayer[wellCell] === 0) {
          structureLayer[wellCell] = STRUCTURE_LAYER_VALUE["structure.well"];
          placed.push({
            type: "structure.well",
            x: anchorX,
            y: anchorY,
            width: 1,
            height: 1,
            entranceX: anchorX,
            entranceY: anchorY,
            laneMode: "solid",
          });
        }
      }
    }

    let sequenceIndex = 0;
    outer: for (let ring = plazaRadius + 1; ring <= radius && sequenceIndex < sequence.length; ring += 1) {
      for (let dy = -ring; dy <= ring && sequenceIndex < sequence.length; dy += 1) {
        for (let dx = -ring; dx <= ring && sequenceIndex < sequence.length; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) {
            continue;
          }
          const originX = anchorX + dx;
          const originY = anchorY + dy;
          const fillSlot = sequenceIndex >= alwaysPlace;
          const depthPermille = Math.trunc(((ring - plazaRadius) * 1000) / Math.max(1, radius - plazaRadius));
          let type = sequence[sequenceIndex] as StructureType;
          // Humble outskirts (behavior 50): deep fill houses sometimes build
          // as cottages — the core keeps its stature, the fringe reads
          // poorer, the way settlements actually grow.
          if (rules.organicStreets && fillSlot && type === "structure.house" && depthPermille > 500 && wear.chanceAt(originX, originY, 450, 9)) {
            type = "structure.cottage";
          }
          const footprint = STRUCTURE_FOOTPRINTS[type];
          if (footprint === undefined) {
            sequenceIndex += 1;
            continue;
          }
          const [fw, fh] = footprint;
          // Scatter falloff (behavior 49): past the civic specials, cell
          // acceptance falls linearly from the plaza out to the rim
          // (1000 -> 1000-scatterPermille), so the fabric thins into
          // scattered outskirts instead of packing every ring solid. The
          // roll is per-cell and stable, so a rejected spot stays rejected
          // for the whole settlement — real spatial gaps, not resampling.
          if (rules.scatterPermille > 0 && fillSlot) {
            const acceptance = 1000 - Math.trunc((depthPermille * rules.scatterPermille) / 1000);
            if (!scatterChannel.chanceAt(originX, originY, acceptance)) {
              continue;
            }
          }
          // Varied yards (behavior 50): some outer houses demand a wider
          // clearance ring, breaking the uniform one-cell packing texture.
          const yardGap =
            rules.organicStreets && fillSlot && depthPermille > 350 && wear.chanceAt(originX, originY, 350, 8)
              ? 2
              : 1;
          if (!footprintFits(originX, originY, fw, fh, grid, structureLayer, routes.pathLayer, hydro, width, height, yardGap, laneSet)) {
            continue;
          }
          // Stamp provisionally; a placement whose entrance cannot join the
          // street network is rolled back and the ring scan continues.
          // Unpaved yards (behavior 53): the cobble pad under every building
          // tiled a dense core into one solid slab — the round-5 verdict
          // saw "no 1 tile wide roads at all" because the whole city floor
          // was road material. Under narrowStreets, EVERY building keeps
          // the ground it was built on — a capital seats dozens of civic
          // lots, and paved civic pads alone rebuilt the slab. The plaza
          // stays the one paved area; civic doors still get solid one-wide
          // cobble approaches. Approaches cannot tunnel the unpaved pads
          // (the carve BFS excludes structure cells) — they terminate at
          // real lanes now instead of a neighbour's pad.
          const pavePad = !rules.narrowStreets;
          const savedMaterial: number[] = [];
          for (let sy = 0; sy < fh; sy += 1) {
            for (let sx = 0; sx < fw; sx += 1) {
              const cell = (originY + sy) * width + originX + sx;
              savedMaterial.push(grid[cell] as number);
              structureLayer[cell] = STRUCTURE_LAYER_VALUE[type];
              if (pavePad) {
                grid[cell] = COBBLE;
              }
            }
          }
          const entranceX = originX + Math.trunc(fw / 2);
          const entranceY = originY + fh;
          // Lived-in streets (behavior 50): civic specials keep their solid
          // cobble approaches; ordinary houses get worn packed-earth lane
          // fragments ("a few tiles indicating not much used roads"), the
          // deep fringe barely a trace — and some outer houses paint no
          // lane at all, standing free in the grass. EVERY mode still runs
          // the BFS and rolls back on failure: the connectivity check is
          // load-bearing, not cosmetic — a doorstep can open into a pocket
          // enclosed by neighboring structures, and the first styled
          // generation shipped exactly three of those before the compose
          // entrance check refused the world. No road ≠ no route.
          // The street web (behavior 55): under narrowStreets every
          // connected house gets a SOLID one-wide lane — approaches chain
          // into each other and grow a followable street tree, which is
          // what "1 tile wide roads inside the city" means; worn dotted
          // fragments read as no roads at all (round-6 verdict). The
          // round-2 directive survives at the fringe: deep houses still
          // roll roadless and stand free on the grass.
          const laneMode: "solid" | "worn" | "none" =
            !rules.organicStreets || !fillSlot
              ? "solid"
              : depthPermille > 450 && wear.chanceAt(originX, originY, 500, 7)
                ? "none"
                : rules.narrowStreets
                  ? "solid"
                  : "worn";
          const wornPermille = laneMode === "worn" ? (depthPermille > 600 ? 250 : 450) : 0;
          const laneStart = laneCells.length;
          const connected = carveApproach(
            entranceX, entranceY, grid, structureLayer, hydro, approachBudget, width, height,
            laneMode, wornPermille, wear, laneCells,
            rules.narrowStreets ? routes.pathLayer : null,
          );
          for (let recorded = laneStart; recorded < laneCells.length; recorded += 1) {
            laneSet.add(laneCells[recorded] as number);
          }
          if (!connected) {
            let restore = 0;
            for (let sy = 0; sy < fh; sy += 1) {
              for (let sx = 0; sx < fw; sx += 1) {
                const cell = (originY + sy) * width + originX + sx;
                structureLayer[cell] = 0;
                grid[cell] = savedMaterial[restore] as number;
                restore += 1;
              }
            }
            continue;
          }
          placed.push({ type, x: originX, y: originY, width: fw, height: fh, entranceX, entranceY, laneMode });
          sequenceIndex += 1;
          if (sequenceIndex >= sequence.length) {
            break outer;
          }
        }
      }
    }

    const required = sequence[0] as StructureType;
    if (!placed.some((structure) => structure.type === required)) {
      errors.push(`settlement ${rank} (${kind}) could not place its required ${required}`);
    }

    plans.push({ id: rank, kind, anchorX, anchorY, purpose, radius, structures: placed });
  }
  return plans;
}

/**
 * The settlement's build order (settlements.plans v12, exported for direct
 * tests): civic specials first — with the variety purpose pack spliced in
 * after the leading institutions when rules.variety is on — then the
 * channel-rolled fill mix out to the lot count. Lots grow with the same
 * growthPermille the radius did (area is quadratic in radius, so lots scale
 * by twice the linear bonus). alwaysPlace is the specials count: those slots
 * are exempt from the scatter falloff so the civic core always forms.
 */
export function buildStructureSequence(
  kind: SettlementPlan["kind"],
  purpose: SettlementPlan["purpose"],
  rules: ResolvedWorldConfig["settlements"],
  growthPermille: number,
  variety: Channel,
  anchorX: number,
  anchorY: number,
): { sequence: StructureType[]; alwaysPlace: number } {
  if (kind === "city" || kind === "town") {
    const baseSpecials = kind === "city" ? CITY_SPECIALS : TOWN_SPECIALS;
    const purposePack = kind === "city" ? CITY_PURPOSE_SPECIALS[purpose] : TOWN_PURPOSE_SPECIALS[purpose];
    const spliceAt = kind === "city" ? 5 : 4;
    const specials = rules.variety
      ? [...baseSpecials.slice(0, spliceAt), ...purposePack, ...baseSpecials.slice(spliceAt)]
      : [...baseSpecials];
    const fill = rules.variety
      ? kind === "city" ? VARIETY_CITY_FILL : VARIETY_TOWN_FILL
      : kind === "city" ? CITY_FILL : TOWN_FILL;
    const baseLots = kind === "city" ? rules.cityLots : rules.townLots;
    const lots = baseLots + Math.trunc((baseLots * 2 * growthPermille) / 1000);
    const sequence = [...specials.slice(0, Math.min(specials.length, lots))];
    for (let slot = sequence.length; slot < lots; slot += 1) {
      const pick = variety.weightedPickAt(anchorX, anchorY, fill.map((f) => f.weight), slot);
      sequence.push((fill[pick] as { type: StructureType }).type);
    }
    return { sequence, alwaysPlace: Math.min(specials.length, lots) };
  }
  const basePool = OUTPOST_SEQUENCES[purpose];
  let pool: StructureType[] = [...basePool];
  if (rules.variety) {
    for (const [slot, type] of OUTPOST_VARIETY_SWAPS[purpose]) {
      pool[slot] = type;
    }
  }
  const sequence = Array.from(
    { length: rules.outpostLots },
    (_, slot) => pool[Math.min(slot, pool.length - 1)] as StructureType,
  );
  return { sequence, alwaysPlace: 1 };
}

function derivePurpose(
  anchorX: number,
  anchorY: number,
  radius: number,
  grid: readonly number[],
  hydro: HydrologyResult,
  width: number,
  height: number,
): SettlementPlan["purpose"] {
  const anchor = anchorY * width + anchorX;
  const coast = hydro.coastDistance[anchor] as number;
  if (coast >= 0 && coast <= radius + 4 && hydro.oceanCellCount > 0) {
    return "harbor";
  }
  let riverNear = false;
  let rockNear = false;
  let grassCells = 0;
  let landCells = 0;
  for (let dy = -radius - 2; dy <= radius + 2; dy += 1) {
    for (let dx = -radius - 2; dx <= radius + 2; dx += 1) {
      const cell = cellAt(anchorX + dx, anchorY + dy, width, height);
      if (cell === -1) {
        continue;
      }
      if (hydro.isRiver[cell] === 1 && Math.max(Math.abs(dx), Math.abs(dy)) <= 4) {
        riverNear = true;
      }
      if (grid[cell] === ROCK) {
        rockNear = true;
      }
      if (hydro.waterKind[cell] === WATER_NONE) {
        landCells += 1;
        if (grid[cell] === GRASS) {
          grassCells += 1;
        }
      }
    }
  }
  if (riverNear) {
    return "crossing";
  }
  if (landCells > 0 && grassCells * 100 >= landCells * 45) {
    return "farming";
  }
  if (rockNear) {
    return "mining";
  }
  return "waypoint";
}

function footprintFits(
  originX: number,
  originY: number,
  fw: number,
  fh: number,
  grid: readonly number[],
  structureLayer: Uint8Array,
  pathLayer: Uint8Array,
  hydro: HydrologyResult,
  width: number,
  height: number,
  gap = 1,
  laneSet: ReadonlySet<number> | null = null,
): boolean {
  // The footprint plus the gap ring must be clear of other structures
  // (behavior 50 varies the ring to break the uniform packing texture).
  for (let sy = -gap; sy <= fh + gap - 1; sy += 1) {
    for (let sx = -gap; sx <= fw + gap - 1; sx += 1) {
      const cell = cellAt(originX + sx, originY + sy, width, height);
      if (cell === -1) {
        return false;
      }
      if (structureLayer[cell] !== 0) {
        return false;
      }
      const inFootprint = sx >= 0 && sx < fw && sy >= 0 && sy < fh;
      if (inFootprint && !isOpenLand(cell, grid, hydro)) {
        return false;
      }
      // Trails are corridors (behavior 21): a house on a dirt path would
      // sever a route the network already promised. Worn/unpainted lanes
      // (behavior 50) carry the same promise.
      if (inFootprint && pathLayer[cell] !== 0) {
        return false;
      }
      if (inFootprint && laneSet !== null && laneSet.has(cell)) {
        return false;
      }
    }
  }
  return true;
}

function carveApproach(
  startX: number,
  startY: number,
  grid: number[],
  structureLayer: Uint8Array,
  hydro: HydrologyResult,
  maxLength: number,
  width: number,
  height: number,
  mode: "solid" | "worn" | "none" = "solid",
  wornPermille = 0,
  wear: Channel | null = null,
  laneCells: number[] | null = null,
  /** Line roads (behavior 56): paint the path band instead of cobble, and
   * count existing band cells as network so lanes chain into streets. */
  bandLanes: Uint8Array | null = null,
): boolean {
  // Deterministic BFS to the nearest street (cobble or road). The
  // verification and rollback contract is identical in every mode; only
  // the painting differs. Solid carves cobble; worn (behavior 50) paints
  // scattered packed-earth cells along the verified route — a barely-there
  // lane, doorstep always marked; none verifies and paints nothing.
  // Worn/none routes are RECORDED in laneCells so decoration keeps its
  // blocking props off them: solid cobble protected the route implicitly,
  // and an invisible lane must stay just as open (the first styled
  // generation sealed three verified grass routes with rolled trees).
  const start = cellAt(startX, startY, width, height);
  if (start === -1) {
    return false;
  }
  const startIsRoad =
    grid[start] === COBBLE ||
    grid[start] === PACKED_ROAD ||
    (bandLanes !== null && bandLanes[start] !== 0);
  if (mode === "solid") {
    // Legacy contract, byte-for-byte: solid approaches trust road material
    // and pave whatever they cross (approved worlds bake this in).
    if (startIsRoad) {
      return true;
    }
    if (!isOpenLand(start, grid, hydro) || structureLayer[start] !== 0) {
      return false;
    }
  } else {
    // Worn/none lanes verify GROUND truth (behavior 53): a doorstep that is
    // already road material may be an isolated fragment — a route flank
    // painted over a rock notch, or a stray worn cell — so it proves
    // nothing by itself. Run the BFS anyway, and close ROCK to the walk
    // (mirroring the compose ground tier): isOpenLand never excluded rock,
    // and pre-53 the pads and solid approaches simply paved over it, which
    // is how a cottage doorstep ended up sealed inside a mountain pocket.
    if (structureLayer[start] !== 0) {
      return false;
    }
    if (!startIsRoad && (!isOpenLand(start, grid, hydro) || grid[start] === ROCK)) {
      return false;
    }
  }
  const paint = (target: number): void => {
    if (mode !== "solid" && laneCells !== null) {
      laneCells.push(target);
    }
    if (mode === "none") return;
    if (bandLanes !== null) {
      bandLanes[target] = CITY_LANE;
      return;
    }
    if (mode === "solid" || wear === null) {
      grid[target] = COBBLE;
      return;
    }
    const px = target % width;
    const py = (target - px) / width;
    if (wear.chanceAt(px, py, wornPermille, 11)) {
      grid[target] = PACKED_ROAD;
    }
  };
  const previous = new Map<number, number>();
  const queue = [start];
  previous.set(start, -1);
  for (let head = 0; head < queue.length && head <= maxLength * 8; head += 1) {
    const cell = queue[head] as number;
    const cellIsNetwork =
      grid[cell] === COBBLE ||
      grid[cell] === PACKED_ROAD ||
      (bandLanes !== null && bandLanes[cell] !== 0);
    if (cellIsNetwork && cell !== start) {
      let cursor: number = previous.get(cell) as number;
      while (cursor !== -1 && cursor !== start) {
        paint(cursor);
        cursor = previous.get(cursor) as number;
      }
      if (mode !== "solid" && laneCells !== null) {
        laneCells.push(start);
      }
      if (mode !== "none") {
        if (bandLanes !== null) {
          bandLanes[start] = CITY_LANE;
        } else {
          grid[start] = mode === "solid" || wear === null ? COBBLE : PACKED_ROAD;
        }
      }
      return true;
    }
    const x = cell % width;
    const y = (cell - x) / width;
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
      const next = cellAt(x + dx, y + dy, width, height);
      if (next === -1 || previous.has(next)) {
        continue;
      }
      const open =
        (isOpenLand(next, grid, hydro) && (mode === "solid" || grid[next] !== ROCK)) ||
        grid[next] === COBBLE ||
        grid[next] === PACKED_ROAD;
      if (open && structureLayer[next] === 0) {
        previous.set(next, cell);
        queue.push(next);
      }
    }
  }
  return false;
}

function isOpenLand(cell: number, grid: readonly number[], hydro: HydrologyResult): boolean {
  return (
    hydro.waterKind[cell] === WATER_NONE &&
    hydro.isRiver[cell] === 0 &&
    grid[cell] !== DEEP &&
    grid[cell] !== SHALLOW &&
    grid[cell] !== PACKED_ROAD
  );
}

function cellAt(x: number, y: number, width: number, height: number): number {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return -1;
  }
  return y * width + x;
}
