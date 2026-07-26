import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { canonicalSha256 } from "../core/identity.js";
import {
  GENERATOR_BEHAVIOR_VERSION,
  GENERATOR_NAME,
  GENERATOR_VERSION,
  RECIPE_COMPILER_VERSION,
  RULE_PACK_VERSIONS,
} from "../core/version.js";
import type { ClimatePreset, NormalizedWorldRecipe, SizePreset } from "./schema.js";

/**
 * RecipeCompiler v1 (docs/ARCHITECTURE_AND_CONTRACTS.md, "Recipe and resolved
 * configuration contract"): expands presets through the pinned rule packs into
 * fully explicit generator parameters. The output is derived data — hashed for
 * verification, never independently authored.
 */

/** recipe.presets rule pack, version 1. Values are explicit and versioned. */
const SIZE_RULES: { readonly [key in SizePreset]: WorldDimensions } = {
  tiny: { width: 64, height: 64, chunkWidth: 16, chunkHeight: 16 },
  small: { width: 256, height: 256, chunkWidth: 32, chunkHeight: 32 },
};

const CLIMATE_RULES: { readonly [key in ClimatePreset]: ClimateBase } = {
  temperate: {
    baseTemperaturePermille: 0,
    baseMoisturePermille: 0,
    coastalInfluencePermille: 0,
  },
  cold_coastal: {
    // Offsets shift the tight fbm bell (p50 ≈ 470) without saturating one
    // class; tuned against measured percentiles during W2 review.
    // W4 iteration: warmed so snow concentrates on peaks and the far
    // north (target 15-25% snow+rock in mid-map seeds, measured).
    baseTemperaturePermille: -60,
    baseMoisturePermille: 80,
    coastalInfluencePermille: 500,
  },
};

interface WorldDimensions {
  readonly width: number;
  readonly height: number;
  readonly chunkWidth: number;
  readonly chunkHeight: number;
}

interface ClimateBase {
  readonly baseTemperaturePermille: number;
  readonly baseMoisturePermille: number;
  readonly coastalInfluencePermille: number;
}

export interface MacroFieldSpec {
  readonly octaves: ReadonlyArray<{ readonly cellSizeLog2: number; readonly weightPermille: number }>;
  /** Added to every sample before clamping to [0, 999]. */
  readonly offsetPermille: number;
  /** North-south gradient strength (positive = higher in the north). */
  readonly northGradientPermille: number;
}

export interface WaterRules {
  /** Cells at or below this (filled) elevation flood when reachable. */
  readonly seaLevelPermille: number;
  /** Water within this band below the surface renders/classifies shallow. */
  readonly shallowBandPermille: number;
  /** Flow-accumulation count at which a cell joins the internal river
   *  network (kept queryable for W4 crossing candidates). */
  readonly riverAccumulationThreshold: number;
  /** Higher threshold for the artifact/debug river layer, so maps read as a
   *  few coherent rivers instead of drainage veins. */
  readonly majorRiverAccumulationThreshold: number;
  /** Wetland (swamp) needs at least this moisture beside water. */
  readonly wetlandMoistureMin: number;
  /** Coastal moisture halo radius in cells (uses climate coastalInfluence). */
  readonly coastalInfluenceRadius: number;
}

export interface RouteRules {
  readonly stepCost: number;
  /** Added per permille of |filled elevation delta| between cells. */
  readonly slopeCostPerPermille: number;
  readonly networkRiverCrossCost: number;
  readonly majorRiverCrossCost: number;
  readonly shallowWaterCrossCost: number;
  readonly minDestinationSpacing: number;
  readonly streetWidth: number;
  readonly highwayWidth: number;
  /** Route length over Chebyshev distance beyond this ratio warns. */
  readonly detourWarnRatioPermille: number;
  /** Cells within this distance of the world border cost extra to enter. */
  readonly edgePenaltyRadius: number;
  /** Maximum extra cost at the border itself, tapering to 0 at the radius. */
  readonly edgePenaltyCost: number;
}

