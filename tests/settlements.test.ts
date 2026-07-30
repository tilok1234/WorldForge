import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { composeWorld } from "../src/generation/composeWorld.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { validateArtifact } from "../src/validation/validateArtifact.js";
import { PALETTE_INDEX, WORLD_PALETTE } from "../src/regions/biomes.js";
import { WATER_NONE } from "../src/hydrology/hydrology.js";
import { planFarmsAndPiers } from "../src/settlements/farms.js";

function worldFor(seed: number, landmarks?: unknown) {
  const validation = validateRecipe({
    recipeFormat: 1,
    seed,
    world: { sizePreset: "tiny", climatePreset: "temperate" },
    budgets: { settlementCount: 3, landmarkCount: 1, primaryRouteCount: 1 },
    ...(landmarks === undefined ? {} : { landmarks }),
  });
  assert.ok(validation.ok, JSON.stringify(validation));
  const normalized = normalizeRecipe(validation.recipe);
  const config = compileRecipe(normalized);
  return { normalized, config, composed: composeWorld(config) };
}

describe("settlement planning", () => {
  it("plans a city, towns, then outposts with geography-derived purposes (seeds 1-4)", () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      const { composed, config } = worldFor(seed);
      assert.deepEqual(composed.routesResult.errors, [], `seed ${seed}`);
      const plans = composed.settlementPlans;
      assert.ok(plans.length >= 1, `seed ${seed} produced settlements`);
      const townCount = config.settlements.townCount;
      for (const plan of plans) {
        const expected = plan.id === 0 ? "city" : plan.id <= townCount ? "town" : "outpost";
        assert.equal(plan.kind, expected, `seed ${seed} settlement ${plan.id}`);
      }
      for (const plan of plans) {
        assert.ok(
          ["harbor", "crossing", "farming", "mining", "waypoint"].includes(plan.purpose),
          `purpose ${plan.purpose}`,
        );
        assert.ok(plan.structures.length >= 1, `settlement ${plan.id} has structures`);
      }
    }
  });

  it("keeps structure footprints atomic, land-only, and non-overlapping", () => {
    const { composed } = worldFor(2);
    const { width } = composed;
    const claimed = new Set<number>();
    const allPlans = [
      ...composed.settlementPlans.flatMap((plan) =>
        plan.structures.map((s) => ({ x: s.x, y: s.y, w: s.width, h: s.height })),
      ),
      ...composed.landmarkPlans.map((plan) => ({ x: plan.x, y: plan.y, w: plan.width, h: plan.height })),
    ];
    for (const rect of allPlans) {
      for (let sy = 0; sy < rect.h; sy += 1) {
        for (let sx = 0; sx < rect.w; sx += 1) {
          const cell = (rect.y + sy) * width + rect.x + sx;
          assert.ok(!claimed.has(cell), `overlap at cell ${cell}`);
          claimed.add(cell);
          assert.equal(composed.hydro.waterKind[cell], WATER_NONE, "structures stay on land");
        }
      }
    }
    // Settlement footprints paint the layer fully; landmark rects reserve
    // their full extent in records while only walls/gate paint the layer.
    let layerCells = 0;
    for (const value of composed.structureLayer) {
      if (value !== 0) layerCells += 1;
    }
    const settlementCells = composed.settlementPlans.reduce(
      (sum, plan) => sum + plan.structures.reduce((s, r) => s + r.width * r.height, 0),
      0,
    );
    assert.ok(layerCells >= settlementCells && layerCells <= claimed.size);
  });

  it("reaches every structure entrance from the town (exit criterion)", () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      const { composed } = worldFor(seed);
      const entranceErrors = composed.routesResult.errors.filter((error) => error.includes("unreachable"));
      assert.deepEqual(entranceErrors, [], `seed ${seed}`);
    }
  });

  it("gives towns a varied lot mix and a legible plaza (W5.1)", () => {
    let sawFountain = false;
    let sawFarmingKit = false;
    for (let seed = 1; seed <= 6; seed += 1) {
      const { composed } = worldFor(seed);
      const town = composed.settlementPlans[0];
      if (town === undefined) continue;
      const types = new Set(town.structures.map((s) => s.type));
      assert.ok(
        types.size >= 4,
        `seed ${seed}: town mixes structure types (${[...types].join(", ")})`,
      );
      if (types.has("structure.fountain")) {
        sawFountain = true;
        const fountain = town.structures.find((s) => s.type === "structure.fountain")!;
        // The fountain sits on the plaza: every footprint cell is cobble-backed
        // structure layer, its entrance is street-reachable (validated by the
        // entrance gate), and it centers on the anchor.
        assert.ok(
          Math.abs(fountain.x + 1 - town.anchorX) <= 1 && Math.abs(fountain.y + 1 - town.anchorY) <= 1,
          `seed ${seed}: fountain centers the plaza`,
        );
      }
      for (const plan of composed.settlementPlans.slice(1)) {
        if (plan.purpose === "farming") {
          const outpostTypes = new Set(plan.structures.map((s) => s.type));
          if (outpostTypes.has("structure.farmhouse")) sawFarmingKit = true;
        }
      }
    }
    assert.ok(sawFountain, "at least one town centers a fountain");
    void sawFarmingKit; // informative only: farming outposts are seed-dependent
  });

  it("resolves identically across repeated composition (order independence)", () => {
    const first = worldFor(3).composed;
    const second = worldFor(3).composed;
    assert.deepEqual(first.settlementPlans, second.settlementPlans);
    assert.deepEqual(first.landmarkPlans, second.landmarkPlans);
  });
});

