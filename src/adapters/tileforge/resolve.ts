/**
 * TileForge resolution (Milestone W6). Emits the package's editable source
 * format — the map-data.json raw grid layers — from a composed world. Masks,
 * variants, underlays, and atlas coordinates are all derived by the package's
 * own renderer from these grids (FORMATS.md), so this adapter never touches
 * atlas math. Unknown semantic keys are reported, never silently defaulted.
 */

import type { ComposedWorld } from "../../generation/composeWorld.js";
import { WORLD_PALETTE, type PaletteKey } from "../../regions/biomes.js";
import { STRUCTURE_TYPES } from "../../settlements/structures.js";
import { DECAL_TYPES as DECAL_TYPES_LIST, DECOR_TYPES as DECOR_TYPES_LIST } from "../../decoration/decorate.js";
import {
  CROP_TYPES as CROP_TYPES_LIST,
  FENCE_TYPES as FENCE_TYPES_LIST,
  PIER_TYPES as PIER_TYPES_LIST,
} from "../../settlements/farms.js";
import { WATER_NONE } from "../../hydrology/hydrology.js";
import { loadPinnedManifest, type TileForgeManifest } from "./manifest.js";

/** WorldForge semantic keys -> package family keys (validated at resolve). */
const MATERIAL_FAMILY: { readonly [key in PaletteKey]: string } = {
  "terrain.cobble": "cobble",
  "terrain.dry_grass": "drygrass",
  "terrain.grass": "grass",
  "terrain.gravel": "gravel",
  "terrain.mud": "mud",
  "terrain.packed_road": "packedroad",
  "terrain.rock": "rock",
  "terrain.snow": "snow",
  "terrain.swamp": "muck",
  "water.deep": "deep",
  "water.shallow": "shallow",
  "terrain.sand": "sand",
};

/** WorldForge structure types -> package structure names. */
const STRUCTURE_NAME: { readonly [key: string]: string } = {
  "structure.house": "house",
  "structure.town_hall": "townhall",
  "structure.watchtower": "tower",
  "structure.well": "well",
  "structure.cottage": "cottage",
  "structure.tavern": "tavern",
  "structure.smithy": "smithy",
  "structure.chapel": "chapel",
  "structure.manor": "manor",
  "structure.bakery": "bakery",
  "structure.farmhouse": "farmhouse",
  "structure.barn": "barn",
  "structure.stall": "stall",
  "structure.fountain": "fountain",
  "structure.cave_mouth": "cavemouth",
  "structure.mine_shaft": "mineshaft",
  "structure.stone_circle": "stonecircle",
  "structure.den": "den",
  "structure.crypt": "crypt",
  "structure.ruin": "ruin",
  "structure.giant_skeleton": "giantskeleton",
};

/** WorldForge semantic prop keys -> package prop species names. */
const PROP_NAME: { readonly [key: string]: string } = {
  "prop.oak": "oak",
  "prop.birch": "birch",
  "prop.pine": "pine",
  "prop.willow": "willow",
  "prop.dead_tree": "deadtree",
  "prop.fruit_tree": "fruittree",
  "prop.stump": "stump",
  "prop.fallen_log": "fallenlog",
  "prop.boulder": "boulder",
  "prop.rock_outcrop": "rockoutcrop",
  "prop.bush": "bush",
  "prop.flowers": "flowers",
  "prop.sapling": "sapling",
  "prop.mushrooms": "mushrooms",
  "prop.ferns": "ferns",
  "prop.snow_shrub": "snowshrub",
  "prop.desert_shrub": "desertshrub",
  "prop.roots": "roots",
  "prop.reeds": "reeds",
  "prop.cattails": "cattails",
  "prop.milestone": "milestone",
  "prop.signpost": "signpost",
  "prop.rowboat": "rowboat",
  "prop.fishnets": "fishnets",
  "prop.buoy": "buoy",
  "prop.campfire": "campfire",
  "prop.bedroll": "bedroll",
  "prop.game_rack": "gamerack",
  "prop.log_pile": "logpile",
  "prop.standing_stone": "standingstone",
  "prop.runestone": "runestone",
  "prop.broken_wagon": "brokenwagon",
  "prop.bone_pile": "bonepile",
  "prop.altar": "altar",
  "prop.brazier": "brazier",
  "prop.gravestones": "gravestones",
  "prop.lone_grave": "lonegrave",
  "prop.mine_cart": "minecart",
  "prop.ore_vein": "orevein",
  "prop.watchfire": "watchfire",
  "prop.skull_pole": "skullpole",
  "prop.loot_pile": "lootpile",
  "prop.spikes": "spikes",
  "prop.banner": "banner",
};

