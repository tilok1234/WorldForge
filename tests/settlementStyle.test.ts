import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { validateRecipe } from "../src/recipe/validate.js";
import { normalizeRecipe, recipeIdentity } from "../src/recipe/normalize.js";
import { compileRecipe } from "../src/recipe/compile.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { loadWorldArtifact } from "../src/consumers/typescript/loader.js";
import { buildStructureSequence } from "../src/settlements/settlements.js";
import { PIER_TYPES } from "../src/settlements/farms.js";
import { DECOR_TYPES } from "../src/decoration/decorate.js";
import { STRUCTURE_FOOTPRINTS, STRUCTURE_TYPES } from "../src/settlements/structures.js";
import { STRUCTURE_NAME } from "../src/adapters/tileforge/resolve.js";
import { loadPinnedManifest } from "../src/adapters/tileforge/manifest.js";
import { channel } from "../src/core/channels.js";
import { PALETTE_INDEX } from "../src/regions/biomes.js";

const BASE = {
  recipeFormat: 1,
  seed: 11,
  world: { sizePreset: "tiny", climatePreset: "temperate" },
  budgets: { settlementCount: 2, primaryRouteCount: 1, landmarkCount: 0 },
};

function compiled(recipe: unknown) {
  const validation = validateRecipe(recipe);
  assert.ok(validation.ok, JSON.stringify(validation.ok ? [] : validation.issues));
  const normalized = normalizeRecipe(validation.recipe);
  return { normalized, config: compileRecipe(normalized) };
}

describe("settlement style vocabulary (behavior 49)", () => {
  it("normalizes defaults and joins the resolved config", () => {
    const { normalized, config } = compiled({
      ...BASE,
      settlementStyle: { growthPermille: 600 },
    });
    assert.deepEqual(normalized.settlementStyle, {
      growthPermille: 600,
      scatterPermille: 0,
      variety: false,
      organicStreets: false,
      narrowStreets: false,
      urbanBlocks: false,
      cityWalls: false,
    });
    assert.equal(config.settlements.growthPermille, 600);
    assert.equal(config.settlements.scatterPermille, 0);
    assert.equal(config.settlements.variety, false);
  });

  it("rejects out-of-range knobs, unknown fields, and non-boolean variety", () => {
    for (const style of [
      { growthPermille: 1001 },
      { growthPermille: -1 },
      { scatterPermille: 901 },
      { swagger: 500 },
      { variety: "yes" },
      { narrowStreets: "yes" },
      { urbanBlocks: "yes" },
      { cityWalls: "yes" },
    ]) {
      const validation = validateRecipe({ ...BASE, settlementStyle: style });
      assert.ok(!validation.ok, `expected rejection: ${JSON.stringify(style)}`);
    }
  });

  it("style-free recipes keep their normalized shape and identity", () => {
    const { normalized } = compiled(BASE);
    assert.ok(!("settlementStyle" in normalized), "absent style must stay absent");
    const withStyle = compiled({ ...BASE, settlementStyle: { variety: true } });
    assert.notEqual(recipeIdentity(normalized), recipeIdentity(withStyle.normalized));
  });

  it("the canonical baseline recipeSha256 is untouched (approval sidecar)", () => {
    const recipe: unknown = JSON.parse(
      readFileSync(new URL("../../fixtures/recipes/small-cold-coastal.json", import.meta.url), "utf8"),
    );
    const approval = JSON.parse(
      readFileSync(new URL("../../fixtures/recipes/small-cold-coastal.json.approval.json", import.meta.url), "utf8"),
    ) as { recipeSha256: string };
    const validation = validateRecipe(recipe);
    assert.ok(validation.ok);
    assert.equal(recipeIdentity(normalizeRecipe(validation.recipe)), approval.recipeSha256);
  });
});

describe("settlement organics (behavior 49)", () => {
  it("a present-but-zero style generates the exact pre-49 fabric", () => {
    const plain = compiled(BASE);
    const zeroed = compiled({
      ...BASE,
      settlementStyle: { growthPermille: 0, scatterPermille: 0, variety: false },
    });
    const a = generateWorldDetailed(plain.normalized, plain.config);
    const b = generateWorldDetailed(zeroed.normalized, zeroed.config);
    assert.deepEqual(b.artifact.settlements, a.artifact.settlements);
    assert.deepEqual(b.artifact.destinations, a.artifact.destinations);
    assert.deepEqual(b.artifact.pois, a.artifact.pois);
  });

  it("growth rolls the documented radius bonus per settlement", () => {
    const styled = compiled({ ...BASE, settlementStyle: { growthPermille: 1000 } });
    const { artifact } = generateWorldDetailed(styled.normalized, styled.config);
    const organics = channel(styled.config.seed, "settlements.organics");
    const rules = styled.config.settlements;
    for (const settlement of artifact.settlements) {
      const [ax, ay] = settlement.anchor;
      const base =
        settlement.kind === "city" ? rules.cityRadius
        : settlement.kind === "town" ? rules.townRadius
        : rules.outpostRadius;
      const cap =
        settlement.kind === "city" ? rules.growthPermille
        : settlement.kind === "town" ? Math.trunc(rules.growthPermille / 2)
        : 0;
      const roll = cap > 0 ? organics.permilleAt(ax, ay) : 0;
      const bonus = Math.trunc((cap * roll * roll) / 1_000_000);
      assert.equal(
        settlement.radius,
        base + Math.trunc((base * bonus) / 1000),
        `${settlement.kind} at (${ax}, ${ay})`,
      );
    }
  });

  it("scatter spreads the fabric outward from the anchor", () => {
    const plain = compiled(BASE);
    const scattered = compiled({ ...BASE, settlementStyle: { scatterPermille: 850 } });
    const meanDistance = (result: ReturnType<typeof generateWorldDetailed>): number => {
      let total = 0;
      let count = 0;
      for (const settlement of result.artifact.settlements) {
        for (const structure of settlement.structures) {
          total += Math.max(
            Math.abs(structure.cell[0] - settlement.anchor[0]),
            Math.abs(structure.cell[1] - settlement.anchor[1]),
          );
          count += 1;
        }
      }
      assert.ok(count > 0, "no structures placed");
      return total / count;
    };
    const blob = meanDistance(generateWorldDetailed(plain.normalized, plain.config));
    const spread = meanDistance(generateWorldDetailed(scattered.normalized, scattered.config));
    assert.ok(spread > blob, `mean structure distance ${spread.toFixed(2)} should exceed blob ${blob.toFixed(2)}`);
  });
});

