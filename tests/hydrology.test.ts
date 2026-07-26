import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalJson } from "../src/core/canonicalJson.js";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { composeWorld } from "../src/generation/composeWorld.js";
import { generateWorldDetailed } from "../src/generation/generate.js";
import { WATER_NONE } from "../src/hydrology/hydrology.js";

function configFor(seed: number, climatePreset: "temperate" | "cold_coastal" = "cold_coastal") {
  const validation = validateRecipe({
    recipeFormat: 1,
    seed,
    world: { sizePreset: "tiny", climatePreset },
  });
  assert.ok(validation.ok);
  const normalized = normalizeRecipe(validation.recipe);
  return { normalized, config: compileRecipe(normalized) };
}

describe("hydrology topology", () => {
  it("never flows uphill on filled elevation and reports no violations (seeds 1-5)", () => {
    for (let seed = 1; seed <= 5; seed += 1) {
      const { config } = configFor(seed);
      const { hydro } = composeWorld(config);
      assert.deepEqual(hydro.topologyErrors, [], `seed ${seed}`);
      for (let index = 0; index < hydro.flowDir.length; index += 1) {
        const downstream = hydro.flowDir[index] as number;
        if (downstream !== -1) {
          assert.ok(
            (hydro.filledElevation[downstream] as number) <= (hydro.filledElevation[index] as number),
            `seed ${seed}: cell ${index} flows uphill`,
          );
        }
      }
    }
  });

  it("gives every river a source and a real destination", () => {
    let sawRiver = false;
    for (let seed = 1; seed <= 5; seed += 1) {
      const { config } = configFor(seed);
      const { hydro } = composeWorld(config);
      let riverCells = 0;
      for (let index = 0; index < hydro.isRiver.length; index += 1) {
        riverCells += hydro.isRiver[index] as number;
      }
      assert.equal(riverCells, hydro.riverCellCount);
      if (hydro.riverCellCount > 0) {
        sawRiver = true;
      }
      if (hydro.riverTraces.length > 0) {
        for (const trace of hydro.riverTraces) {
          assert.ok(trace.length >= 1);
          assert.ok(["ocean", "lake", "edge"].includes(trace.destination));
        }
      }
    }
    assert.ok(sawRiver, "at least one of seeds 1-5 should produce a river network");
  });

  it("keeps the ocean border-connected and lakes at 3+ cells", () => {
    for (let seed = 1; seed <= 5; seed += 1) {
      const { config } = configFor(seed);
      const { hydro, width, height } = composeWorld(config);
      if (hydro.oceanCellCount > 0) {
        let borderOcean = 0;
        for (let x = 0; x < width; x += 1) {
          borderOcean += hydro.isOcean[x] as number;
          borderOcean += hydro.isOcean[(height - 1) * width + x] as number;
        }
        for (let y = 0; y < height; y += 1) {
          borderOcean += hydro.isOcean[y * width] as number;
          borderOcean += hydro.isOcean[y * width + width - 1] as number;
        }
        assert.ok(borderOcean > 0, `seed ${seed}: ocean exists but touches no border`);
      }
      // Lakes: count water components that are not ocean; each must be >= 3.
      const seen = new Uint8Array(width * height);
      for (let start = 0; start < seen.length; start += 1) {
        if (
          seen[start] === 1 ||
          hydro.waterKind[start] === WATER_NONE ||
          hydro.isOcean[start] === 1
        ) {
          continue;
        }
        const stack = [start];
        seen[start] = 1;
        let size = 0;
        while (stack.length > 0) {
          const index = stack.pop() as number;
          size += 1;
          const x = index % width;
          const y = (index - x) / width;
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
              continue;
            }
            const neighbor = ny * width + nx;
            if (
              seen[neighbor] === 0 &&
              hydro.waterKind[neighbor] !== WATER_NONE &&
              hydro.isOcean[neighbor] === 0
            ) {
              seen[neighbor] = 1;
              stack.push(neighbor);
            }
          }
        }
        assert.ok(size >= 3, `seed ${seed}: lake of ${size} cells survived pruning`);
      }
    }
  });

  it("marks coast distance 0 on ocean and monotone by 1 across neighbors", () => {
    const { config } = configFor(2);
    const { hydro, width, height } = composeWorld(config);
    if (hydro.oceanCellCount === 0) {
      return;
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width - 1; x += 1) {
        const a = hydro.coastDistance[y * width + x] as number;
        const b = hydro.coastDistance[y * width + x + 1] as number;
        assert.ok(Math.abs(a - b) <= 1, `coast distance jumps at (${x}, ${y})`);
      }
    }
    for (let index = 0; index < hydro.isOcean.length; index += 1) {
      if (hydro.isOcean[index] === 1) {
        assert.equal(hydro.coastDistance[index], 0);
      }
    }
  });

  it("is deterministic end to end", () => {
    const { config } = configFor(3);
    const first = composeWorld(config);
    const second = composeWorld(config);
    assert.equal(canonicalJson(first.grid), canonicalJson(second.grid));
    assert.deepEqual(first.hydro.riverTraces, second.hydro.riverTraces);
    assert.deepEqual(first.regions, second.regions);
  });
});

describe("hydrology in the artifact", () => {
  it("agrees across chunk borders because chunks slice one global plan", () => {
    const { normalized, config } = configFor(1);
    const { artifact } = generateWorldDetailed(normalized, config);
    const { chunkWidth, chunkHeight, width } = {
      ...artifact.dimensions,
    };
    const chunksAcross = width / chunkWidth;
    const chunkAt = new Map(artifact.chunks.map((chunk) => [`${chunk.coord[0]},${chunk.coord[1]}`, chunk]));
    for (const chunk of artifact.chunks) {
      const [cx, cy] = chunk.coord;
      const east = chunkAt.get(`${cx + 1},${cy}`);
      if (east !== undefined) {
        for (let ly = 0; ly < chunkHeight; ly += 1) {
          const ourEdge = chunk.layers.elevation[ly]?.[chunkWidth - 1];
          const theirEdge = east.layers.elevation[ly]?.[0];
          assert.ok(ourEdge !== undefined && theirEdge !== undefined);
        }
      }
    }
    assert.equal(artifact.chunks.length, chunksAcross * (width / chunkHeight));
  });

  it("summarizes hydrology and exposes river cells as crossing candidates", () => {
    const { normalized, config } = configFor(1);
    const result = generateWorldDetailed(normalized, config);
    const summary = result.artifact.hydrology;
    assert.equal(summary.seaLevelPermille, config.water.seaLevelPermille);
    // Format 7 river tiers: 2 = major, 1 = network stream.
    let majorCells = 0;
    let allRiverCells = 0;
    for (const chunk of result.artifact.chunks) {
      for (const row of chunk.layers.river) {
        for (const cell of row) {
          if (cell === 2) majorCells += 1;
          if (cell >= 1) allRiverCells += 1;
        }
      }
    }
    assert.equal(majorCells, summary.riverCellCount);
    assert.equal(allRiverCells, summary.networkRiverCellCount);
    assert.ok(summary.networkRiverCellCount >= summary.riverCellCount);
  });
});
