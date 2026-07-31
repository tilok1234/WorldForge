import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { resolveToTileForge, type TileForgeMapData } from "../src/adapters/tileforge/resolve.js";
import { loadPinnedManifest } from "../src/adapters/tileforge/manifest.js";
import { loadWorldArtifact, SUPPORTED_ARTIFACT_FORMAT } from "../src/consumers/typescript/loader.js";

// This file runs from dist/tests/, so the SOURCE sits two levels up.
const LOADER_PATH = fileURLToPath(
  new URL("../../src/consumers/typescript/loader.ts", import.meta.url),
);

function generated(seed: number) {
  const validation = validateRecipe({
    recipeFormat: 1,
    seed,
    world: { sizePreset: "tiny", climatePreset: "temperate" },
    budgets: { settlementCount: 3, landmarkCount: 1, primaryRouteCount: 1 },
  });
  assert.ok(validation.ok);
  const normalized = normalizeRecipe(validation.recipe);
  const config = compileRecipe(normalized);
  const result = generateWorldDetailed(normalized, config);
  return { result, config };
}

/**
 * The §3 walkability ladder evaluated over the TileForge-RESOLVED grids and
 * the manifest's own walkability metadata — the reference the Godot consumer
 * enforces in-engine (verify_world.gd implements the same reading).
 */
function ladderWalkable(data: TileForgeMapData, index: number): boolean {
  const { manifest } = loadPinnedManifest();
  const width = data.mapW;
  void width;
  const meta = data.meta[index] as number;
  if (meta !== 0) {
    const typeId = meta >> 8;
    const cellIndex = meta % 256;
    const def = manifest.structureById.get(typeId);
    assert.ok(def !== undefined, `meta type ${typeId}`);
    return (def.pass ?? []).includes(cellIndex);
  }
  const prop = data.prop[index] as number;
  if (prop !== 0) {
    const family = manifest.families.get("prop");
    assert.ok(family !== undefined);
    const ground = family.tiles.find((tile) => tile.mask === prop * 10 && tile.variant === 0);
    // Per-tile walkable overrides are not exposed on FamilyTile; blocking-ness
    // is family default (false) unless the species is in the known open set.
    const openSpecies = new Set([
      "bush", "flowers", "sapling", "mushrooms", "ferns", "desertshrub",
      "snowshrub", "roots", "leafpile", "reeds", "cattails", "fishnets",
      "bedroll", "brokenboards", "ashpile",
    ]);
    const name = manifest.propNameById[prop] as string;
    void ground;
    if (!openSpecies.has(name)) return false;
  }
  if ((data.fence[index] as number) !== 0 || (data.wall[index] as number) !== 0) {
    return false;
  }
  if ((data.road[index] as number) !== 0) {
    return true;
  }
  if ((data.pier[index] as number) !== 0) {
    return true;
  }
  const decal = data.decal[index] as number;
  const material = data.mat[index] as number;
  const materialKey = manifest.materialFamilyById[material] as string;
  // Terrain walkability comes from the MANIFEST family flags — the same
  // data the Godot importer stamps on tiles — never from a hand list.
  const terrainWalks = manifest.families.get(materialKey)?.walkable ?? true;
  // Walk-granting decals over wet ground or rivers (ford, stepping stones).
  const walkGranting = new Set(["ford", "steppingstones", "frost"]);
  const decalKey = decal === 0 ? null : (manifest.decalFamilyById[decal] as string);
  const riverHere = (data.river[index] as number) !== 0;
  if (decalKey !== null && walkGranting.has(decalKey) && (!terrainWalks || riverHere)) {
    return true;
  }
  if (riverHere) {
    return false;
  }
  return terrainWalks;
}