/** WorldForge crop keys -> package crop names. */
const CROP_NAME: { readonly [key: string]: string } = {
  "crop.wheat": "wheat",
  "crop.pumpkin": "pumpkin",
  "crop.corn": "corn",
};

/** WorldForge fence/pier keys -> package family keys. */
const FENCE_NAME: { readonly [key: string]: string } = {
  "fence.pen": "penfence",
  "fence.iron": "ironfence",
};
const PIER_NAME: { readonly [key: string]: string } = { "pier.pier": "pier" };

/** WorldForge semantic decal keys -> package decal family keys. */
const DECAL_NAME: { readonly [key: string]: string } = {
  "decal.leaves": "leaves",
  "decal.puddles": "puddles",
  "decal.lilypads": "lilypads",
  "decal.driftwood": "driftwood",
  "decal.rubble": "rubble",
  "decal.crater": "crater",
  "decal.arrows": "arrows",
  "decal.battle_gear": "battlegear",
};

/** Matches the package map-data.json schema exactly: layers at top level. */
export interface TileForgeMapData {
  readonly mapW: number;
  readonly mapH: number;
  readonly mat: readonly number[];
  readonly road: readonly number[];
  readonly fence: readonly number[];
  readonly wall: readonly number[];
  readonly river: readonly number[];
  readonly moss: readonly number[];
  readonly tall: readonly number[];
  readonly pier: readonly number[];
  readonly decal: readonly number[];
  readonly prop: readonly number[];
  readonly crop: readonly number[];
  readonly meta: readonly number[];
  readonly elev: readonly number[];
  readonly ramp: readonly number[];
}

export interface ResolveDiagnostics {
  readonly packageId: string;
  readonly adapterNotes: readonly string[];
  readonly unresolvedKeys: readonly string[];
  readonly materialCells: Readonly<Record<string, number>>;
  readonly metaCells: number;
  readonly wallCells: number;
  readonly fordDecals: number;
  readonly bridgeStructures: number;
  readonly dirtPathCells: number;
  readonly propCells: number;
  readonly decorationDecals: number;
  readonly overlayCells: number;
  readonly cropCells: number;
  readonly pierCells: number;
}

export interface ResolvedWorld {
  readonly mapData: TileForgeMapData;
  readonly diagnostics: ResolveDiagnostics;
}

