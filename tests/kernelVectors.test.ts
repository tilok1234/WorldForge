import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildKernelVectors } from "../src/testing/kernelVectors.js";
import { compareToGolden } from "../src/testing/golden.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

describe("kernel golden vectors", () => {
  it("reproduces the committed cross-platform vectors byte-for-byte", () => {
    const comparison = compareToGolden(ROOT, "fixtures/golden/kernel-vectors.json", buildKernelVectors());
    assert.ok(
      comparison.expectedCanonical !== null,
      `${comparison.expectedPath} is missing — run tools/update-golden.ts once and commit it`,
    );
    assert.ok(
      comparison.matches,
      "kernel output differs from the committed golden vectors; if this change is an approved behavior change, regenerate via tools/update-golden.ts",
    );
  });

  it("is itself deterministic across repeated in-process builds", () => {
    const first = JSON.stringify(buildKernelVectors());
    const second = JSON.stringify(buildKernelVectors());
    assert.equal(first, second);
  });
});
