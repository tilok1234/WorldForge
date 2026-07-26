import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cellIndexRowMajor,
  chunkOrigin,
  floorDiv,
  floorMod,
  worldToChunk,
  worldToLocal,
} from "../src/core/coords.js";

describe("floor division and modulo", () => {
  it("rounds toward negative infinity", () => {
    assert.equal(floorDiv(7, 3), 2);
    assert.equal(floorDiv(-7, 3), -3);
    assert.equal(floorDiv(7, -3), -3);
    assert.equal(floorDiv(-7, -3), 2);
    assert.equal(floorMod(-7, 3), 2);
    assert.equal(floorMod(7, -3), -2);
  });

  it("satisfies divisor * div + mod === value across the domain", () => {
    const values = [-9007199254740991, -2147483648, -33, -1, 0, 1, 15, 2147483647, 9007199254740991];
    const divisors = [-32, -3, 3, 16, 32];
    for (const value of values) {
      for (const divisor of divisors) {
        const div = floorDiv(value, divisor);
        const mod = floorMod(value, divisor);
        // BigInt identity: the product can exceed 2^53 at the extremes even
        // though div and mod themselves are exact safe integers.
        assert.equal(
          BigInt(divisor) * BigInt(div) + BigInt(mod),
          BigInt(value),
          `identity for (${value}, ${divisor})`,
        );
        if (divisor > 0) {
          assert.ok(mod >= 0 && mod < divisor, `mod range for (${value}, ${divisor})`);
        }
      }
    }
  });

  it("rejects zero divisors and non-integers", () => {
    assert.throws(() => floorDiv(1, 0), /zero/);
    assert.throws(() => floorDiv(1.5, 2), /safe integers/);
    assert.throws(() => floorMod(1, Number.NaN), /safe integers/);
  });
});

describe("coordinate conversions", () => {
  it("round-trips world -> chunk + local -> world, including negatives", () => {
    const cases = [
      { x: 0, y: 0 }, { x: 31, y: 47 }, { x: -1, y: -1 }, { x: -33, y: 15 },
      { x: 2147483647, y: -2147483648 },
    ];
    for (const { x, y } of cases) {
      const chunk = worldToChunk(x, y, 16, 16);
      const local = worldToLocal(x, y, 16, 16);
      const origin = chunkOrigin(chunk.cx, chunk.cy, 16, 16);
      assert.equal(origin.x + local.lx, x, `x round-trip for (${x}, ${y})`);
      assert.equal(origin.y + local.ly, y, `y round-trip for (${x}, ${y})`);
      assert.ok(local.lx >= 0 && local.lx < 16);
      assert.ok(local.ly >= 0 && local.ly < 16);
    }
  });

  it("maps cell (-1, -1) into chunk (-1, -1), not chunk (0, 0)", () => {
    assert.deepEqual(worldToChunk(-1, -1, 16, 16), { cx: -1, cy: -1 });
    assert.deepEqual(worldToLocal(-1, -1, 16, 16), { lx: 15, ly: 15 });
  });

  it("indexes cells row-major and rejects out-of-range cells", () => {
    assert.equal(cellIndexRowMajor(0, 0, 16), 0);
    assert.equal(cellIndexRowMajor(15, 0, 16), 15);
    assert.equal(cellIndexRowMajor(0, 1, 16), 16);
    assert.equal(cellIndexRowMajor(3, 2, 16), 35);
    assert.throws(() => cellIndexRowMajor(16, 0, 16), /outside/);
    assert.throws(() => cellIndexRowMajor(-1, 0, 16), /outside/);
  });
});