export interface SettlementRules {
  /** The capital (settlements.plans v5): rank 0 becomes the one city. */
  readonly cityRadius: number;
  readonly cityLots: number;
  readonly cityPlazaRadius: number;
  readonly cityStreetArmLength: number;
  /** Chebyshev radius of the city ring road; 0 disables it. */
  readonly cityRingRadius: number;
  /** Ranks 1..townCount are towns; later ranks are outposts. */
  readonly townCount: number;
  readonly townRadius: number;
  readonly outpostRadius: number;
  readonly townLots: number;
  readonly outpostLots: number;
  /**
   * Longest carved approach from a structure entrance to a street. Short on
   * purpose (settlements.plans v4): buildings must sit close to the plaza or
   * a street arm, which is what makes a town read as connected fabric.
   */
  readonly approachMaxLength: number;
  readonly townPlazaRadius: number;
  readonly outpostPlazaRadius: number;
  /** Street arms radiate from the plaza and buildings line them. */
  readonly streetArmLength: number;
}

export interface LandmarkSpec {
  readonly type: string;
  readonly relation: string | null;
}

export interface BiomeRules {
  /** Regions smaller than this merge into a neighbor during smoothing. */
  readonly minRegionCells: number;
  /** Bounded smoothing iterations (docs/GENERATION_RULES.md, performance). */
  readonly smoothingPasses: number;
  /** Scattered rocky knolls (macro.biomes 3): midland texture, dungeon anchors. */
  readonly knollCount: number;
  readonly thresholds: {
    readonly rockElevationMin: number;
    readonly snowTemperatureMax: number;
    readonly mudMoistureMin: number;
    readonly mudElevationMax: number;
    readonly dryMoistureMax: number;
    readonly dryTemperatureMin: number;
  };
}

export interface TileForgeDependency {
  readonly packageId: string;
  readonly packageSha256: string;
  readonly manifestSha256: string;
}

export interface ResolvedWorldConfig {
  readonly resolvedConfigFormat: 8;
  readonly recipeCompilerVersion: number;
  readonly generatorBehaviorVersion: number;
  readonly rulePackVersions: { readonly [name: string]: number };
  readonly seed: number;
  readonly world: WorldDimensions;
  readonly climate: ClimateBase & {
    readonly northElevationBiasPermille: number;
    readonly temperatureBiasPermille: number;
    readonly moistureBiasPermille: number;
  };
  readonly macroFields: {
    readonly elevation: MacroFieldSpec;
    readonly moisture: MacroFieldSpec;
    readonly temperature: MacroFieldSpec;
    /** Snow-elevation coupling: temperature drop above the start elevation. */
    readonly temperatureLapse: {
      readonly startElevationPermille: number;
      readonly strengthPermille: number;
    };
  };
  readonly water: WaterRules;
  readonly routes: RouteRules;
  readonly settlements: SettlementRules;
  /** One spec per landmark budget slot; unspecified slots default. */
  readonly landmarkSpecs: readonly LandmarkSpec[];
  readonly biomes: BiomeRules;
  readonly budgets: NormalizedWorldRecipe["budgets"];
  /**
   * Decoration: ambient density (0 disables) and the wilderness POI budget
   * (decoration.pois rule pack; size-scaled, not yet recipe vocabulary).
   */
  readonly decoration: { readonly densityPermille: number; readonly poiCount: number };
  /** Named generation passes enabled at this behavior version. */
  readonly passes: readonly string[];
  /** Pinned package identity from tileforge.lock.json (null if absent). */
  readonly dependencies: { readonly tileforge: TileForgeDependency | null };
}

/**
 * macro.fields rule pack v2: octave layouts per size preset. The largest
 * octave spans half the map and carries most of the weight so each world
 * reads as one dominant landform (standing W2-acceptance review criterion),
 * with smaller octaves adding detail rather than competing shapes.
 */
const OCTAVE_RULES: { readonly [key in SizePreset]: MacroFieldSpec["octaves"] } = {
  tiny: [
    { cellSizeLog2: 6, weightPermille: 430 },
    { cellSizeLog2: 5, weightPermille: 290 },
    { cellSizeLog2: 4, weightPermille: 140 },
    { cellSizeLog2: 3, weightPermille: 80 },
    { cellSizeLog2: 2, weightPermille: 60 },
  ],
  small: [
    { cellSizeLog2: 7, weightPermille: 430 },
    { cellSizeLog2: 6, weightPermille: 290 },
    { cellSizeLog2: 5, weightPermille: 140 },
    { cellSizeLog2: 4, weightPermille: 80 },
    { cellSizeLog2: 3, weightPermille: 60 },
  ],
};