describe("lived-in streets (behavior 50)", () => {
  it("validates and normalizes the flag", () => {
    const { normalized, config } = compiled({
      ...BASE,
      settlementStyle: { organicStreets: true },
    });
    assert.equal(normalized.settlementStyle?.organicStreets, true);
    assert.equal(config.settlements.organicStreets, true);
    const rejected = validateRecipe({ ...BASE, settlementStyle: { organicStreets: "ye" } });
    assert.ok(!rejected.ok);
  });

  it("off is byte-identical to a style without the key", () => {
    const without = compiled({ ...BASE, settlementStyle: { scatterPermille: 300 } });
    const withOff = compiled({
      ...BASE,
      settlementStyle: { scatterPermille: 300, organicStreets: false },
    });
    const a = generateWorldDetailed(without.normalized, without.config);
    const b = generateWorldDetailed(withOff.normalized, withOff.config);
    assert.deepEqual(b.artifact.settlements, a.artifact.settlements);
    assert.deepEqual(b.composed.grid, a.composed.grid);
  });

  it("wears the lanes: less cobble, packed-earth fragments, and cottages appear", () => {
    const COBBLE_INDEX = PALETTE_INDEX["terrain.cobble"] as number;
    const PACKED_INDEX = PALETTE_INDEX["terrain.packed_road"] as number;
    // Big fabric on the tiny map so the deep rings actually exist: full
    // growth + heavy scatter puts fill houses past depth 500.
    const knobs = { growthPermille: 1000, scatterPermille: 850 };
    const plain = compiled({ ...BASE, settlementStyle: knobs });
    const organic = compiled({
      ...BASE,
      settlementStyle: { ...knobs, organicStreets: true },
    });
    const a = generateWorldDetailed(plain.normalized, plain.config);
    const b = generateWorldDetailed(organic.normalized, organic.config);
    const count = (grid: readonly number[], value: number): number =>
      grid.reduce((total, cell) => total + (cell === value ? 1 : 0), 0);
    assert.ok(
      count(b.composed.grid, COBBLE_INDEX) < count(a.composed.grid, COBBLE_INDEX),
      "worn approaches must carve less solid cobble",
    );
    assert.ok(
      count(b.composed.grid, PACKED_INDEX) > count(a.composed.grid, PACKED_INDEX),
      "worn lanes must leave packed-earth fragments",
    );
    const cottages = (result: ReturnType<typeof generateWorldDetailed>): number =>
      result.artifact.settlements.reduce(
        (total, s) => total + s.structures.filter((st) => st.type === "structure.cottage").length,
        0,
      );
    assert.ok(cottages(b) > cottages(a), "deep houses must humble into cottages");
  });
});

