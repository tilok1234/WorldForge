/**
 * Macro-world golden builders (Milestone W2): field and biome samples at
 * fixed coordinates plus the tiny world's biome debug render. Committed
 * fixtures catch any cross-platform or accidental drift in field math,
 * classification, or PNG encoding.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { compileRecipe } from "../recipe/compile.js";
import { normalizeRecipe } from "../recipe/normalize.js";
import { validateRecipe } from "../recipe/validate.js";
import { buildMacroFields } from "../fields/macroFields.js";
import { BIOME_KEYS, buildBiomeWorld } from "../regions/biomes.js";
import { renderBiomePng } from "../render/macroRender.js";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const SAMPLE_COORDS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [13, 7], [32, 32], [63, 63], [5, 60],
];

/** The golden recipes are the committed fixtures — never a duplicated copy. */
function worldFor(recipeName: string) {
  const raw: unknown = JSON.parse(
    readFileSync(join(ROOT, "fixtures", "recipes", `${recipeName}.json`), "utf8"),
  );
  const validation = validateRecipe(raw);
  if (!validation.ok) {
    throw new Error(`golden recipe ${recipeName} is invalid`);
  }
  const normalized = normalizeRecipe(validation.recipe);
  const config = compileRecipe(normalized);
  const fields = buildMacroFields(config);
  const biomeWorld = buildBiomeWorld(fields, config);
  return { config, fields, biomeWorld };
}

export function buildMacroSamples(): unknown {
  return {
    sampleFormat: 1,
    worlds: ["tiny-temperate", "small-cold-coastal"].map((name) => {
      const { fields, biomeWorld } = worldFor(name);
      const biomeCellTotals: Record<string, number> = {};
      for (const key of BIOME_KEYS) {
        biomeCellTotals[key] = 0;
      }
      for (const index of biomeWorld.biomeGrid) {
        const key = BIOME_KEYS[index] as string;
        biomeCellTotals[key] = (biomeCellTotals[key] ?? 0) + 1;
      }
      return {
        name,
        samples: SAMPLE_COORDS.map(([x, y]) => ({
          x,
          y,
          elevation: fields.elevation[y * fields.width + x],
          moisture: fields.moisture[y * fields.width + x],
          temperature: fields.temperature[y * fields.width + x],
          biome: BIOME_KEYS[biomeWorld.biomeGrid[y * fields.width + x] as number],
        })),
        regionCount: biomeWorld.regions.length,
        residualSmallRegions: biomeWorld.residualSmallRegions,
        biomeCellTotals,
      };
    }),
  };
}

export function buildTinyBiomePng(): Buffer {
  const { biomeWorld } = worldFor("tiny-temperate");
  return renderBiomePng(biomeWorld);
}
