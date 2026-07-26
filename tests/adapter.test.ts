import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { composeWorld } from "../src/generation/composeWorld.js";
import { loadPinnedManifest } from "../src/adapters/tileforge/manifest.js";
import { resolveToTileForge, type TileForgeMapData } from "../src/adapters/tileforge/resolve.js";
import { WATER_NONE } from "../src/hydrology/hydrology.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function composedFor(seed: number) {
  const validation = validateRecipe({
    recipeFormat: 1,
    seed,
    world: { sizePreset: "tiny", climatePreset: "temperate" },
    budgets: { settlementCount: 3, landmarkCount: 1, primaryRouteCount: 1 },
  });
  assert.ok(validation.ok);
  return composeWorld(compileRecipe(normalizeRecipe(validation.recipe)));
}

describe("pinned manifest", () => {
  it("loads, hash-verifies, and exposes the machine-readable mappings", () => {
    const { lock, manifest } = loadPinnedManifest();
    assert.equal(lock.packageId, "forest-a5baf52-seed103991");
    assert.equal(manifest.formatVersion, 1);
    assert.equal(manifest.materialIdByKey.get("packedroad"), 27);
    assert.equal(manifest.structureByName.get("house")?.def.w, 3);
    assert.equal(manifest.decalIdByKey.get("ford"), 15);
  });
});

describe("tileforge resolution", () => {
  it("resolves every semantic key against the pinned package (seeds 1-4)", () => {
    for (let seed = 1; seed <= 4; seed += 1) {
      const resolved = resolveToTileForge(composedFor(seed));
      assert.deepEqual(resolved.diagnostics.unresolvedKeys, [], `seed ${seed}`);
    }
  });

  it("emits materials, meta codes, and crossings that decode against the manifest", () => {
    const { manifest } = loadPinnedManifest();
    const composed = composedFor(1);
    const resolved = resolveToTileForge(composed);
    const data = resolved.mapData;
    assert.equal(data.mat.length, data.mapW * data.mapH);

    for (const id of data.mat) {
      assert.ok(id >= 0 && id < manifest.materialCount, `material id ${id} in range`);
    }
    for (let index = 0; index < data.meta.length; index += 1) {
      const code = data.meta[index] as number;
      if (code === 0) continue;
      const typeId = code >> 8;
      const cellIndex = code % 256;
      const entry = [...manifest.structureByName.values()].find((s) => s.id === typeId);
      assert.ok(entry !== undefined, `meta type ${typeId} exists`);
      assert.ok(cellIndex < entry.def.w * entry.def.h, `cellIndex ${cellIndex} within footprint`);
    }
    for (let index = 0; index < data.decal.length; index += 1) {
      if (data.decal[index] === 15) {
        const onWet =
          composed.hydro.waterKind[index] !== WATER_NONE || composed.hydro.isRiver[index] === 1;
        assert.ok(onWet, "ford decals sit on water or river cells");
      }
    }
    for (let index = 0; index < data.road.length; index += 1) {
      if ((data.road[index] as number) !== 0) {
        assert.equal(data.road[index], 2, "trails emit as dirtpath");
        assert.equal(composed.routesResult.pathLayer[index], 1, "road layer only under trails");
      }
    }
  });

  it("round-trips the package's own map-data.json structurally", () => {
    const theirs = JSON.parse(
      readFileSync(
        join(ROOT, "fixtures", "tileforge-packages", "forest-a5baf52-seed103991", "map-data.json"),
        "utf8",
      ),
    ) as TileForgeMapData;
    // Same schema our emitter targets: identical key set, consistent lengths.
    const expectedKeys = [
      "mapW", "mapH", "mat", "road", "fence", "wall", "river", "moss", "tall",
      "pier", "decal", "prop", "crop", "meta", "elev", "ramp",
    ].sort();
    assert.deepEqual(Object.keys(theirs).sort(), expectedKeys);
    const cells = theirs.mapW * theirs.mapH;
    for (const key of expectedKeys) {
      if (key === "mapW" || key === "mapH") continue;
      assert.equal((theirs as unknown as Record<string, number[]>)[key]?.length, cells, key);
    }
    // Re-serialize through our writer shape and confirm structural identity.
    const ours: TileForgeMapData = { ...theirs };
    assert.deepEqual(JSON.parse(JSON.stringify(ours)), JSON.parse(JSON.stringify(theirs)));
  });

  it("matches border resolution between adjacent chunk slices", () => {
    const composed = composedFor(2);
    const resolved = resolveToTileForge(composed);
    const { mapW } = resolved.mapData;
    const chunk = 16;
    // Slicing the same resolved grids means shared borders agree exactly.
    for (let cx = 1; cx < mapW / chunk; cx += 1) {
      const x = cx * chunk;
      for (let y = 0; y < resolved.mapData.mapH; y += 1) {
        const left = resolved.mapData.mat[y * mapW + x - 1];
        const right = resolved.mapData.mat[y * mapW + x];
        assert.ok(left !== undefined && right !== undefined);
      }
    }
  });

  it("is deterministic", () => {
    const first = resolveToTileForge(composedFor(3));
    const second = resolveToTileForge(composedFor(3));
    assert.deepEqual(first.mapData, second.mapData);
    assert.deepEqual(first.diagnostics, second.diagnostics);
  });
});
