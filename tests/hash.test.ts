import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { combine32, hashCoords, hashString32, mix32 } from "../src/core/hash.js";

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

describe("hash primitives", () => {
  it("always produces uint32 values", () => {
    for (const input of [0, 1, -1, 0xffffffff, 0x80000000, 123456789]) {
      assert.ok(isUint32(mix32(input)), `mix32(${input})`);
    }
    assert.ok(isUint32(hashString32("macro.elevation")));
    assert.ok(isUint32(hashCoords(1, -5, 7, 3)));
    assert.ok(isUint32(combine32(0xdeadbeef, 42)));
  });

  it("separates nearby inputs", () => {
    assert.notEqual(mix32(1), mix32(2));
    assert.notEqual(hashCoords(1, 0, 0), hashCoords(1, 1, 0));
    assert.notEqual(hashCoords(1, 0, 0), hashCoords(1, 0, 1));
    assert.notEqual(hashCoords(1, 3, 5), hashCoords(1, 5, 3), "axes must be decorrelated");
    assert.notEqual(hashCoords(1, 3, 5), hashCoords(2, 3, 5), "seed must matter");
    assert.notEqual(hashCoords(1, 3, 5, 0), hashCoords(1, 3, 5, 1), "salt must matter");
  });

  it("hashes strings by UTF-8 bytes, including multi-byte code points", () => {
    assert.notEqual(hashString32(""), hashString32("a"));
    assert.notEqual(hashString32("ab"), hashString32("ba"));
    assert.notEqual(hashString32("🌲"), hashString32("🌳"));
    assert.equal(hashString32("terrain.grass"), hashString32("terrain.grass"));
  });

  it("keeps combine32 order-sensitive", () => {
    assert.notEqual(combine32(combine32(0, 1), 2), combine32(combine32(0, 2), 1));
  });

  it("wraps coordinates into the int32 domain deterministically", () => {
    assert.equal(hashCoords(1, 2 ** 32 + 5, 0), hashCoords(1, 5, 0));
    assert.ok(isUint32(hashCoords(1, 2147483647, -2147483648)));
  });
});
