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
import { composeWorld } from "../generation/composeWorld.js";
import { WORLD_PALETTE } from "../regions/biomes.js";
import { renderWorldGridPng } from "../render/macroRender.js";

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
  return { config, composed: composeWorld(config) };
}

export function buildMacroSamples(): unknown {
  return {
    sampleFormat: 1,
    worlds: ["tiny-temperate", "small-cold-coastal"].map((name) => {
      const { composed } = worldFor(name);
      const biomeCellTotals: Record<string, number> = {};
      for (const key of WORLD_PALETTE) {
        biomeCellTotals[key] = 0;
      }
      for (const index of composed.grid) {
        const key = WORLD_PALETTE[index] as string;
        biomeCellTotals[key] = (biomeCellTotals[key] ?? 0) + 1;
      }
      return {
        name,
        samples: SAMPLE_COORDS.map(([x, y]) => ({
          x,
          y,
          elevation: composed.fields.elevation[y * composed.width + x],
          moisture: composed.moistureAdjusted[y * composed.width + x],
          temperature: composed.fields.temperature[y * composed.width + x],
          biome: WORLD_PALETTE[composed.grid[y * composed.width + x] as number],
          river: composed.hydro.isMajorRiver[y * composed.width + x],
        })),
        regionCount: composed.regions.length,
        residualSmallRegions: composed.residualSmallRegions,
        biomeCellTotals,
        hydrology: {
          oceanCellCount: composed.hydro.oceanCellCount,
          lakeCount: composed.hydro.lakeCount,
          riverCellCount: composed.hydro.riverCellCount,
          majorRiverCellCount: composed.hydro.majorRiverCellCount,
          riverSourceCount: composed.hydro.riverTraces.length,
          wetlandCellCount: composed.wetlandCellCount,
          topologyErrorCount: composed.hydro.topologyErrors.length,
        },
      };
    }),
  };
}

export function buildTinyBiomePng(): Buffer {
  const { composed } = worldFor("tiny-temperate");
  return renderWorldGridPng(composed.width, composed.height, composed.grid);
}
