import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compileRecipe } from "../src/recipe/compile.js";
import { normalizeRecipe } from "../src/recipe/normalize.js";
import { validateRecipe } from "../src/recipe/validate.js";
import { composeWorld } from "../src/generation/composeWorld.js";
import { loadPinnedManifest } from "../src/adapters/tileforge/manifest.js";
import { resolveToTileForge } from "../src/adapters/tileforge/resolve.js";
import {
  buildResolutionTables,
  resolveLayers,
  windowFromMapData,
  RESOLVED_CELL_LAYERS,
} from "../src/adapters/tileforge/resolution.js";
import { emitResolvedTmj } from "../src/adapters/tileforge/emitTmj.js";
import { buildGidDecoder } from "../src/adapters/tileforge/verifyResolution.js";
import type { TmjDocument } from "../src/adapters/tileforge/tmj.js";

const SEED = 41;

function resolvedWorld(seed: number) {
  const validation = validateRecipe({
    recipeFormat: 1,
    seed,
    world: { sizePreset: "tiny", climatePreset: "temperate" },
    budgets: { settlementCount: 3, landmarkCount: 1, primaryRouteCount: 1 },
  });
  assert.ok(validation.ok);
  const composed = composeWorld(compileRecipe(normalizeRecipe(validation.recipe)));
  return resolveToTileForge(composed);
}

describe("emitted map.tmj", () => {
  const resolved = resolvedWorld(SEED);
  const emitted = emitResolvedTmj(resolved.mapData, SEED);

  it("copies the package tilesets block verbatim and the full layer stack", () => {
    const { manifest } = loadPinnedManifest();
    assert.equal(emitted.doc.width, resolved.mapData.mapW);
    assert.equal(emitted.doc.height, resolved.mapData.mapH);
    assert.equal(emitted.doc.tilesets.length > 0, true);
    const names = emitted.doc.layers.map((layer) => layer.name);
    assert.deepEqual(
      names,
      [
        "underlay", "sand", "terrain", "moss", "tallgrass", "crops", "river",
        "cliff", "ramps", "pier", "road", "fence", "decals", "wall",
        "structures", "props", "props-overhang",
      ],
      "package layer order preserved",
    );
    assert.ok(manifest.selectorVersion >= 2, "pinned package ships selector v2");
  });

  it("round-trips: every emitted gid decodes to the derived (family, mask)", () => {
    const { manifest } = loadPinnedManifest();
    const tables = buildResolutionTables(manifest);
    const derived = resolveLayers(
      tables,
      windowFromMapData(resolved.mapData),
      0,
      0,
      resolved.mapData.mapW,
      resolved.mapData.mapH,
    );
    const decoder = buildGidDecoder(manifest, emitted.doc as TmjDocument);
    const byName = new Map(emitted.doc.layers.map((layer) => [layer.name, layer]));
    const layerFor = new Map<string, readonly string[]>([
      ...RESOLVED_CELL_LAYERS.map(
        (name) => [name === "propsOverhang" ? "props-overhang" : name, derived.cells[name]] as const,
      ),
    ]);
    for (const [tmjName, cells] of layerFor) {
      const layer = byName.get(tmjName);
      assert.ok(layer !== undefined && layer.data !== undefined, tmjName);
      for (let index = 0; index < cells.length; index += 1) {
        const gid = layer.data[index] as number;
        const expected = cells[index] as string;
        const actual = gid === 0 ? "" : decoder.decode(gid);
        assert.equal(actual, expected, `${tmjName}[${index}]`);
      }
    }
  });

  it("is deterministic per seed and mask-stable across seeds", () => {
    const again = emitResolvedTmj(resolved.mapData, SEED);
    assert.deepEqual(again.doc, emitted.doc);
    const other = emitResolvedTmj(resolved.mapData, SEED + 1);
    // Same grids, different variant seed: masks identical, some gids differ.
    const { manifest } = loadPinnedManifest();
    const ours = buildGidDecoder(manifest, emitted.doc as TmjDocument);
    const theirs = buildGidDecoder(manifest, other.doc as TmjDocument);
    let variantDifferences = 0;
    for (let l = 0; l < emitted.doc.layers.length; l += 1) {
      const a = emitted.doc.layers[l];
      const b = other.doc.layers[l];
      assert.ok(a !== undefined && b !== undefined && a.data !== undefined && b.data !== undefined);
      for (let index = 0; index < a.data.length; index += 1) {
        const ga = a.data[index] as number;
        const gb = b.data[index] as number;
        assert.equal(
          ga === 0 ? "" : ours.decode(ga),
          gb === 0 ? "" : theirs.decode(gb),
          "masks must not depend on the variant seed",
        );
        if (ga !== gb) variantDifferences += 1;
      }
    }
    assert.ok(variantDifferences > 0, "a different seed reshuffles some variants");
  });

  it("keeps grass accents rare per the selector weights", () => {
    const { manifest } = loadPinnedManifest();
    const grass = manifest.families.get("grass");
    const selector = manifest.selectorFamilies.get("grass");
    assert.ok(grass !== undefined && selector !== undefined && selector.tones !== undefined);
    const accentFirst = selector.baseVariants * selector.tones.n;
    const decoder = buildGidDecoder(manifest, emitted.doc as TmjDocument);
    const terrain = emitted.doc.layers.find((layer) => layer.name === "terrain");
    assert.ok(terrain !== undefined && terrain.data !== undefined);
    let grassTiles = 0;
    let accents = 0;
    for (const gid of terrain.data) {
      if (gid === 0) continue;
      const tile = decoder.decodeTile(gid);
      if (tile.family.key !== "grass") continue;
      grassTiles += 1;
      if (tile.tile.variant >= accentFirst) accents += 1;
    }
    assert.ok(grassTiles > 500, `enough grass to measure (${grassTiles})`);
    const permille = Math.round((accents * 1000) / grassTiles);
    assert.ok(
      permille >= 60 && permille <= 140,
      `grass accents ${permille} permille should sit near the 10% budget`,
    );
  });

  it("gives every cell of a structure footprint the anchor variant", () => {
    const { manifest } = loadPinnedManifest();
    const decoder = buildGidDecoder(manifest, emitted.doc as TmjDocument);
    const structures = emitted.doc.layers.find((layer) => layer.name === "structures");
    assert.ok(structures !== undefined && structures.data !== undefined);
    const width = resolved.mapData.mapW;
    const variantByAnchor = new Map<string, number>();
    let footprintCells = 0;
    for (let index = 0; index < structures.data.length; index += 1) {
      const gid = structures.data[index] as number;
      if (gid === 0) continue;
      const code = resolved.mapData.meta[index] as number;
      const def = manifest.structureById.get(code >> 8);
      assert.ok(def !== undefined);
      const x = index % width;
      const y = (index - x) / width;
      const cellIndex = code % 256;
      const anchor = `${x - (cellIndex % def.w)},${y - Math.floor(cellIndex / def.w)}`;
      const variant = decoder.decodeTile(gid).tile.variant;
      const seen = variantByAnchor.get(anchor);
      if (seen === undefined) {
        variantByAnchor.set(anchor, variant);
      } else {
        assert.equal(variant, seen, `structure at ${anchor} mixes variants`);
      }
      footprintCells += 1;
    }
    assert.ok(footprintCells > 0, "world places structures");
  });
});