describe("W8 cross-consumer parity", () => {
  it("keeps the public loader free of generator-internal imports", () => {
    const source = readFileSync(LOADER_PATH, "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1] as string);
    assert.deepEqual(imports, [], "the loader imports nothing outside its own file");
  });

  it("agrees with the resolved §3 ladder on every cell (seeds 1-6)", () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const { result } = generated(seed);
      const resolved = resolveToTileForge(result.composed);
      const loaded = loadWorldArtifact(JSON.parse(JSON.stringify(result.artifact)));
      assert.ok(loaded.ok, `seed ${seed}: ${JSON.stringify(!loaded.ok && loaded.issues)}`);
      const world = loaded.world;
      const { width, height } = world.dimensions;
      assert.equal(width, resolved.mapData.mapW);
      let mismatches = 0;
      const samples: string[] = [];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          const loader = world.walkableAt(x, y);
          const ladder = ladderWalkable(resolved.mapData, index);
          if (loader !== ladder) {
            mismatches += 1;
            if (samples.length < 8) {
              samples.push(
                `(${x},${y}) loader=${loader} ladder=${ladder} mat=${world.materialAt(x, y)} ` +
                  `prop=${world.propAt(x, y)} structure=${world.structureAt(x, y)} river=${world.riverTierAt(x, y)}`,
              );
            }
          }
        }
      }
      assert.equal(mismatches, 0, `seed ${seed}: ${mismatches} walkability mismatches\n  ${samples.join("\n  ")}`);
    }
  });

  it("agrees on a styled world's street band cells (behaviors 57/74)", () => {
    // narrowStreets writes band lanes (trail-class value 1 since behavior
    // 74; the through-route keeps road-class 2); the loader walks any band
    // value and the resolved ladder walks any band cell — prove they agree
    // cell-for-cell on a styled world.
    const validation = validateRecipe({
      recipeFormat: 1,
      seed: 11,
      world: { sizePreset: "tiny", climatePreset: "temperate" },
      budgets: { settlementCount: 3, landmarkCount: 1, primaryRouteCount: 1 },
      settlementStyle: { growthPermille: 600, narrowStreets: true },
    });
    assert.ok(validation.ok);
    const normalized = normalizeRecipe(validation.recipe);
    const config = compileRecipe(normalized);
    const result = generateWorldDetailed(normalized, config);
    const resolved = resolveToTileForge(result.composed);
    const loaded = loadWorldArtifact(JSON.parse(JSON.stringify(result.artifact)));
    assert.ok(loaded.ok);
    const world = loaded.world;
    const { width, height } = world.dimensions;
    let laneCells = 0;
    let mismatches = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (result.composed.routesResult.pathLayer[index] !== 0) laneCells += 1;
        if (world.walkableAt(x, y) !== ladderWalkable(resolved.mapData, index)) {
          mismatches += 1;
        }
      }
    }
    assert.ok(laneCells > 0, "styled world produced no band cells");
    assert.equal(mismatches, 0, `${mismatches} walkability mismatches on the styled world`);
  });

  it("threads the base identity into resolved consumer outputs", () => {
    const { result } = generated(2);
    const loaded = loadWorldArtifact(JSON.parse(JSON.stringify(result.artifact)));
    assert.ok(loaded.ok);
    const stamp = loaded.world.cacheStamp("tileforge-godot", 3);
    assert.equal(stamp.baseGenerationIdentitySha256, result.artifact.generator.generationIdentitySha256);
    assert.equal(stamp.baseArtifactFormat, SUPPORTED_ARTIFACT_FORMAT);
  });

  it("rejects incompatible formats and mismatched dependencies clearly", () => {
    const { result } = generated(3);
    const artifact = JSON.parse(JSON.stringify(result.artifact));
    const wrongFormat = { ...artifact, formatVersion: 3 };
    const formatResult = loadWorldArtifact(wrongFormat);
    assert.ok(!formatResult.ok && formatResult.issues.some((issue) => issue.path === "$.formatVersion"));
    const wrongDependency = loadWorldArtifact(artifact, {
      expectTileForge: { packageSha256: "not-the-package" },
    });
    assert.ok(
      !wrongDependency.ok &&
        wrongDependency.issues.some((issue) => issue.path.includes("tileforge")),
    );
    const matching = loadWorldArtifact(artifact, {
      expectTileForge: { packageId: "dusk-9b8b2a2-seed103991" },
    });
    assert.ok(matching.ok, "matching dependency identity loads");
  });

  it("exposes chunk geometry and typed cell access", () => {
    const { result } = generated(1);
    const loaded = loadWorldArtifact(JSON.parse(JSON.stringify(result.artifact)));
    assert.ok(loaded.ok);
    const world = loaded.world;
    const chunk = world.chunkAt(1, 1);
    assert.deepEqual(chunk.coord, [1, 1]);
    assert.equal(chunk.originX, world.dimensions.chunkWidth);
    const material = world.materialAt(5, 5);
    assert.ok(world.semanticPalette.includes(material));
    for (const destination of world.destinations) {
      assert.ok(world.inBounds(destination.cell[0], destination.cell[1]));
    }
  });
});