/** hydrology.water rule pack v1: water levels and thresholds per preset. */
const WATER_RULES: {
  readonly [key in ClimatePreset]: { readonly [size in SizePreset]: WaterRules };
} = {
  temperate: {
    tiny: {
      seaLevelPermille: 310,
      shallowBandPermille: 45,
      riverAccumulationThreshold: 48,
      majorRiverAccumulationThreshold: 100,
      wetlandMoistureMin: 560,
      coastalInfluenceRadius: 8,
    },
    small: {
      seaLevelPermille: 310,
      shallowBandPermille: 45,
      riverAccumulationThreshold: 320,
      majorRiverAccumulationThreshold: 800,
      wetlandMoistureMin: 560,
      coastalInfluenceRadius: 16,
    },
  },
  cold_coastal: {
    tiny: {
      seaLevelPermille: 370,
      shallowBandPermille: 45,
      riverAccumulationThreshold: 48,
      majorRiverAccumulationThreshold: 100,
      wetlandMoistureMin: 560,
      coastalInfluenceRadius: 8,
    },
    small: {
      seaLevelPermille: 370,
      shallowBandPermille: 45,
      riverAccumulationThreshold: 320,
      majorRiverAccumulationThreshold: 800,
      wetlandMoistureMin: 560,
      coastalInfluenceRadius: 16,
    },
  },
};

/** macro.fields rule pack v2: snow-elevation coupling (W3 acceptance brief). */
const TEMPERATURE_LAPSE = { startElevationPermille: 640, strengthPermille: 700 };

/** routes.graph rule pack v1: costs, widths, spacing per size preset. */
const ROUTE_RULES: { readonly [key in SizePreset]: RouteRules } = {
  tiny: {
    stepCost: 10,
    slopeCostPerPermille: 1,
    networkRiverCrossCost: 70,
    majorRiverCrossCost: 120,
    shallowWaterCrossCost: 160,
    minDestinationSpacing: 12,
    streetWidth: 2,
    highwayWidth: 3,
    detourWarnRatioPermille: 1800,
    edgePenaltyRadius: 6,
    edgePenaltyCost: 40,
  },
  small: {
    stepCost: 10,
    slopeCostPerPermille: 1,
    networkRiverCrossCost: 70,
    majorRiverCrossCost: 120,
    shallowWaterCrossCost: 160,
    minDestinationSpacing: 28,
    streetWidth: 2,
    highwayWidth: 3,
    detourWarnRatioPermille: 1800,
    edgePenaltyRadius: 12,
    edgePenaltyCost: 40,
  },
};

/**
 * settlements.plans rule pack v5: three-tier settlement geometry per size
 * preset. Rank 0 is the capital city, ranks 1..townCount towns, the rest
 * outposts — grown lots all around so the hierarchy reads at a glance.
 */
const SETTLEMENT_RULES: { readonly [key in SizePreset]: SettlementRules } = {
  tiny: {
    // Tiny worlds stay cramped: the city keeps the old town street reach
    // (plaza 2 + arms 9) so near_town landmarks remain satisfiable, and
    // grows through lots and the ring road instead of sprawl.
    cityRadius: 14, cityLots: 22, cityPlazaRadius: 2, cityStreetArmLength: 9,
    cityRingRadius: 6, townCount: 1,
    townRadius: 12, outpostRadius: 7, townLots: 14, outpostLots: 6,
    approachMaxLength: 8, townPlazaRadius: 2, outpostPlazaRadius: 1, streetArmLength: 9,
  },
  small: {
    cityRadius: 26, cityLots: 64, cityPlazaRadius: 4, cityStreetArmLength: 20,
    cityRingRadius: 11, townCount: 3,
    townRadius: 20, outpostRadius: 10, townLots: 34, outpostLots: 9,
    approachMaxLength: 8, townPlazaRadius: 3, outpostPlazaRadius: 1, streetArmLength: 14,
  },
};

/** macro.biomes rule pack v1: thresholds and region limits per size preset. */
const BIOME_RULES: { readonly [key in SizePreset]: BiomeRules } = {
  tiny: {
    minRegionCells: 12,
    smoothingPasses: 8,
    knollCount: 8,
    thresholds: {
      rockElevationMin: 650,
      snowTemperatureMax: 320,
      mudMoistureMin: 600,
      mudElevationMax: 500,
      dryMoistureMax: 375,
      dryTemperatureMin: 460,
    },
  },
  small: {
    minRegionCells: 80,
    smoothingPasses: 8,
    knollCount: 18,
    thresholds: {
      rockElevationMin: 650,
      snowTemperatureMax: 320,
      mudMoistureMin: 600,
      mudElevationMax: 500,
      dryMoistureMax: 375,
      dryTemperatureMin: 460,
    },
  },
};

