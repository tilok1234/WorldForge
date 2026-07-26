import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { canonicalJson } from "../src/core/canonicalJson.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { normalizeRecipe, recipeIdentity } from "../src/recipe/normalize.js";
import {
  compileRecipe,
  generationIdentity,
  resolvedConfigIdentity,
} from "../src/recipe/compile.js";
import { generateWorld } from "../src/generation/generate.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function pipeline(recipeName: string) {
  const raw: unknown = JSON.parse(
    readFileSync(join(ROOT, "fixtures", "recipes", `${recipeName}.json`), "utf8"),
  );
  const validation = validateRecipe(raw);
  assert.ok(validation.ok, `fixture recipe ${recipeName} must be valid`);
  const normalized = normalizeRecipe(validation.recipe);
  const config = compileRecipe(normalized);
  return { normalized, config };
}

describe("golden fixtures", () => {
  it("regenerates the tiny golden world byte-for-byte", () => {
    const { normalized, config } = pipeline("tiny-temperate");
    const artifact = generateWorld(normalized, config);
    const expected = readFileSync(
      join(ROOT, "fixtures", "worlds", "tiny-temperate", "world.json"),
      "utf8",
    );
    assert.equal(canonicalJson(artifact), expected);
  });

  it("reproduces the committed identity hashes for every golden recipe", () => {
    const expected = JSON.parse(
      readFileSync(join(ROOT, "fixtures", "worlds", "expected-hashes.json"), "utf8"),
    ) as Record<string, Record<string, string>>;

    for (const [name, hashes] of Object.entries(expected)) {
      const { normalized, config } = pipeline(name);
      assert.equal(recipeIdentity(normalized), hashes["recipeSha256"], `${name} recipe hash`);
      assert.equal(
        resolvedConfigIdentity(config),
        hashes["resolvedConfigSha256"],
        `${name} config hash`,
      );
      assert.equal(
        generationIdentity(normalized, config),
        hashes["generationIdentitySha256"],
        `${name} generation identity`,
      );
    }
  });
});