export function resolveToTileForge(composed: ComposedWorld): ResolvedWorld {
  const { lock, manifest } = loadPinnedManifest();
  const { width, height, grid } = composed;
  const cellCount = width * height;

  const unresolved = new Set<string>();
  const materialIds = new Array<number>(WORLD_PALETTE.length).fill(-1);
  for (let index = 0; index < WORLD_PALETTE.length; index += 1) {
    const familyKey = MATERIAL_FAMILY[WORLD_PALETTE[index] as PaletteKey];
    const id = manifest.materialIdByKey.get(familyKey);
    if (id === undefined) {
      unresolved.add(`${WORLD_PALETTE[index]} -> ${familyKey}`);
    } else {
      materialIds[index] = id;
    }
  }

  const zeros = (): number[] => new Array<number>(cellCount).fill(0);
  const mat = new Array<number>(cellCount);
  const road = zeros();
  const wall = zeros();
  const river = zeros();
  const decal = zeros();
  const meta = zeros();
  const prop = zeros();
  const moss = zeros();
  const tall = zeros();

  // Decoration (stage 1): semantic prop/decal keys resolve through the
  // manifest tables; overlays pass through as flags.
  const propIds = new Array<number>(DECOR_TYPES_LIST.length).fill(-1);
  for (let index = 0; index < DECOR_TYPES_LIST.length; index += 1) {
    const key = DECOR_TYPES_LIST[index] as string;
    const name = PROP_NAME[key];
    const id = name === undefined ? undefined : manifest.propIdByName.get(name);
    if (id === undefined) {
      unresolved.add(`${key} -> ${name ?? "?"}`);
    } else {
      propIds[index] = id;
    }
  }
  const decalIds = new Array<number>(DECAL_TYPES_LIST.length).fill(-1);
  for (let index = 0; index < DECAL_TYPES_LIST.length; index += 1) {
    const key = DECAL_TYPES_LIST[index] as string;
    const name = DECAL_NAME[key];
    const id = name === undefined ? undefined : manifest.decalIdByKey.get(name);
    if (id === undefined) {
      unresolved.add(`${key} -> ${name ?? "?"}`);
    } else {
      decalIds[index] = id;
    }
  }
  let propCells = 0;
  let decorationDecals = 0;
  for (let index = 0; index < cellCount; index += 1) {
    const propValue = composed.decoration.propLayer[index] as number;
    if (propValue !== 0) {
      const id = propIds[propValue - 1] as number;
      if (id >= 0) {
        prop[index] = id;
        propCells += 1;
      }
    }
    const decalValue = composed.decoration.decalLayer[index] as number;
    if (decalValue !== 0) {
      const id = decalIds[decalValue - 1] as number;
      if (id >= 0) {
        decal[index] = id;
        decorationDecals += 1;
      }
    }
    moss[index] = composed.decoration.mossLayer[index] as number;
    tall[index] = composed.decoration.tallGrassLayer[index] as number;
  }

  // Farms and piers (stage 3): crop bytes remap through mappings.crops;
  // fence/pier bytes through their type tables.
  const crop = zeros();
  const fence = zeros();
  const pier = zeros();
  const cropPackageIds = CROP_TYPES_LIST.map((key) => {
    const name = CROP_NAME[key as string];
    const id = name === undefined ? undefined : manifest.cropIdByName.get(name);
    if (id === undefined) {
      unresolved.add(`${key} -> ${name ?? "?"}`);
      return -1;
    }
    return id;
  });
  const fencePackageTypes = FENCE_TYPES_LIST.map((key) => {
    const name = FENCE_NAME[key as string];
    const id = name === undefined ? undefined : manifest.fenceTypeByKey.get(name);
    if (id === undefined) {
      unresolved.add(`${key} -> ${name ?? "?"}`);
      return -1;
    }
    return id;
  });
  const pierPackageTypes = PIER_TYPES_LIST.map((key) => {
    const name = PIER_NAME[key as string];
    const id = name === undefined ? undefined : manifest.pierTypeByKey.get(name);
    if (id === undefined) {
      unresolved.add(`${key} -> ${name ?? "?"}`);
      return -1;
    }
    return id;
  });
  let cropCells = 0;
  let pierCellCount = 0;
  for (let index = 0; index < cellCount; index += 1) {
    const cropValue = composed.farms.cropLayer[index] as number;
    if (cropValue !== 0) {
      const packageId = cropPackageIds[(cropValue >> 4) - 1] ?? -1;
      if (packageId >= 0) {
        crop[index] = packageId * 16 + (cropValue % 16);
        cropCells += 1;
      }
    }
    const fenceValue = composed.farms.fenceLayer[index] as number;
    if (fenceValue !== 0) {
      const packageType = fencePackageTypes[fenceValue - 1] ?? -1;
      if (packageType >= 0) fence[index] = packageType;
    }
    const pierValue = composed.farms.pierLayer[index] as number;
    if (pierValue !== 0) {
      const packageType = pierPackageTypes[pierValue - 1] ?? -1;
      if (packageType >= 0) {
        pier[index] = packageType;
        pierCellCount += 1;
      }
    }
  }

  const materialCells: Record<string, number> = {};
  for (let index = 0; index < cellCount; index += 1) {
    const paletteIndex = grid[index] as number;
    mat[index] = materialIds[paletteIndex] as number;
    const key = WORLD_PALETTE[paletteIndex] as string;
    materialCells[key] = (materialCells[key] ?? 0) + 1;
    if (composed.routesResult.pathLayer[index] === 1) {
      road[index] = manifest.roadTypeByKey.get("dirtpath") ?? 0;
    }
    // The FULL two-tier river network: W4 places fords on crossing-tier
    // river cells, and the package's ford substrate rule (water/shallow/
    // river only) demands those cells render as river runs. The artifact's
    // own river layer stays majors-only; this is adapter emission.
    if (composed.hydro.isRiver[index] === 1) {
      river[index] = 1;
    }
  }

  const notes: string[] = [
    "elev emitted flat (level 0): WorldForge cliff/ramp integration is a later milestone",
    "fortress gate emitted as a wall-layer opening (package gate structure is 3x2)",
  ];

  // Wall-painting structures: fortress walls are stone city wall (type 1),
  // bandit-camp palisades are the palisade family (type 2); gates stay open.
  const stoneWallType = manifest.wallTypeByKey.get("wall") ?? 1;
  const palisadeType = manifest.wallTypeByKey.get("palisade") ?? 2;
  const gateValue = 1; // structure.fortress_gate in STRUCTURE_TYPES order
  const wallValue = 2; // structure.fortress_wall
  const campWallValue = RESOLVED_STRUCTURE_TYPES.indexOf("structure.camp_wall") + 1;
  let wallCells = 0;
  for (let index = 0; index < cellCount; index += 1) {
    const structure = composed.structureLayer[index] as number;
    if (structure === wallValue) {
      wall[index] = stoneWallType;
      wallCells += 1;
    } else if (structure === campWallValue) {
      wall[index] = palisadeType;
      wallCells += 1;
    }
  }

  // Planner structures -> meta codes (type*256 + row-major cellIndex).
  let metaCells = 0;
  for (const plan of composed.settlementPlans) {
    for (const structure of plan.structures) {
      const name = STRUCTURE_NAME[structure.type];
      const entry = name === undefined ? undefined : manifest.structureByName.get(name);
      if (entry === undefined) {
        unresolved.add(`${structure.type} -> ${name ?? "?"}`);
        continue;
      }
      if (entry.def.w !== structure.width || entry.def.h !== structure.height) {
        unresolved.add(
          `${structure.type}: footprint ${structure.width}x${structure.height} != package ${entry.def.w}x${entry.def.h}`,
        );
        continue;
      }
      for (let sy = 0; sy < structure.height; sy += 1) {
        for (let sx = 0; sx < structure.width; sx += 1) {
          const cell = (structure.y + sy) * width + structure.x + sx;
          meta[cell] = entry.id * 256 + sy * structure.width + sx;
          metaCells += 1;
        }
      }
    }
  }

  // Structure-bearing POIs (phase B) emit meta codes exactly like planner
  // structures: full atomic footprints, package-validated dimensions.
  for (const poi of composed.pois) {
    if (poi.structure === undefined) continue;
    const name = STRUCTURE_NAME[poi.structure.type];
    const entry = name === undefined ? undefined : manifest.structureByName.get(name);
    if (entry === undefined) {
      unresolved.add(`${poi.structure.type} -> ${name ?? "?"}`);
      continue;
    }
    if (entry.def.w !== poi.structure.w || entry.def.h !== poi.structure.h) {
      unresolved.add(
        `${poi.structure.type}: footprint ${poi.structure.w}x${poi.structure.h} != package ${entry.def.w}x${entry.def.h}`,
      );
      continue;
    }
    for (let sy = 0; sy < poi.structure.h; sy += 1) {
      for (let sx = 0; sx < poi.structure.w; sx += 1) {
        const cell = (poi.structure.y + sy) * width + poi.structure.x + sx;
        meta[cell] = entry.id * 256 + sy * poi.structure.w + sx;
        metaCells += 1;
      }
    }
  }

  // Crossings: fords are decal 15 on water/river; bridges are metatiles
  // oriented across the river run (stone for highways, wood otherwise).
  const fordId = manifest.decalIdByKey.get("ford");
  let fordDecals = 0;
  // Street-level crossings, computed once in composition (single source of
  // truth): without a ford the §3 ladder blocks the cell and the street
  // severs. Crossings out-rank decoration decals.
  for (const cell of composed.streetFordCells) {
    if (fordId === undefined) {
      unresolved.add("crossing.street_ford -> decal ford");
      break;
    }
    decal[cell] = fordId;
    fordDecals += 1;
  }
  let bridgeStructures = 0;
  for (const route of composed.routesResult.routes) {
    for (const crossing of route.crossings) {
      if (crossing.kind === "ford") {
        if (fordId === undefined) {
          unresolved.add("crossing.ford -> decal ford");
        } else {
          // Crossings out-rank decoration decals (one decal per cell).
          decal[crossing.cell] = fordId;
          fordDecals += 1;
        }
        continue;
      }
      const bridge = placeBridge(crossing.cell, route.routeClass === "highway", composed, manifest, meta, width, height);
      if (bridge === null) {
        unresolved.add("crossing.bridge -> wbridge/sbridge");
      } else {
        bridgeStructures += 1;
      }
    }
  }

  let dirtPathCells = 0;
  for (const value of road) {
    if (value !== 0) dirtPathCells += 1;
  }

  const mapData: TileForgeMapData = {
    mapW: width,
    mapH: height,
    mat,
    road,
    fence,
    wall,
    river,
    moss,
    tall,
    pier,
    decal,
    prop,
    crop,
    meta,
    elev: zeros(),
    ramp: zeros(),
  };

  return {
    mapData,
    diagnostics: {
      packageId: lock.packageId,
      adapterNotes: notes,
      unresolvedKeys: [...unresolved].sort(),
      materialCells,
      metaCells,
      wallCells,
      fordDecals,
      bridgeStructures,
      dirtPathCells,
      propCells,
      decorationDecals,
      overlayCells: composed.decoration.overlayCount,
      cropCells,
      pierCells: pierCellCount,
    },
  };
}

