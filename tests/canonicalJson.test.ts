import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalJson } from "../src/core/canonicalJson.js";
import { canonicalSha256 } from "../src/core/identity.js";

describe("canonical JSON", () => {
  it("sorts object keys and ends with one LF", () => {
    const text = canonicalJson({ b: 1, a: 2 });
    assert.equal(text, '{\n  "a": 2,\n  "b": 1\n}\n');
    assert.ok(!text.includes("\r"));
  });

  it("is independent of source key order", () => {
    const left = JSON.parse('{"x": 1, "nested": {"b": 2, "a": 3}}') as unknown;
    const right = JSON.parse('{"nested": {"a": 3, "b": 2}, "x": 1}') as unknown;
    assert.equal(canonicalJson(left), canonicalJson(right));
    assert.equal(canonicalSha256(left), canonicalSha256(right));
  });

  it("normalizes negative zero", () => {
    assert.equal(canonicalJson(-0), "0\n");
  });

  it("renders empty containers compactly", () => {
    assert.equal(canonicalJson({}), "{}\n");
    assert.equal(canonicalJson([]), "[]\n");
  });

  it("rejects non-integer numbers", () => {
    assert.throws(() => canonicalJson(1.5), /safe integers/);
    assert.throws(() => canonicalJson(Number.NaN), /safe integers/);
    assert.throws(() => canonicalJson(Number.POSITIVE_INFINITY), /safe integers/);
    assert.throws(() => canonicalJson(Number.MAX_SAFE_INTEGER + 1), /safe integers/);
  });

  it("rejects undefined values and non-plain objects", () => {
    assert.throws(() => canonicalJson({ a: undefined }), /undefined/);
    assert.throws(() => canonicalJson(new Date(0)), /plain objects/);
    assert.throws(() => canonicalJson(() => 0), /cannot encode/);
  });
});
