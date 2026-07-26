import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { composeWorld } from "../src/generation/composeWorld.js";
import { loadPinnedManifest } from "../src/adapters/tileforge/manifest.js";
import { resolveToTileForge, type TileForgeMapData } from "../src/adapters/tileforge/resolve.js";
import {
  blobMask,
  buildResolutionTables,
  connectedAt,
  inSandField,
  networkMask,
  underlayAt,
  windowFromMapData,
  type ResolutionTables,
} from "../src/adapters/tileforge/resolution.js";
import {
  loadPackageMapData,
  verifyAgainstPackageMap,
  verifyChunkedResolution,
} from "../src/adapters/tileforge/verifyResolution.js";

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

function tables(): ResolutionTables {
  return buildResolutionTables(loadPinnedManifest().manifest);
}

function matId(key: string): number {
  const id = loadPinnedManifest().manifest.materialIdByKey.get(key);
  assert.ok(id !== undefined, `material family ${key}`);
  return id;
}

/** A small synthetic map filled with one material, layers all zero. */
function syntheticMap(w: number, h: number, fill: number): {
  data: TileForgeMapData & { mat: number[]; road: number[]; wall: number[]; river: number[]; meta: number[] };
} {
  const zeros = (): number[] => new Array<number>(w * h).fill(0);
  const data = {
    mapW: w,
    mapH: h,
    mat: new Array<number>(w * h).fill(fill),
    road: zeros(),
    fence: zeros(),
    wall: zeros(),
    river: zeros(),
    moss: zeros(),
    tall: zeros(),
    pier: zeros(),
    decal: zeros(),
    prop: zeros(),
    crop: zeros(),
    meta: zeros(),
    elev: zeros(),
    ramp: zeros(),
  };
  return { data };
}

describe("§2.5 connection rules", () => {
  it("land runs flush to water; the water side draws the shore", () => {
    const t = tables();
    const grass = matId("grass");
    const water = matId("water");
    const { data } = syntheticMap(5, 5, grass);
    data.mat[2 * 5 + 3] = water;
    const g = windowFromMapData(data);
    // The grass cell at (2,2) counts its water neighbor as connected (rule 2)…
    assert.equal(connectedAt(t, g, grass, 3, 2), true);
    // …but the water cell does not count grass (it draws the shoreline).
    assert.equal(connectedAt(t, g, water, 2, 2), false);
  });

  it("hot spring keeps its own rim against the water group", () => {
    const t = tables();
    const water = matId("water");
    const hotspring = matId("hotspring");
    const { data } = syntheticMap(5, 5, water);
    data.mat[2 * 5 + 3] = hotspring;
    const g = windowFromMapData(data);
    assert.equal(connectedAt(t, g, water, 3, 2), false);
    assert.equal(connectedAt(t, g, hotspring, 2, 2), false);
  });

  it("the water group is one body and merges with river flags", () => {
    const t = tables();
    const water = matId("water");
    const shallow = matId("shallow");
    const grass = matId("grass");
    const { data } = syntheticMap(5, 5, water);
    data.mat[2 * 5 + 3] = shallow;
    data.mat[2 * 5 + 1] = grass;
    data.river[2 * 5 + 1] = 1; // a river run entering the lake
    const g = windowFromMapData(data);
    assert.equal(connectedAt(t, g, water, 3, 2), true, "water-shallow one body");
    assert.equal(connectedAt(t, g, water, 1, 2), true, "water merges with the river mouth");
  });

  it("the priority ladder connects lower under higher, but never into wet", () => {
    const t = tables();
    const grass = matId("grass");
    const gravel = matId("gravel");
    const { data } = syntheticMap(5, 5, gravel);
    data.mat[2 * 5 + 3] = grass; // grass outranks gravel on the ladder
    const g = windowFromMapData(data);
    assert.equal(connectedAt(t, g, gravel, 3, 2), true, "gravel runs under the grass lap");
    assert.equal(connectedAt(t, g, grass, 2, 2), false, "grass draws its edge over gravel");
  });

  it("out-of-world connects blob47 masks but never networks or sand", () => {
    const t = tables();
    const grass = matId("grass");
    const sand = matId("sand");
    const { data } = syntheticMap(3, 3, grass);
    data.road[0 * 3 + 0] = 1;
    data.mat[2 * 3 + 2] = sand;
    const g = windowFromMapData(data);
    assert.equal(blobMask(t, g, 0, 0, grass), 255, "world-corner grass is interior");
    assert.equal(networkMask(t, g, "road", 0, 0), 0, "road runs cap at the world edge");
    assert.equal(inSandField(t, g, 3, 2), false, "out-of-world is never sand");
  });

  it("wall runs meet gate structures flush, but not other structures", () => {
    const t = tables();
    const { manifest } = loadPinnedManifest();
    const grass = matId("grass");
    const gate = manifest.structureByName.get("gate");
    const house = manifest.structureByName.get("house");
    assert.ok(gate !== undefined && house !== undefined);
    const { data } = syntheticMap(7, 3, grass);
    data.wall[1 * 7 + 1] = 1;
    data.meta[1 * 7 + 2] = gate.id * 256; // gate anchor cell east of the wall
    data.wall[1 * 7 + 4] = 1;
    data.meta[1 * 7 + 5] = house.id * 256;
    const g = windowFromMapData(data);
    assert.equal(networkMask(t, g, "wall", 1, 1) & 2, 2, "east port opens toward the gate");
    assert.equal(networkMask(t, g, "wall", 4, 1) & 2, 0, "no port toward a house");
  });
});