/** A bridge spans the river cell perpendicular to the river's local run. */
function placeBridge(
  cell: number,
  stone: boolean,
  composed: ComposedWorld,
  manifest: TileForgeManifest,
  meta: number[],
  width: number,
  height: number,
): number | null {
  const x = cell % width;
  const y = (cell - x) / width;
  const riverAt = (nx: number, ny: number): boolean =>
    nx >= 0 && ny >= 0 && nx < width && ny < height &&
    (composed.hydro.isRiver[ny * width + nx] === 1 || composed.hydro.waterKind[ny * width + nx] !== WATER_NONE);
  const riverVertical = riverAt(x, y - 1) || riverAt(x, y + 1);
  // A vertical river needs a horizontal (3x1) bridge and vice versa.
  const name = riverVertical ? (stone ? "sbridge" : "wbridge") : (stone ? "sbridgev" : "wbridgev");
  const entry = manifest.structureByName.get(name);
  if (entry === undefined) {
    return null;
  }
  const originX = riverVertical ? x - 1 : x;
  const originY = riverVertical ? y : y - 1;
  if (originX < 0 || originY < 0 || originX + entry.def.w > width || originY + entry.def.h > height) {
    return null;
  }
  for (let sy = 0; sy < entry.def.h; sy += 1) {
    for (let sx = 0; sx < entry.def.w; sx += 1) {
      const target = (originY + sy) * width + originX + sx;
      if (meta[target] === 0) {
        meta[target] = entry.id * 256 + sy * entry.def.w + sx;
      }
    }
  }
  return entry.id;
}

export { STRUCTURE_NAME, MATERIAL_FAMILY };
export const RESOLVED_STRUCTURE_TYPES = STRUCTURE_TYPES;