describe("landmark stamps and blending", () => {
  it("stamps the fortress with walls, gate, and a blended (non-rectangular) edge", () => {
    let sawFortress = false;
    for (let seed = 1; seed <= 6 && !sawFortress; seed += 1) {
      const { composed } = worldFor(seed);
      if (composed.landmarkPlans.length === 0) {
        continue;
      }
      sawFortress = true;
      const plan = composed.landmarkPlans[0]!;
      const { width } = composed;
      const gate = composed.structureLayer[plan.entranceY * width + plan.entranceX];
      assert.equal(gate, 1, "gate cell carries structure.fortress_gate");

      // Blend ring: the one-cell border outside the footprint must not be a
      // uniform material (no unexplained hard rectangle).
      const ringMaterials = new Set<number>();
      for (let sx = -1; sx <= plan.width; sx += 1) {
        for (const sy of [-1, plan.height]) {
          const x = plan.x + sx;
          const y = plan.y + sy;
          if (x >= 0 && y >= 0 && x < width && y < composed.height) {
            ringMaterials.add(composed.grid[y * width + x] as number);
          }
        }
      }
      assert.ok(ringMaterials.size >= 2, "blend ring mixes materials");
      const gravel = PALETTE_INDEX["terrain.gravel"];
      const nearby = new Set<number>();
      for (let sy = -3; sy < plan.height + 3; sy += 1) {
        for (let sx = -3; sx < plan.width + 3; sx += 1) {
          const x = plan.x + sx;
          const y = plan.y + sy;
          if (x >= 0 && y >= 0 && x < width && y < composed.height) {
            nearby.add(composed.grid[y * width + x] as number);
          }
        }
      }
      assert.ok(nearby.has(gravel), "blend scatter reaches the surroundings");
    }
    assert.ok(sawFortress, "at least one seed places the fortress");
  });
});