describe("§2.6 underlay", () => {
  it("banks a pond on its dominant cardinal neighbor with list-order ties", () => {
    const t = tables();
    const bog = matId("bog");
    const water = matId("water");
    const { data } = syntheticMap(5, 5, bog);
    data.mat[2 * 5 + 2] = water;
    const g = windowFromMapData(data);
    assert.deepEqual(underlayAt(t, g, 2, 2), { family: "bog", mask: 255 });
  });

  it("shows the lower material through open cardinal sides", () => {
    const t = tables();
    const grass = matId("grass");
    const gravel = matId("gravel");
    const { data } = syntheticMap(5, 5, gravel);
    data.mat[2 * 5 + 2] = grass; // one grass cell inside gravel
    const g = windowFromMapData(data);
    // Grass outranks gravel, gravel faces every open side: fringe is gravel.
    assert.deepEqual(underlayAt(t, g, 2, 2), { family: "gravel", mask: 255 });
    // The gravel neighbors run under the grass lap and sit on plain soil.
    assert.deepEqual(underlayAt(t, g, 3, 2), { family: "soil", mask: 0 });
  });

  it("gives seamless floors their own fill unconditionally", () => {
    const t = tables();
    const cobble = matId("cobble");
    const grass = matId("grass");
    const { data } = syntheticMap(3, 3, grass);
    data.mat[1 * 3 + 1] = cobble;
    const g = windowFromMapData(data);
    assert.deepEqual(underlayAt(t, g, 1, 1), { family: "cobble", mask: 0 });
  });
});

describe("workbench truth test", () => {
  it("derives every §2 layer forge-identically from the package's own map", () => {
    const report = verifyAgainstPackageMap();
    for (const layer of report.layers) {
      assert.equal(
        layer.mismatches,
        0,
        `${layer.layer}: ${layer.mismatches} mismatches\n  ${layer.samples.join("\n  ")}`,
      );
    }
    assert.ok(report.ok);
    // The map genuinely exercises the systems (guard against silent skips).
    const placed = new Map(report.layers.map((l) => [l.layer, l.storedPlaced]));
    for (const layer of ["underlay", "terrain", "sand", "river", "cliff", "wall", "structures"]) {
      assert.ok((placed.get(layer) ?? 0) > 0, `${layer} has stored tiles`);
    }
    // Pinned-fixture caveat: the workbench map was cropped from a larger
    // canvas, so exactly its border sand ring diverges from raw-grid
    // derivation; the interior must stay fully comparable.
    const sand = report.layers.find((l) => l.layer === "sand");
    assert.ok(sand !== undefined && sand.cellsCompared > 3000, "sand interior compared");
    assert.match((sand.notes ?? []).join(" "), /240 dual points \(16 diverge/);
  });
});

describe("chunk-border matching at resolution level", () => {
  it("reproduces the workbench map chunk-by-chunk over a 2-cell halo", () => {
    const data = loadPackageMapData();
    for (const [w, h] of [
      [16, 16],
      [20, 20],
    ] as const) {
      const report = verifyChunkedResolution(data, w, h);
      assert.equal(
        report.mismatches,
        0,
        `${w}x${h}: ${report.mismatches} mismatches\n  ${report.samples.join("\n  ")}`,
      );
    }
  });

  it("reproduces generated worlds chunk-by-chunk across seeds and chunk sizes", () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const resolved = resolveToTileForge(composedFor(seed));
      assert.deepEqual(resolved.diagnostics.unresolvedKeys, []);
      for (const [w, h] of [
        [16, 16],
        [24, 24],
      ] as const) {
        const report = verifyChunkedResolution(resolved.mapData, w, h);
        assert.equal(
          report.mismatches,
          0,
          `seed ${seed} ${w}x${h}: ${report.mismatches} mismatches\n  ${report.samples.join("\n  ")}`,
        );
      }
    }
  });
});