describe("narrow streets (behavior 51)", () => {
  it("validates and normalizes the flag", () => {
    const { normalized, config } = compiled({
      ...BASE,
      settlementStyle: { narrowStreets: true },
    });
    assert.equal(normalized.settlementStyle?.narrowStreets, true);
    assert.equal(config.settlements.narrowStreets, true);
    // Trunk sharing (behavior 54) rides the same flag.
    assert.equal(config.routes.roadReusePermille, 600);
    assert.equal(compiled(BASE).config.routes.roadReusePermille, 0);
  });

  it("off is byte-identical to a style without the key", () => {
    const without = compiled({ ...BASE, settlementStyle: { growthPermille: 400 } });
    const withOff = compiled({
      ...BASE,
      settlementStyle: { growthPermille: 400, narrowStreets: false },
    });
    const a = generateWorldDetailed(without.normalized, without.config);
    const b = generateWorldDetailed(withOff.normalized, withOff.config);
    assert.deepEqual(b.artifact.settlements, a.artifact.settlements);
    assert.deepEqual(b.composed.grid, a.composed.grid);
  });

  it("draws in-settlement roads as one-tile band lines, not cobble", () => {
    const COBBLE_INDEX = PALETTE_INDEX["terrain.cobble"] as number;
    const plain = compiled({ ...BASE, settlementStyle: { growthPermille: 600 } });
    const narrow = compiled({
      ...BASE,
      settlementStyle: { growthPermille: 600, narrowStreets: true },
    });
    const a = generateWorldDetailed(plain.normalized, plain.config);
    const b = generateWorldDetailed(narrow.normalized, narrow.config);
    const count = (grid: readonly number[]): number =>
      grid.reduce((total, cell) => total + (cell === COBBLE_INDEX ? 1 : 0), 0);
    // Cobble shrinks to the plaza; the road look moves to the path band.
    assert.ok(
      count(b.composed.grid) < count(a.composed.grid),
      "line roads must paint far less cobble than boulevards",
    );
    const bandCells = (result: ReturnType<typeof generateWorldDetailed>): number => {
      let total = 0;
      for (const value of result.composed.routesResult.pathLayer) total += value;
      return total;
    };
    assert.ok(
      bandCells(b) > bandCells(a),
      "narrowStreets must add band lanes to the path layer",
    );

    // The arm reads as a followable line: a run of consecutive band cells
    // marching away from some anchor, on natural (non-cobble) ground.
    const { width } = narrow.config.world;
    const pathLayer = b.composed.routesResult.pathLayer;
    const grid = b.composed.grid;
    let armLine = false;
    for (const settlement of b.artifact.settlements) {
      const [ax, ay] = settlement.anchor;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        let run = 0;
        for (let step = 3; step <= 24; step += 1) {
          const cell = (ay + dy * step) * width + ax + dx * step;
          if (pathLayer[cell] !== 0 && grid[cell] !== COBBLE_INDEX) {
            run += 1;
            if (run >= 4) armLine = true;
          } else {
            run = 0;
          }
        }
      }
    }
    assert.ok(armLine, "no band arm line found leaving a plaza");

    // Behavior 57: in-settlement lanes carry value 2 (the road band);
    // nothing writes 2 without the style.
    let cityLanes = 0;
    for (const value of pathLayer) if (value === 2) cityLanes += 1;
    assert.ok(cityLanes > 0, "no city-lane (value 2) cells with narrowStreets on");
    let plainCityLanes = 0;
    for (const value of a.composed.routesResult.pathLayer) if (value === 2) plainCityLanes += 1;
    assert.equal(plainCityLanes, 0, "value 2 leaked into a style-free path layer");
  });

  it("city quarters break the fabric: markets, closes, greens (behavior 59)", () => {
    const urban = compiled({
      ...BASE,
      settlementStyle: { growthPermille: 600, narrowStreets: true, urbanBlocks: true },
    });
    const b = generateWorldDetailed(urban.normalized, urban.config);
    const quarters = b.composed.quarters;
    assert.ok(quarters.length > 0, "no quarters placed");
    assert.ok(quarters.some((q) => q.kind === "market"), "no market quarter");
    const inQuarter = (q: { x: number; y: number; w: number; h: number }, cx: number, cy: number): boolean =>
      cx >= q.x && cx < q.x + q.w && cy >= q.y && cy < q.y + q.h;
    // A market carries its stall row and well inside the square.
    const market = quarters.find((q) => q.kind === "market");
    assert.ok(market !== undefined);
    const furniture = b.artifact.settlements.flatMap((s2) => s2.structures);
    assert.ok(
      furniture.some((st) => st.type === "structure.stall" && inQuarter(market, st.cell[0], st.cell[1])),
      "market square has no stalls",
    );
    // No house or cottage ever stamps inside a quarter.
    for (const st of furniture) {
      if (st.type !== "structure.house" && st.type !== "structure.cottage") continue;
      for (const q of quarters) {
        assert.ok(!inQuarter(q, st.cell[0], st.cell[1]), `${st.type} inside a ${q.kind} quarter`);
      }
    }
    // A church close grows gravestones in its yard (when one fits).
    const church = quarters.find((q) => q.kind === "church");
    if (church !== undefined) {
      const { width } = urban.config.world;
      let graves = 0;
      for (let sy = 0; sy < church.h; sy += 1) {
        for (let sx = 0; sx < church.w; sx += 1) {
          if (b.composed.decoration.propLayer[(church.y + sy) * width + church.x + sx] !== 0) graves += 1;
        }
      }
      assert.ok(graves > 0, "church close has an empty yard");
    }
    // The flag off places nothing.
    const plain = compiled({ ...BASE, settlementStyle: { growthPermille: 600 } });
    assert.equal(generateWorldDetailed(plain.normalized, plain.config).composed.quarters.length, 0);
  });

  it("garden greens wall in hedge and dress formal (behavior 65)", () => {
    const urban = compiled({
      ...BASE,
      settlementStyle: { growthPermille: 600, narrowStreets: true, urbanBlocks: true },
    });
    const b = generateWorldDetailed(urban.normalized, urban.config);
    const { width } = urban.config.world;
    const greens = b.composed.quarters.filter((q) => q.kind === "green");
    assert.ok(greens.length > 0, "fixture lost its greens");
    const HEDGE = 4;
    const fences = b.composed.farms.fenceLayer;
    const props = b.composed.decoration.propLayer;
    const topiary = DECOR_TYPES.indexOf("prop.topiary") + 1;
    const sundial = DECOR_TYPES.indexOf("prop.sundial") + 1;
    const loaded = loadWorldArtifact(JSON.parse(JSON.stringify(b.artifact)));
    assert.ok(loaded.ok);
    for (const green of greens) {
      let hedges = 0;
      let openWayIn = 0;
      for (let sy = 0; sy < green.h; sy += 1) {
        for (let sx = 0; sx < green.w; sx += 1) {
          const onFrame = sy === 0 || sy === green.h - 1 || sx === 0 || sx === green.w - 1;
          if (!onFrame) continue;
          const cell = (green.y + sy) * width + green.x + sx;
          if (fences[cell] === HEDGE) {
            hedges += 1;
            // Hedges block in the loader ladder like every fence family.
            assert.equal(loaded.world.walkableAt(green.x + sx, green.y + sy), false, "hedge walks");
            continue;
          }
          // An opening (street, lane, or carved gate): the garden must be
          // enterable through it — the cell just inside stays prop-free.
          const inX = sx === 0 ? sx + 1 : sx === green.w - 1 ? sx - 1 : sx;
          const inY = sy === 0 ? sy + 1 : sy === green.h - 1 ? sy - 1 : sy;
          const inside = (green.y + inY) * width + green.x + inX;
          if (fences[cell] === 0 && b.composed.structureLayer[cell] === 0 && props[inside] === 0) {
            openWayIn += 1;
          }
        }
      }
      assert.ok(hedges > 0, "green has no hedge wall");
      assert.ok(openWayIn > 0, "hedged green has no clear way in");
      // The formal set: four corner topiary, one sundial at the center.
      let corners = 0;
      for (const [sx, sy] of [
        [1, 1],
        [green.w - 2, 1],
        [1, green.h - 2],
        [green.w - 2, green.h - 2],
      ] as const) {
        if (props[(green.y + sy) * width + green.x + sx] === topiary) corners += 1;
      }
      assert.equal(corners, 4, "garden corners missing topiary");
      const center = (green.y + Math.trunc(green.h / 2)) * width + green.x + Math.trunc(green.w / 2);
      assert.equal(props[center], sundial, "garden center missing its sundial");
    }
    // Style-free worlds grow no hedges anywhere.
    const plain = compiled({ ...BASE, settlementStyle: { growthPermille: 600 } });
    const plainFences = generateWorldDetailed(plain.normalized, plain.config).composed.farms.fenceLayer;
    for (const value of plainFences) assert.notEqual(value, HEDGE);
  });

  it("walls the city with gatehouses on through-streets (behavior 62)", () => {
    const walled = compiled({
      ...BASE,
      settlementStyle: { growthPermille: 600, narrowStreets: true, cityWalls: true },
    });
    const b = generateWorldDetailed(walled.normalized, walled.config);
    const { width } = walled.config.world;
    const wallValue = STRUCTURE_TYPES.indexOf("structure.fortress_wall") + 1;
    const city = b.artifact.settlements.find((s) => s.kind === "city");
    assert.ok(city !== undefined, "fixture lost its city");

    // A circuit exists: wall cells stand on the city's chebyshev ring.
    let wallCells = 0;
    let ringR = 0;
    for (let dy = -60; dy <= 60; dy += 1) {
      for (let dx = -60; dx <= 60; dx += 1) {
        const x: number = (city.anchor[0] as number) + dx;
        const y: number = (city.anchor[1] as number) + dy;
        if (x < 0 || y < 0 || x >= width || y >= walled.config.world.height) continue;
        if (b.composed.structureLayer[y * width + x] !== wallValue) continue;
        wallCells += 1;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (ringR === 0) ringR = d;
        assert.equal(d, ringR, `wall cell off the ring at ${x},${y}`);
      }
    }
    assert.ok(wallCells > 0, "cityWalls placed no wall cells");

    // Wall cells never sit on corridors, water, or other structures —
    // and towns never wall (city-only doctrine).
    const world = loadWorldArtifact(b.artifact as unknown);
    assert.ok(world.ok);
    for (const s of b.artifact.settlements.filter((x) => x.kind !== "city")) {
      for (let dy = -30; dy <= 30; dy += 1) {
        for (let dx = -30; dx <= 30; dx += 1) {
          const x = s.anchor[0] + dx;
          const y = s.anchor[1] + dy;
          if (x < 0 || y < 0 || x >= width || y >= walled.config.world.height) continue;
          if (Math.max(Math.abs(x - city.anchor[0]), Math.abs(y - city.anchor[1])) <= ringR) continue;
          assert.notEqual(
            b.composed.structureLayer[y * width + x],
            wallValue,
            `non-city wall cell at ${x},${y}`,
          );
        }
      }
    }

    // Any placed gatehouse keeps its arch column walkable (pass cells
    // [1,4]) and its towers solid.
    for (const gate of city.structures.filter((st) => st.type === "structure.city_gate")) {
      const [gx, gy] = gate.cell;
      assert.ok(world.world.walkableAt(gx + 1, gy), `gate arch blocked at ${gx + 1},${gy}`);
      assert.ok(world.world.walkableAt(gx + 1, gy + 1), `gate arch blocked at ${gx + 1},${gy + 1}`);
    }

    // The behavior-47 laws hold: every destination stays reachable from
    // the first (the compose gate would have thrown; assert directly for
    // the walled world anyway).
    const reach = ((): number => {
      const height = walled.config.world.height;
      const [sx, sy] = b.artifact.destinations[0]!.cell;
      const seen = new Uint8Array(width * height);
      const queue = [sy * width + sx];
      seen[queue[0] as number] = 1;
      while (queue.length > 0) {
        const cell = queue.pop() as number;
        const cx = cell % width;
        const cy = (cell - cx) / width;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (seen[next] === 0 && world.world.walkableAt(nx, ny)) {
            seen[next] = 1;
            queue.push(next);
          }
        }
      }
      return b.artifact.destinations.filter((d) => seen[d.cell[1] * width + d.cell[0]] === 1).length;
    })();
    assert.equal(reach, b.artifact.destinations.length, "a wall severed a destination");

    // Flag off = byte-identical fabric.
    const off = compiled({ ...BASE, settlementStyle: { growthPermille: 600, narrowStreets: true } });
    const plain = generateWorldDetailed(off.normalized, off.config);
    const withOff = compiled({
      ...BASE,
      settlementStyle: { growthPermille: 600, narrowStreets: true, cityWalls: false },
    });
    const offB = generateWorldDetailed(withOff.normalized, withOff.config);
    assert.deepEqual(offB.artifact.settlements, plain.artifact.settlements);
    assert.deepEqual(offB.composed.structureLayer, plain.composed.structureLayer);
  });

  it("no walkable band cell rides rock material anywhere (behavior 71)", () => {
    // The sl-0030 regression, scoped by planning ask sl-0032: b70's
    // snowline city carved 108 CITY_LANE cells at terrace level >= 1
    // because the street-web carvers never graded rock (wilderness trails
    // always did). Grading leaves gravel or an adopted neighbor material
    // under every band cell — and rock material is the cliff relief's only
    // substrate, so band-off-rock IS the "walkable cells stay level 0"
    // invariant, checked without the adapter. Asserted on the real shipped
    // world (seed 2008), covering every band writer at once: wilderness
    // trails, city lanes, house-lane bands, landmark approaches.
    const recipe = JSON.parse(readFileSync("fixtures/recipes/wildshot-overworld.json", "utf8"));
    const validation = validateRecipe(recipe);
    assert.ok(validation.ok);
    const normalized = normalizeRecipe(validation.recipe);
    const config = compileRecipe(normalized);
    const b = generateWorldDetailed(normalized, config);
    const rock = PALETTE_INDEX["terrain.rock"];
    const path = b.composed.routesResult.pathLayer;
    let violations = 0;
    for (let index = 0; index < b.composed.grid.length; index += 1) {
      if (path[index] !== 0 && b.composed.grid[index] === rock) violations += 1;
    }
    assert.equal(violations, 0, `${violations} walkable band cells on ungraded rock`);
  });

  it("country roads ride the band under narrowStreets (behavior 72)", () => {
    // Post-restoration ruling: outside settlement bounds the corridors kept
    // two-three wide packed-road material — the slab look the b56 ruling
    // banished from cities. Now every corridor centerline cell is a band
    // cell (road band, or an existing trail band) or a water crossing, and
    // no packed-road material survives on the centerline at all.
    const recipe = JSON.parse(readFileSync("fixtures/recipes/wildshot-overworld.json", "utf8"));
    const validation = validateRecipe(recipe);
    assert.ok(validation.ok);
    const normalized = normalizeRecipe(validation.recipe);
    const config = compileRecipe(normalized);
    const b = generateWorldDetailed(normalized, config);
    // The compose gate must stay clean: the first cut of this behavior
    // severed both north landmarks by restoring their junction flanks to
    // bare ground — the CLI caught it, this test did not. Now it does.
    assert.deepEqual(b.composed.routesResult.errors, [], "route network severed");
    assert.deepEqual(b.composed.hydro.topologyErrors, [], "hydrology gate");
    const packedRoad = PALETTE_INDEX["terrain.packed_road"];
    const path = b.composed.routesResult.pathLayer;
    let stillRoad = 0;
    let unbandedLand = 0;
    for (const cell of b.composed.routesResult.corridorCenterline) {
      if (b.composed.grid[cell] === packedRoad) stillRoad += 1;
      const isWater =
        b.composed.hydro.waterKind[cell] !== 0 || b.composed.hydro.isRiver[cell] === 1;
      if (!isWater && path[cell] === 0 && b.composed.grid[cell] !== packedRoad) {
        unbandedLand += 1;
      }
    }
    assert.equal(stillRoad, 0, `${stillRoad} centerline cells still packed road`);
    assert.equal(unbandedLand, 0, `${unbandedLand} centerline land cells carry no band`);
  });

  it("posts guards at the city gates: braziers, banner, drill target (behavior 66)", () => {
    // Pinned fixture: small seed-24 — the probe showcase whose walled city
    // seats TWO gatehouses with the full garrison on both. (No tiny seed in
    // 1-40 places a gate at all; gates need real through-streets.)
    const walled = compiled({
      ...BASE,
      seed: 24,
      world: { sizePreset: "small", climatePreset: "temperate" },
      settlementStyle: { growthPermille: 600, narrowStreets: true, cityWalls: true },
    });
    const b = generateWorldDetailed(walled.normalized, walled.config);
    const world = loadWorldArtifact(b.artifact as unknown);
    assert.ok(world.ok);
    const city = b.artifact.settlements.find((s) => s.kind === "city");
    assert.ok(city !== undefined, "fixture lost its city");
    const gates = city.structures.filter((st) => st.type === "structure.city_gate");
    assert.equal(gates.length, 2, "seed-24 fixture lost a gatehouse");

    // Fixed garrison spots, recomputed independently of the implementation:
    // brazier pair on the city side flanking the through-street, one banner
    // on the approach side, an archery target in a tower nook. Seed-24
    // seats every piece on both gates — pinned exactly so any guard or
    // offset drift trips here first.
    let braziers = 0;
    let banners = 0;
    let targets = 0;
    const path = b.composed.routesResult.pathLayer;
    const { width, height } = walled.config.world;
    for (const gate of gates) {
      const [gx, gy] = gate.cell as readonly [number, number];
      const inward = (city.anchor[1] as number) > gy + 1 ? 1 : -1;
      const cityRow = inward === 1 ? gy + 2 : gy - 1;
      const approachRow = inward === 1 ? gy - 1 : gy + 2;
      const nookRow = inward === 1 ? gy + 1 : gy;
      for (const px of [gx, gx + 2]) {
        if (world.world.propAt(px, cityRow) === "prop.brazier") braziers += 1;
        if (world.world.propAt(px, approachRow) === "prop.banner") banners += 1;
      }
      for (const px of [gx - 1, gx + 3]) {
        if (world.world.propAt(px, nookRow) === "prop.archery_target") targets += 1;
      }
      // The garrison never blocks the door: the arch column stays walkable.
      assert.ok(world.world.walkableAt(gx + 1, gy), "gate arch blocked");
      assert.ok(world.world.walkableAt(gx + 1, gy + 1), "gate arch blocked");
      // The b47 outrank, asserted around each gate: no garrison species on
      // any path cell (street band, lane, trail) in the gate neighborhood.
      // Scoped local — a global scan would trip on legal POI furniture
      // (bandit banners may cover a trail END far away, by b47 law).
      for (let y = Math.max(0, gy - 3); y <= Math.min(height - 1, gy + 4); y += 1) {
        for (let x = Math.max(0, gx - 3); x <= Math.min(width - 1, gx + 5); x += 1) {
          if (path[y * width + x] === 0) continue;
          const prop = world.world.propAt(x, y);
          assert.ok(
            prop !== "prop.brazier" && prop !== "prop.banner" && prop !== "prop.archery_target",
            `garrison prop on a path cell at ${x},${y}`,
          );
        }
      }
    }
    assert.equal(braziers, 4, "seed-24 brazier pair drifted");
    assert.equal(banners, 2, "seed-24 banner drifted");
    assert.equal(targets, 2, "seed-24 drill target drifted");
  });

  it("dresses lived-in settlements: yards, market extras, lamped lanes (behavior 61)", () => {
    const urban = compiled({
      ...BASE,
      settlementStyle: { growthPermille: 600, narrowStreets: true, urbanBlocks: true },
    });
    const b = generateWorldDetailed(urban.normalized, urban.config);
    const { width } = urban.config.world;
    const propLayer = b.composed.decoration.propLayer;
    const world = loadWorldArtifact(b.artifact as unknown);
    assert.ok(world.ok);
    const propAt = (x: number, y: number): string | null => world.world.propAt(x, y);

    // Working yards: an anvil stands on a smithy's perimeter, tables on a
    // tavern's — the trade spills outside (when a free cell exists; every
    // fixture settlement rolls both civic specials, so demand > 0).
    const yardHit = (type: string, wanted: readonly string[]): boolean =>
      b.artifact.settlements.some((s) =>
        s.structures.some((st) => {
          if (st.type !== type) return false;
          for (let dy = -1; dy <= st.footprint[1]; dy += 1) {
            for (let dx = -1; dx <= st.footprint[0]; dx += 1) {
              const p = propAt(st.cell[0] + dx, st.cell[1] + dy);
              if (p !== null && wanted.includes(p)) return true;
            }
          }
          return false;
        }),
      );
    assert.ok(yardHit("structure.smithy", ["prop.anvil", "prop.workbench"]), "no smithy yard dressed");
    assert.ok(yardHit("structure.tavern", ["prop.table_chairs", "prop.barrels"]), "no tavern terrace dressed");

    // Market extras sit on the square's frame corners.
    const market = b.composed.quarters.find((q) => q.kind === "market");
    assert.ok(market !== undefined, "no market quarter to dress");
    let extras = 0;
    for (let sy = 0; sy < market.h; sy += 1) {
      for (let sx = 0; sx < market.w; sx += 1) {
        const p = propAt(market.x + sx, market.y + sy);
        if (p === "prop.noticeboard" || p === "prop.bench" || p === "prop.baskets") extras += 1;
      }
    }
    assert.ok(extras > 0, "market square has no civic extras");

    // Street lamps: at least one lamp seats BESIDE a street band cell
    // (never on any band), proving the lane pass ran — tavern lamps do not
    // count because this one must touch a band cell (trail-class since
    // behavior 74; the through-route stays road-class).
    const pathLayer = b.composed.routesResult.pathLayer;
    let laneLamps = 0;
    for (let index = 0; index < propLayer.length; index += 1) {
      const x = index % width;
      const y = (index - x) / width;
      if (propAt(x, y) !== "prop.lamp") continue;
      assert.equal(pathLayer[index], 0, `lamp ON a band at ${x},${y}`);
      const besideLane =
        (x > 0 && pathLayer[index - 1] !== 0) ||
        (pathLayer[index + 1] !== 0) ||
        (index - width >= 0 && pathLayer[index - width] !== 0) ||
        (index + width < propLayer.length && pathLayer[index + width] !== 0);
      if (besideLane) laneLamps += 1;
    }
    assert.ok(laneLamps > 0, "no street lamps beside settlement streets");
  });

  it("settlement streets wear the street band and no band steps diagonally (behavior 75)", () => {
    // The sl-0053 re-judge on the e2699cc re-pin: the surfaces CONNECTING
    // HOUSES draw as the STREET band (value 3, the package's 10px sett
    // band); the necked through-route keeps the road band (2), wilderness
    // trails keep dirtpath (1). Law asserted on a styled fixture: street
    // cells exist, every road-class cell within a settlement radius lies
    // on the corridor centerline, no street cells leak outside settlement
    // reach, and NO same-class band pair touches only diagonally (the
    // "80" verdict — the L-step pass owns every writer's output).
    const styled = compiled({
      ...BASE,
      settlementStyle: { growthPermille: 600, narrowStreets: true },
    });
    const b = generateWorldDetailed(styled.normalized, styled.config);
    const { width, height } = styled.config.world;
    const pathLayer = b.composed.routesResult.pathLayer;
    const centerline = b.composed.routesResult.corridorCenterline;
    let streetCells = 0;
    let slabLanes = 0;
    for (const plan of b.composed.settlementPlans) {
      const r = plan.radius;
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const x = plan.anchorX + dx;
          const y = plan.anchorY + dy;
          if (x < 0 || y < 0 || x >= width || y >= width) continue;
          const cell = y * width + x;
          if (pathLayer[cell] === 3) streetCells += 1;
          if (pathLayer[cell] === 2 && !centerline.has(cell)) slabLanes += 1;
        }
      }
    }
    assert.ok(streetCells > 0, "styled settlements carved no street-band cells");
    assert.equal(slabLanes, 0, `${slabLanes} road-class lane cells off the corridor centerline`);

    let diagonalPairs = 0;
    for (let y = 0; y < height - 1; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cls = pathLayer[y * width + x];
        if (cls === 0) continue;
        for (const dx of [-1, 1]) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          if (pathLayer[(y + 1) * width + nx] !== cls) continue;
          if (pathLayer[y * width + nx] === cls || pathLayer[(y + 1) * width + x] === cls) continue;
          diagonalPairs += 1;
        }
      }
    }
    assert.equal(diagonalPairs, 0, `${diagonalPairs} same-class diagonal band pairs survived the L-step pass`);
  });

  it("necks through-roads to the centerline inside settlement bounds", () => {
    const COBBLE_INDEX = PALETTE_INDEX["terrain.cobble"] as number;
    const PACKED_INDEX = PALETTE_INDEX["terrain.packed_road"] as number;
    // organicStreets stays OFF: worn lanes also paint packed earth and
    // would muddy the flank assertions below.
    const narrow = compiled({
      ...BASE,
      settlementStyle: { growthPermille: 600, narrowStreets: true },
    });
    const b = generateWorldDetailed(narrow.normalized, narrow.config);
    const { width, height } = narrow.config.world;
    const grid = b.composed.grid;
    const routesResult = b.composed.routesResult;
    const insideBounds = (cell: number): boolean => {
      const x = cell % width;
      const y = (cell - x) / width;
      return b.artifact.settlements.some((s) => {
        const d = Math.max(Math.abs(x - s.anchor[0]), Math.abs(y - s.anchor[1]));
        return d > 5 && d <= s.radius - 1;
      });
    };

    // Every route flank inside settlement bounds gave its ground back: none
    // may remain packed road (the settlement may deliberately repaint some
    // as cobble plaza fabric, never as bare road), and at least some must
    // now be plain ground again.
    let reverted = 0;
    for (const [cell] of routesResult.corridorFlankPrev) {
      if (!insideBounds(cell)) continue;
      assert.notEqual(grid[cell], PACKED_INDEX, `flank ${cell % width},${Math.trunc(cell / width)} still packed road`);
      if (grid[cell] !== COBBLE_INDEX) reverted += 1;
    }
    assert.ok(reverted > 0, "no route flank inside settlement bounds was reverted");

    // And the through-road itself draws as the one-tile band over restored
    // ground somewhere in the bounds (behavior 56 line roads).
    let bandLine = 0;
    for (const cell of routesResult.corridorCenterline) {
      if (!insideBounds(cell)) continue;
      if (
        routesResult.pathLayer[cell] !== 0 &&
        grid[cell] !== PACKED_INDEX &&
        grid[cell] !== COBBLE_INDEX
      ) {
        bandLine += 1;
      }
    }
    assert.ok(bandLine > 0, "no band-line through-road segment inside settlement bounds");
  });

  it("keeps fill-building yards unpaved so lanes read as lanes", () => {
    const COBBLE_INDEX = PALETTE_INDEX["terrain.cobble"] as number;
    const narrow = compiled({
      ...BASE,
      settlementStyle: { growthPermille: 600, narrowStreets: true },
    });
    const b = generateWorldDetailed(narrow.normalized, narrow.config);
    const { width } = narrow.config.world;
    const grid = b.composed.grid;
    const paddedCells = (st: { cell: readonly [number, number]; footprint: readonly [number, number] }): number => {
      let cobbled = 0;
      for (let sy = 0; sy < st.footprint[1]; sy += 1) {
        for (let sx = 0; sx < st.footprint[0]; sx += 1) {
          if (grid[(st.cell[1] + sy) * width + st.cell[0] + sx] === COBBLE_INDEX) cobbled += 1;
        }
      }
      return cobbled;
    };
    let total = 0;
    let unpaved = 0;
    let fullyPaved = 0;
    for (const settlement of b.artifact.settlements) {
      for (const structure of settlement.structures) {
        // Fountains and wells live ON the plaza's paving by design.
        if (structure.type === "structure.fountain" || structure.type === "structure.well") continue;
        total += 1;
        const cobbled = paddedCells(structure);
        if (cobbled === 0) unpaved += 1;
        if (cobbled === structure.footprint[0] * structure.footprint[1]) fullyPaved += 1;
      }
    }
    // No pad painting means pads keep pre-stamp ground. A building may
    // still legally SEAT on existing street or plaza paving (the tavern
    // fronting the arm does), so "fully paved" never quite reaches zero —
    // but it must be the rare squatter, not the slab it used to be, and
    // most buildings must stand on plain ground.
    assert.ok(unpaved * 2 > total, `only ${unpaved}/${total} buildings on natural ground`);
    assert.ok(fullyPaved * 10 < total, `${fullyPaved}/${total} buildings on full pads — the slab is back`);
  });
});

