import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyByThresholds, clampInt, lerpPermille, remapInt } from "../src/core/fixedPoint.js";

describe("fixed-point helpers", () => {
  it("interpolates with floor rounding, symmetric for negatives", () => {
    assert.equal(lerpPermille(0, 1000, 0), 0);
    assert.equal(lerpPermille(0, 1000, 1000), 1000);
    assert.equal(lerpPermille(0, 1000, 500), 500);
    assert.equal(lerpPermille(0, 3, 500), 1); // floor(1.5)
    assert.equal(lerpPermille(-3, 0, 500), -2); // -3 + floor(1.5)
  });

  it("documents floor-toward-negative-infinity on the half cases", () => {
    assert.equal(lerpPermille(0, 3, 500), 1);
    assert.equal(lerpPermille(3, 0, 500), 1); // 3 + floor(-1.5) = 3 - 2
    assert.equal(lerpPermille(0, -3, 500), -2); // 0 + floor(-1.5)
    assert.throws(() => lerpPermille(0.5 as number, 1, 1), /safe integer/);
  });

  it("remaps ranges with clamping and floor rounding", () => {
    assert.equal(remapInt(500, 0, 1000, 0, 255), 127);
    assert.equal(remapInt(0, 0, 1000, 0, 255), 0);
    assert.equal(remapInt(1000, 0, 1000, 0, 255), 255);
    assert.equal(remapInt(2000, 0, 1000, 0, 10), 10, "clamps above the source range");
    assert.equal(remapInt(-2000, -1000, 1000, 0, 8), 0, "clamps below the source range");
    assert.throws(() => remapInt(0, 5, 5, 0, 1), /degenerate/);
  });

  it("classifies by strictly ascending thresholds", () => {
    const thresholds = [0, 250, 700];
    assert.equal(classifyByThresholds(-50, thresholds), 0);
    assert.equal(classifyByThresholds(0, thresholds), 1, "value equal to a threshold falls above it");
    assert.equal(classifyByThresholds(249, thresholds), 1);
    assert.equal(classifyByThresholds(250, thresholds), 2);
    assert.equal(classifyByThresholds(5000, thresholds), 3);
    assert.throws(() => classifyByThresholds(0, [5, 5]), /ascending/);
  });

  it("clamps integers and rejects inverted ranges", () => {
    assert.equal(clampInt(-5, 0, 10), 0);
    assert.equal(clampInt(15, 0, 10), 10);
    assert.equal(clampInt(5, 0, 10), 5);
    assert.throws(() => clampInt(0, 10, 0), /inverted/);
  });
});