describe("relational vocabulary", () => {
  it("rejects malformed landmark requests", () => {
    assert.equal(
      validateRecipe({
        recipeFormat: 1,
        seed: 1,
        world: { sizePreset: "tiny", climatePreset: "temperate" },
        landmarks: [{ type: "flying_castle" }],
      }).ok,
      false,
    );
    assert.equal(
      validateRecipe({
        recipeFormat: 1,
        seed: 1,
        world: { sizePreset: "tiny", climatePreset: "temperate" },
        budgets: { landmarkCount: 1 },
        landmarks: [
          { type: "ancient_fortress" },
          { type: "ancient_fortress" },
        ],
      }).ok,
      false,
      "requests beyond the landmark budget fail",
    );
  });

  it("honors near_town and reports unsatisfiable constraints honestly", () => {
    let satisfied = 0;
    let named = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const { composed, config } = worldFor(seed, [{ type: "ancient_fortress", relation: "near_town" }]);
      const town = composed.settlementPlans[0];
      if (composed.landmarkPlans.length === 1 && town !== undefined) {
        const plan = composed.landmarkPlans[0]!;
        const distance = Math.max(
          Math.abs(plan.x + Math.trunc(plan.width / 2) - town.anchorX),
          Math.abs(plan.y + Math.trunc(plan.height / 2) - town.anchorY),
        );
        // near_town measures from the city's outskirts since behavior 18.
        const cityReach = config.settlements.cityPlazaRadius + config.settlements.cityStreetArmLength;
        assert.ok(
          distance <= Math.trunc(composed.width / 5) + cityReach + 5,
          `seed ${seed}: near_town distance ${distance}`,
        );
        satisfied += 1;
      } else {
        assert.ok(
          composed.routesResult.errors.some((error) => error.includes("near_town") || error.includes("landmark")),
          `seed ${seed}: failure must be named`,
        );
        named += 1;
      }
    }
    assert.ok(satisfied + named === 6 && satisfied > 0, "solver both satisfies and honestly fails");
  });

  it("artifact format 8 carries settlements, landmarks, and the structure layer", () => {
    const { normalized, config } = worldFor(1);
    const result = generateWorldDetailed(normalized, config);
    assert.equal(result.artifact.formatVersion, 8);
    assert.deepEqual(result.artifact.semanticPalette, [...WORLD_PALETTE]);
    const report = validateArtifact(result.artifact, { minRegionCells: config.biomes.minRegionCells });
    assert.equal(report.status, "pass", report.errors.join("; "));
    assert.ok(result.artifact.settlements.length >= 1);
    let structureCells = 0;
    for (const chunk of result.artifact.chunks) {
      for (const row of chunk.layers.structure) {
        for (const cell of row) {
          if (cell !== 0) structureCells += 1;
        }
      }
    }
    assert.ok(structureCells > 0, "structure layer present in chunks");
  });

  it("chicken runs pen every farm and vineyards need the sun (behavior 64)", () => {
    // Synthetic all-grass plain: planFarmsAndPiers is pure, so a fake
    // farming plan exercises the pen and the grapes gate without hunting
    // for a tiny seed that rolls an inland farm.
    const compiledFor = (warm: boolean) => {
      const validation = validateRecipe({
        recipeFormat: 1,
        seed: 1,
        world: { sizePreset: "tiny", climatePreset: "temperate" },
        budgets: { settlementCount: 1, primaryRouteCount: 1, landmarkCount: 0 },
        ...(warm ? { biases: { temperaturePermille: 40 } } : {}),
      });
      assert.ok(validation.ok);
      return compileRecipe(normalizeRecipe(validation.recipe));
    };
    const planOn = (config: ReturnType<typeof compileRecipe>) => {
      const { width, height } = config.world;
      const cells = width * height;
      const grid = new Array(cells).fill(PALETTE_INDEX["terrain.grass"]);
      const hydro = {
        waterKind: new Uint8Array(cells),
        isRiver: new Uint8Array(cells),
      } as unknown as Parameters<typeof planFarmsAndPiers>[2];
      const cx = Math.trunc(width / 2);
      const cy = Math.trunc(height / 2);
      const plan = {
        id: 0,
        kind: "town",
        anchorX: cx,
        anchorY: cy,
        purpose: "farming",
        radius: 10,
        structures: [
          { type: "structure.farmhouse", x: cx, y: cy, width: 2, height: 2, entranceX: cx, entranceY: cy + 2 },
        ],
      } as unknown as Parameters<typeof planFarmsAndPiers>[4][number];
      return planFarmsAndPiers(grid, new Uint8Array(cells), hydro, new Uint8Array(cells), [plan], config, []);
    };

    const warm = planOn(compiledFor(true));
    const cold = planOn(compiledFor(false));
    const cropsOf = (result: typeof warm) => {
      const kinds = new Set<number>();
      for (const value of result.cropLayer) if (value !== 0) kinds.add(value >> 4);
      return kinds;
    };
    const fencesOf = (result: typeof warm) => {
      const kinds = new Set<number>();
      for (const value of result.fenceLayer) if (value !== 0) kinds.add(value);
      return kinds;
    };

    // Seed 1 rolls a vineyard when warm: grapes plot + plain wood ring.
    // (The b67 orchard also rings in wood, but this laneless synthetic
    // fails its access guarantee, so wood stays vineyard-exclusive here.)
    assert.ok(cropsOf(warm).has(4), "warm world rolled no grapes");
    assert.ok(fencesOf(warm).has(3), "vineyard did not ring in fence.wood");
    // The same seed without the warm bias must keep the pre-64 pool.
    assert.ok(!cropsOf(cold).has(4), "cold world rolled grapes");
    assert.ok(!fencesOf(cold).has(3), "cold world placed wood fencing");

    // The chicken run is climate-free: one pen either way, its coop and
    // trough inside a pen-fence ring with a gate.
    for (const result of [warm, cold]) {
      assert.equal(result.pens.length, 1, "expected one pen per farming settlement");
      const pen = result.pens[0] as (typeof result.pens)[number];
      const { width } = compiledFor(true).world;
      for (const [px, py] of [pen.coop, pen.trough]) {
        const cell = py * width + px;
        assert.equal(result.fenceLayer[cell], 0, "furniture on the fence ring");
        assert.equal(result.cropLayer[cell], 0, "furniture on crops");
      }
      let ringFence = 0;
      for (let dy = -3; dy <= 3; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const cell = (pen.coop[1] + dy) * width + pen.coop[0] + dx;
          if (result.fenceLayer[cell] === 1) ringFence += 1;
        }
      }
      assert.ok(ringFence >= 10, `pen ring too sparse (${ringFence} fence cells)`);
    }
  });

  it("orchards stand beside every roomy farm (behavior 67)", () => {
    // Same synthetic-plain harness as the b64 pen test: planFarmsAndPiers
    // is pure, so a fake farming plan exercises the orchard directly.
    const validation = validateRecipe({
      recipeFormat: 1,
      seed: 1,
      world: { sizePreset: "tiny", climatePreset: "temperate" },
      budgets: { settlementCount: 1, primaryRouteCount: 1, landmarkCount: 0 },
    });
    assert.ok(validation.ok);
    const config = compileRecipe(normalizeRecipe(validation.recipe));
    const { width, height } = config.world;
    const cells = width * height;
    const hydro = {
      waterKind: new Uint8Array(cells),
      isRiver: new Uint8Array(cells),
    } as unknown as Parameters<typeof planFarmsAndPiers>[2];
    const cx = Math.trunc(width / 2);
    const cy = Math.trunc(height / 2);
    const farmPlan = {
      id: 0,
      kind: "town",
      anchorX: cx,
      anchorY: cy,
      purpose: "farming",
      radius: 10,
      structures: [
        { type: "structure.farmhouse", x: cx, y: cy, width: 2, height: 2, entranceX: cx, entranceY: cy + 2 },
      ],
    } as unknown as Parameters<typeof planFarmsAndPiers>[4][number];

    // Roomy plain WITH a lane: the orchard needs its access guarantee —
    // paint a path line south of the farm for the gate apron to touch.
    const grid = new Array(cells).fill(PALETTE_INDEX["terrain.grass"]);
    const pathLayer = new Uint8Array(cells);
    for (let x = cx - 30; x <= cx + 30; x += 1) pathLayer[(cy + 8) * width + x] = 1;
    const roomy = planFarmsAndPiers(grid, new Uint8Array(cells), hydro, pathLayer, [farmPlan], config, []);
    assert.equal(roomy.orchards.length, 1, "roomy laned farm lost its orchard");
    const orchard = roomy.orchards[0] as (typeof roomy.orchards)[number];
    assert.equal(orchard.trees.length, 6, "orchard tree count drifted");
    for (const [ax, ay] of orchard.trees) {
      for (const [bx, by] of orchard.trees) {
        if (ax === bx && ay === by) continue;
        assert.ok(Math.abs(ax - bx) + Math.abs(ay - by) >= 2, "orchard trees touching");
      }
    }
    // The ring is the plain wood family with exactly the two-cell gate:
    // 28 boundary cells of the 9x7 envelope minus the 2 gate cells. The
    // temperate fixture rolls no vineyard (cold pool), so every wood
    // fence cell on the map is the orchard's.
    const WOOD = 3;
    let woodCells = 0;
    for (const value of roomy.fenceLayer) if (value === WOOD) woodCells += 1;
    assert.equal(woodCells, 26, "orchard ring drifted");
    // Furniture sits on clear interior ground, never on fence or crops.
    for (const [px, py] of [orchard.beehive, orchard.baskets, ...orchard.trees]) {
      const cell = py * width + px;
      assert.equal(roomy.fenceLayer[cell], 0, "orchard piece on the fence ring");
      assert.equal(roomy.cropLayer[cell], 0, "orchard piece on crops");
    }
    // The access guarantee holds: some apron cell touches the lane
    // (chebyshev <= 1) and no apron cell is fenced or cropped.
    let touches = false;
    for (const sx of [2, 3, 4]) {
      const ax = (orchard.origin[0] as number) + sx;
      const cell = orchard.gateApronY * width + ax;
      assert.equal(roomy.fenceLayer[cell], 0, "fenced apron");
      assert.equal(roomy.cropLayer[cell], 0, "cropped apron");
      for (let ny = orchard.gateApronY - 1; ny <= orchard.gateApronY + 1; ny += 1) {
        for (let nx = ax - 1; nx <= ax + 1; nx += 1) {
          if (pathLayer[ny * width + nx] !== 0) touches = true;
        }
      }
    }
    assert.ok(touches, "orchard apron does not touch the lane network");

    // Laneless plain: the access guarantee refuses every candidate — no
    // orchard, nothing half-stamped (the dust-sea sealed-stand lesson).
    const laneless = planFarmsAndPiers(grid, new Uint8Array(cells), hydro, new Uint8Array(cells), [farmPlan], config, []);
    assert.equal(laneless.orchards.length, 0, "laneless farm must go without an orchard");
    let strayWood = 0;
    for (const value of laneless.fenceLayer) if (value === WOOD) strayWood += 1;
    assert.equal(strayWood, 0, "laneless farm has half-stamped orchard fencing");
  });
});
