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
