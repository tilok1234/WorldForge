import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DECOR_TYPES, PROP_WALKABILITY } from "../src/decoration/decorate.js";
import { PROP_NAME } from "../src/adapters/tileforge/resolve.js";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { loadWorldArtifact } from "../src/consumers/typescript/loader.js";

// Compiled tests run from dist/tests/; the repo root sits two levels up.
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * The behavior-77 walk-over conversions (planning sl-0063, designer-ruled):
 * pile/debris silhouettes that walk despite the package's walkable:false.
 * This literal IS the recorded ruling — extending it is a new ruling, not a
 * refactor.
 */
const CARPET_CONVERSIONS = ["prop.stump", "prop.fallen_log", "prop.bone_pile", "prop.loot_pile"];

interface RawPropTile {
  id: string;
  variant: number;
  walkable?: boolean;
}

/** Per-species package truth from the PINNED manifest's raw tile data. */
function packagePropTruth(): Map<string, { groundWalkable: boolean; hasOver: boolean }> {
  const lock = JSON.parse(readFileSync(join(ROOT, "tileforge.lock.json"), "utf8")) as {
    packagePath: string;
  };
  const manifest = JSON.parse(
    readFileSync(join(ROOT, ...lock.packagePath.split("/"), "tileforge-manifest.json"), "utf8"),
  ) as {
    families: Record<string, { walkable?: boolean; tiles: RawPropTile[] }>;
  };
  const family = manifest.families["prop"];
  assert.ok(family !== undefined, "pinned manifest has a prop family");
  const familyDefault = family.walkable ?? true;
  const truth = new Map<string, { groundWalkable: boolean; hasOver: boolean }>();
  for (const tile of family.tiles) {
    const core = tile.id.split(".")[1] as string;
    const isOver = core.endsWith("_over");
    const name = isOver
      ? core.slice(0, -"_over".length)
      : core.endsWith("_ground")
        ? core.slice(0, -"_ground".length)
        : core;
    const entry = truth.get(name) ?? { groundWalkable: familyDefault, hasOver: false };
    if (isOver) {
      entry.hasOver = true;
    } else if (tile.variant === 0) {
      entry.groundWalkable = tile.walkable ?? familyDefault;
    }
    truth.set(name, entry);
  }
  return truth;
}

describe("prop walkability classes (behavior 77, sl-0063)", () => {
  it("classifies every species exactly once", () => {
    const keys = Object.keys(PROP_WALKABILITY);
    assert.equal(keys.length, DECOR_TYPES.length);
    for (const key of DECOR_TYPES) {
      const cls = PROP_WALKABILITY[key];
      assert.ok(
        cls === "carpet" || cls === "canopy" || cls === "solid",
        `${key} carries a class`,
      );
    }
  });

  it("canopy is exactly the package's two-part species", () => {
    const truth = packagePropTruth();
    for (const key of DECOR_TYPES) {
      const packageName = PROP_NAME[key];
      assert.ok(packageName !== undefined, `${key} maps to a package species`);
      const entry = truth.get(packageName);
      assert.ok(entry !== undefined, `package ships ${packageName}`);
      assert.equal(
        PROP_WALKABILITY[key] === "canopy",
        entry.hasOver,
        `${key}: canopy class must match the package's _over part`,
      );
    }
  });

  it("pins the carpet conversions as the only package divergences", () => {
    const truth = packagePropTruth();
    const divergent: string[] = [];
    for (const key of DECOR_TYPES) {
      const entry = truth.get(PROP_NAME[key] as string) as { groundWalkable: boolean };
      const walksHere = PROP_WALKABILITY[key] === "carpet";
      if (walksHere !== entry.groundWalkable) {
        assert.ok(
          walksHere && !entry.groundWalkable,
          `${key}: a package-walkable species must never be classed solid/canopy`,
        );
        divergent.push(key);
      }
    }
    assert.deepEqual(divergent.sort(), [...CARPET_CONVERSIONS].sort());
  });

  it("the public loader walks carpet and blocks canopy trunks and solids", () => {
    const validation = validateRecipe({
      recipeFormat: 1,
      seed: 7,
      world: { sizePreset: "tiny", climatePreset: "temperate" },
      budgets: { settlementCount: 3, landmarkCount: 1, primaryRouteCount: 1 },
    });
    assert.ok(validation.ok);
    const normalized = normalizeRecipe(validation.recipe);
    const config = compileRecipe(normalized);
    const result = generateWorldDetailed(normalized, config);
    const artifact = JSON.parse(JSON.stringify(result.artifact)) as {
      dimensions: { width: number; height: number; chunkWidth: number; chunkHeight: number };
      propTypes: string[];
      chunks: { coord: [number, number]; layers: Record<string, number[][]> }[];
    };
    // Find open ground through the UNMODIFIED loader: walkable, bare of
    // props/structures/fences — then plant every species there in turn.
    const baseline = loadWorldArtifact(JSON.parse(JSON.stringify(artifact)));
    assert.ok(baseline.ok);
    const world = baseline.world;
    const open: [number, number][] = [];
    const { width, height } = world.dimensions;
    for (let y = 0; y < height && open.length < DECOR_TYPES.length; y += 1) {
      for (let x = 0; x < width && open.length < DECOR_TYPES.length; x += 1) {
        if (
          world.walkableAt(x, y) &&
          world.propAt(x, y) === null &&
          world.structureAt(x, y) === null &&
          world.fenceAt(x, y) === null &&
          !world.trailAt(x, y) &&
          world.pierAt(x, y) === null
        ) {
          open.push([x, y]);
        }
      }
    }
    assert.equal(open.length, DECOR_TYPES.length, "found an open cell per species");
    const chunkOf = (x: number, y: number) => {
      const cw = artifact.dimensions.chunkWidth;
      const chY = Math.trunc(y / artifact.dimensions.chunkHeight);
      const chX = Math.trunc(x / cw);
      const chunk = artifact.chunks.find((c) => c.coord[0] === chX && c.coord[1] === chY);
      assert.ok(chunk !== undefined);
      return chunk;
    };
    DECOR_TYPES.forEach((key, speciesIndex) => {
      const [x, y] = open[speciesIndex] as [number, number];
      const chunk = chunkOf(x, y);
      const row = chunk.layers["prop"]?.[y % artifact.dimensions.chunkHeight];
      assert.ok(row !== undefined);
      row[x % artifact.dimensions.chunkWidth] = speciesIndex + 1;
    });
    const planted = loadWorldArtifact(JSON.parse(JSON.stringify(artifact)));
    assert.ok(planted.ok);
    DECOR_TYPES.forEach((key, speciesIndex) => {
      const [x, y] = open[speciesIndex] as [number, number];
      assert.equal(planted.world.propAt(x, y), key);
      assert.equal(
        planted.world.walkableAt(x, y),
        PROP_WALKABILITY[key] === "carpet",
        `${key}: loader blocking-ness must derive from its class`,
      );
    });
  });

  it("the Godot consumer's carpet override mirrors the conversions", () => {
    const source = readFileSync(join(ROOT, "consumers", "godot", "world.gd"), "utf8");
    const block = source.match(/const CARPET_PROPS[^=]*=\s*\[[^\]]+\]/);
    assert.ok(block !== null, "world.gd declares CARPET_PROPS");
    const listed = [...(block[0] as string).matchAll(/"prop\.([a-z_]+)\."/g)].map(
      (match) => match[1] as string,
    );
    const expected = CARPET_CONVERSIONS.map((key) => PROP_NAME[key] as string);
    assert.deepEqual(listed.sort(), expected.sort());
  });
});