describe("settlement variety (behavior 49)", () => {
  const rulesFor = (variety: boolean, growth = 0) => ({
    ...compiled({
      ...BASE,
      ...(variety || growth > 0
        ? { settlementStyle: { variety, growthPermille: growth } }
        : {}),
    }).config.settlements,
  });
  const roller = channel(11, "settlements.variety");

  it("city and town packs flavor the specials by purpose", () => {
    const harborCity = buildStructureSequence("city", "harbor", rulesFor(true), 0, roller, 10, 10);
    for (const type of ["structure.warehouse", "structure.fisher_hut", "structure.store"]) {
      assert.ok(harborCity.sequence.includes(type as never), `harbor city carries ${type}`);
    }
    const miningTown = buildStructureSequence("town", "mining", rulesFor(true), 0, roller, 10, 10);
    assert.ok(miningTown.sequence.includes("structure.quarry" as never));
    const farmingOutpost = buildStructureSequence("outpost", "farming", rulesFor(true), 0, roller, 10, 10);
    assert.ok(farmingOutpost.sequence.includes("structure.windmill" as never));
    const waypointOutpost = buildStructureSequence("outpost", "waypoint", rulesFor(true), 0, roller, 10, 10);
    assert.ok(waypointOutpost.sequence.includes("structure.tent" as never));
  });

  it("variety off reproduces the v11 sequences exactly", () => {
    const sequence = buildStructureSequence("city", "harbor", rulesFor(false), 0, roller, 10, 10).sequence;
    for (const type of sequence) {
      assert.ok(
        !["structure.warehouse", "structure.fisher_hut", "structure.store", "structure.guardhouse",
          "structure.windmill", "structure.watermill", "structure.sawmill", "structure.quarry",
          "structure.tent"].includes(type),
        `pre-49 sequence must not carry ${type}`,
      );
    }
  });

  it("lots grow with the growth bonus", () => {
    const rules = rulesFor(false, 0);
    const base = buildStructureSequence("city", "waypoint", rules, 0, roller, 10, 10);
    const grown = buildStructureSequence("city", "waypoint", rules, 500, roller, 10, 10);
    assert.equal(base.sequence.length, rules.cityLots);
    assert.equal(grown.sequence.length, rules.cityLots + Math.trunc((rules.cityLots * 2 * 500) / 1000));
  });

  it("harbor docks seat on the waterline under variety (behavior 60)", () => {
    const { normalized, config } = compiled({
      recipeFormat: 1,
      seed: 2,
      world: { sizePreset: "tiny", climatePreset: "temperate" },
      budgets: { settlementCount: 3, primaryRouteCount: 1, landmarkCount: 0 },
      settlementStyle: { variety: true },
    });
    const result = generateWorldDetailed(normalized, config);
    const docks = result.artifact.settlements.flatMap((s) =>
      s.structures.filter((st) => st.type === "structure.dock"),
    );
    assert.ok(docks.length > 0, "no docks placed on the dock fixture seed");
    const loaded = loadWorldArtifact(JSON.parse(JSON.stringify(result.artifact)));
    assert.ok(loaded.ok);
    const world = loaded.world;
    for (const dock of docks) {
      const [ox, oy] = dock.cell;
      // Deck row floats on the shallows; shore row on land.
      for (let sx = 0; sx < 3; sx += 1) {
        assert.equal(
          result.composed.hydro.waterKind[oy * config.world.width + ox + sx] !== 0,
          true,
          `deck cell ${ox + sx},${oy} is not water`,
        );
      }
      // The deck walks; the top-right post blocks (package pass cells).
      assert.equal(world.walkableAt(ox, oy), true, "deck 0 blocked");
      assert.equal(world.walkableAt(ox + 1, oy), true, "deck 1 blocked");
      assert.equal(world.walkableAt(ox + 2, oy), false, "post walks");
      assert.equal(world.walkableAt(ox, oy + 1), true, "shore deck 3 blocked");
      assert.equal(world.walkableAt(ox + 1, oy + 1), true, "shore deck 4 blocked");
      assert.equal(world.walkableAt(ox + 2, oy + 1), true, "shore deck 5 blocked");
      // Doorstep on walkable land below the entrance.
      assert.equal(world.walkableAt(dock.entrance[0], dock.entrance[1]), true, "doorstep blocked");
    }
  });

  it("harbor row dresses docks and city piers build in stone (behavior 63)", () => {
    const { normalized, config } = compiled({
      recipeFormat: 1,
      seed: 2,
      world: { sizePreset: "tiny", climatePreset: "temperate" },
      budgets: { settlementCount: 3, primaryRouteCount: 1, landmarkCount: 0 },
      settlementStyle: { variety: true },
    });
    const result = generateWorldDetailed(normalized, config);
    const { width } = config.world;
    const docks = result.artifact.settlements.flatMap((s) =>
      s.structures.filter((st) => st.type === "structure.dock"),
    );
    assert.ok(docks.length > 0, "no docks on the fixture seed");
    const props = result.composed.decoration.propLayer;
    const boat = DECOR_TYPES.indexOf("prop.fishingboat") + 1;
    const bollard = DECOR_TYPES.indexOf("prop.bollard") + 1;
    const crates = DECOR_TYPES.indexOf("prop.crates") + 1;
    const fishnets = DECOR_TYPES.indexOf("prop.fishnets") + 1;
    const loaded = loadWorldArtifact(JSON.parse(JSON.stringify(result.artifact)));
    assert.ok(loaded.ok);
    const world = loaded.world;
    const touchesDock = (x: number, y: number): boolean =>
      docks.some(
        (d) =>
          x >= d.cell[0] - 1 && x <= d.cell[0] + 3 &&
          y >= d.cell[1] - 1 && y <= d.cell[1] + 2,
      );
    let boats = 0;
    let posts = 0;
    let shoreClutter = 0;
    for (let y = 0; y < config.world.height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = props[y * width + x];
        if (value === boat) {
          boats += 1;
          // Moored on open water against the boathouse, never on land.
          assert.notEqual(result.composed.hydro.waterKind[y * width + x], 0, "boat on land");
          assert.ok(touchesDock(x, y), "boat adrift from every dock");
          assert.equal(world.walkableAt(x, y), false, "boat cell walks");
        } else if (value === bollard) {
          posts += 1;
          assert.equal(result.composed.hydro.waterKind[y * width + x], 0, "bollard in water");
          assert.ok(touchesDock(x, y), "bollard away from every dock");
          assert.equal(world.walkableAt(x, y), false, "bollard cell walks");
        } else if ((value === crates || value === fishnets) && touchesDock(x, y)) {
          shoreClutter += 1;
        }
      }
    }
    assert.ok(boats > 0, "no fishingboat moored");
    assert.ok(posts > 0, "no bollards seated");
    assert.ok(shoreClutter > 0, "no crates or fishnets on the shore row");
    // City harbors lay stone jetties; the town keeps its wooden pier. The
    // fixture has one of each, so both PIER_TYPES values must be present.
    assert.deepEqual([...PIER_TYPES], ["pier.pier", "pier.jetty"]);
    const pierValues = new Set<number>();
    const piers = result.composed.farms.pierLayer;
    for (let index = 0; index < piers.length; index += 1) {
      if (piers[index] !== 0) pierValues.add(piers[index] as number);
    }
    assert.deepEqual([...pierValues].sort(), [1, 2], "expected wood and jetty piers");
    const cityHarbor = result.artifact.settlements.find((s) => s.kind === "city" && s.purpose === "harbor");
    assert.ok(cityHarbor !== undefined, "fixture lost its city harbor");
    for (let index = 0; index < piers.length; index += 1) {
      if (piers[index] !== 2) continue;
      const px = index % width;
      const py = (index - px) / width;
      const toCity = Math.abs(px - cityHarbor.anchor[0]) + Math.abs(py - cityHarbor.anchor[1]);
      for (const other of result.artifact.settlements) {
        if (other.id === cityHarbor.id || other.purpose !== "harbor") continue;
        const toOther = Math.abs(px - other.anchor[0]) + Math.abs(py - other.anchor[1]);
        assert.ok(toCity < toOther, `jetty cell ${px},${py} nearer a lesser harbor`);
      }
    }
  });

  it("every rostered structure with a footprint resolves in the pinned package", () => {
    const { manifest } = loadPinnedManifest();
    for (const type of STRUCTURE_TYPES) {
      const footprint = STRUCTURE_FOOTPRINTS[type];
      if (footprint === undefined) continue;
      const name = STRUCTURE_NAME[type];
      assert.ok(name !== undefined, `${type} has no package name`);
      const entry = manifest.structureByName.get(name as string);
      assert.ok(entry !== undefined, `${type} -> ${name} missing from the pinned package`);
      assert.deepEqual([entry.def.w, entry.def.h], footprint, `${type} footprint drifted from the package`);
    }
  });
});
