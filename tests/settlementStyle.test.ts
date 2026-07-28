import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { validateRecipe } from "../src/recipe/validate.js";
import { normalizeRecipe, recipeIdentity } from "../src/recipe/normalize.js";
import { compileRecipe } from "../src/recipe/compile.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { buildStructureSequence } from "../src/settlements/settlements.js";
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