export function compileRecipe(normalized: NormalizedWorldRecipe): ResolvedWorldConfig {
  const size = SIZE_RULES[normalized.world.sizePreset];
  const climate = CLIMATE_RULES[normalized.world.climatePreset];
  const octaves = OCTAVE_RULES[normalized.world.sizePreset];
  return {
    resolvedConfigFormat: 8,
    recipeCompilerVersion: RECIPE_COMPILER_VERSION,
    generatorBehaviorVersion: GENERATOR_BEHAVIOR_VERSION,
    rulePackVersions: RULE_PACK_VERSIONS,
    seed: normalized.seed,
    world: size,
    climate: {
      ...climate,
      northElevationBiasPermille: normalized.biases.northElevationPermille,
      temperatureBiasPermille: normalized.biases.temperaturePermille,
      moistureBiasPermille: normalized.biases.moisturePermille,
    },
    macroFields: {
      elevation: {
        octaves,
        offsetPermille: 0,
        northGradientPermille: normalized.biases.northElevationPermille,
      },
      moisture: {
        octaves,
        offsetPermille: climate.baseMoisturePermille + normalized.biases.moisturePermille,
        northGradientPermille: 0,
      },
      temperature: {
        octaves,
        offsetPermille: climate.baseTemperaturePermille + normalized.biases.temperaturePermille,
        northGradientPermille: 0,
      },
      temperatureLapse: TEMPERATURE_LAPSE,
    },
    water: WATER_RULES[normalized.world.climatePreset][normalized.world.sizePreset],
    routes: ROUTE_RULES[normalized.world.sizePreset],
    settlements: SETTLEMENT_RULES[normalized.world.sizePreset],
    landmarkSpecs: Array.from({ length: normalized.budgets.landmarkCount }, (_, slot) => {
      const spec = normalized.landmarks[slot];
      return spec === undefined ? { type: "ancient_fortress", relation: null } : spec;
    }),
    biomes: BIOME_RULES[normalized.world.sizePreset],
    budgets: normalized.budgets,
    decoration: {
      densityPermille: normalized.decoration.densityPermille,
      poiCount: normalized.world.sizePreset === "tiny" ? 16 : 64,
    },
    passes: ["macro.fields", "hydrology.water", "regions.biomes", "routes.graph", "settlements.plans", "landmarks.stamps", "decoration.props", "adapter.tileforge"],
    dependencies: { tileforge: pinnedTileForgeDependency() },
  };
}

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
let cachedDependency: TileForgeDependency | null | undefined;

/**
 * The dependency lock is authoritative for package identity (docs/AGENTS.md).
 * Read once; a missing lock resolves to null (adapter stages then refuse).
 */
function pinnedTileForgeDependency(): TileForgeDependency | null {
  if (cachedDependency === undefined) {
    const lockPath = join(REPO_ROOT, "tileforge.lock.json");
    if (!existsSync(lockPath)) {
      cachedDependency = null;
    } else {
      const lock = JSON.parse(readFileSync(lockPath, "utf8")) as {
        packageId: string;
        packageSha256: string;
        manifestSha256: string;
      };
      cachedDependency = {
        packageId: lock.packageId,
        packageSha256: lock.packageSha256,
        manifestSha256: lock.manifestSha256,
      };
    }
  }
  return cachedDependency;
}

export function resolvedConfigIdentity(config: ResolvedWorldConfig): string {
  return canonicalSha256(config);
}

/**
 * Generation identity (docs/ARCHITECTURE_AND_CONTRACTS.md): normalized recipe
 * (which contains the seed) + compiler version + generator version + rule-pack
 * versions + pinned dependency identities. The resolved-config hash is derived
 * verification, not an identity input.
 */
export function generationIdentity(
  normalized: NormalizedWorldRecipe,
  config: ResolvedWorldConfig,
): string {
  return canonicalSha256({
    dependencies: config.dependencies,
    generatorBehaviorVersion: GENERATOR_BEHAVIOR_VERSION,
    generatorName: GENERATOR_NAME,
    generatorVersion: GENERATOR_VERSION,
    normalizedRecipe: normalized,
    recipeCompilerVersion: RECIPE_COMPILER_VERSION,
    rulePackVersions: RULE_PACK_VERSIONS,
  });
}
