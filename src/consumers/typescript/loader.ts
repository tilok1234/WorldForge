/**
 * WorldForge public TypeScript loader (Milestone W8).
 *
 * The second official consumer lane: a typed, validating reader for the
 * engine-neutral world artifact (format 7). TypeScript games depend on THIS
 * module (or the artifact schema), never on generator internals — this file
 * deliberately imports nothing outside its own directory, and the parity
 * fixture enforces both that boundary and semantic agreement with the
 * TileForge-resolved walkability the Godot consumer enforces in-engine.
 *
 * The walkability tables here are the public world-model contract (mirroring
 * the pinned package's §3 ladder in semantic terms); tests/parity.test.ts
 * proves them cell-identical to the resolved ladder on generated worlds.
 */

export const SUPPORTED_ARTIFACT_FORMAT = 7;

export interface LoaderIssue {
  readonly path: string;
  readonly message: string;
}

export interface ExpectedTileForgeDependency {
  readonly packageId?: string;
  readonly packageSha256?: string;
  readonly manifestSha256?: string;
}

export interface LoadOptions {
  /** When given, the artifact's pinned TileForge identity must match. */
  readonly expectTileForge?: ExpectedTileForgeDependency;
}

export interface ArtifactGenerator {
  readonly name: string;
  readonly version: string;
  readonly seed: number;
  readonly generatorBehaviorVersion: number;
  readonly recipeCompilerVersion: number;
  readonly recipeSha256: string;
  readonly resolvedConfigSha256: string;
  readonly generationIdentitySha256: string;
}

export interface ArtifactDimensions {
  readonly width: number;
  readonly height: number;
  readonly chunkWidth: number;
  readonly chunkHeight: number;
}

export interface RouteCrossing {
  readonly cell: readonly [number, number];
  readonly kind: string;
}

export interface WorldRoute {
  readonly id: number;
  readonly routeClass: string;
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly length: number;
  readonly crossings: readonly RouteCrossing[];
}

export interface WorldDestination {
  readonly id: number;
  readonly kind: string;
  readonly cell: readonly [number, number];
}

interface RawChunk {
  readonly coord: readonly [number, number];
  readonly layers: Readonly<Record<string, readonly (readonly number[])[]>>;
}

interface RawArtifact {
  readonly formatVersion: number;
  readonly generator: ArtifactGenerator;
  readonly dimensions: ArtifactDimensions;
  readonly dependencies: {
    readonly tileforge: {
      readonly packageId: string;
      readonly packageSha256: string;
      readonly manifestSha256: string;
    } | null;
  };
  readonly semanticPalette: readonly string[];
  readonly structureTypes: readonly string[];
  readonly propTypes: readonly string[];
  readonly decalTypes: readonly string[];
  readonly cropTypes: readonly string[];
  readonly fenceTypes: readonly string[];
  readonly pierTypes: readonly string[];
  readonly destinations: readonly WorldDestination[];
  readonly routes: readonly WorldRoute[];
  readonly chunks: readonly RawChunk[];
  readonly [key: string]: unknown;
}

const CHUNK_LAYERS = [
  "material", "elevation", "river", "path", "structure", "prop",
  "moss", "tallgrass", "decal", "crop", "fence", "pier",
] as const;
type ChunkLayerName = (typeof CHUNK_LAYERS)[number];

/**
 * Materials a traveller cannot enter (public world-model contract, mirroring
 * the pinned package's family walkability). Shallow water is deliberately
 * absent: the package makes it wadeable — games read depth/wade semantics
 * from materialAt and decide their own movement costs.
 */
const BLOCKED_MATERIALS = new Set<string>([
  "water.deep",
  "terrain.rock",
  "terrain.swamp",
]);

/** Structures with a walkable footprint cell; every other structure blocks. */
const WALKABLE_STRUCTURES = new Set<string>(["structure.fortress_gate"]);

/** Prop species that block movement; unlisted species never block. */
const BLOCKING_PROPS = new Set<string>([
  "prop.oak", "prop.birch", "prop.pine", "prop.willow", "prop.dead_tree",
  "prop.fruit_tree", "prop.stump", "prop.fallen_log", "prop.boulder",
  "prop.rock_outcrop", "prop.milestone", "prop.signpost", "prop.rowboat",
  "prop.buoy",
]);

/** Corridor materials whose street grid streams must not sever. */
const CORRIDOR_MATERIALS = new Set<string>(["terrain.packed_road", "terrain.cobble"]);

export type LoadResult =
  | { readonly ok: true; readonly world: WorldHandle }
  | { readonly ok: false; readonly issues: readonly LoaderIssue[] };

export function loadWorldArtifact(input: unknown, options: LoadOptions = {}): LoadResult {
  const issues: LoaderIssue[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, issues: [{ path: "$", message: "artifact must be a JSON object" }] };
  }
  const raw = input as RawArtifact;
  if (raw.formatVersion !== SUPPORTED_ARTIFACT_FORMAT) {
    issues.push({
      path: "$.formatVersion",
      message: `unsupported artifact format ${raw.formatVersion}; this loader reads format ${SUPPORTED_ARTIFACT_FORMAT}`,
    });
  }
  const generator = raw.generator;
  if (
    generator === undefined ||
    typeof generator.generationIdentitySha256 !== "string" ||
    typeof generator.generatorBehaviorVersion !== "number" ||
    typeof generator.seed !== "number"
  ) {
    issues.push({ path: "$.generator", message: "generator identity block is incomplete" });
  }
  const dimensions = raw.dimensions;
  if (
    dimensions === undefined ||
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height) ||
    !Number.isInteger(dimensions.chunkWidth) ||
    !Number.isInteger(dimensions.chunkHeight) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width % dimensions.chunkWidth !== 0 ||
    dimensions.height % dimensions.chunkHeight !== 0
  ) {
    issues.push({ path: "$.dimensions", message: "dimensions must be chunk-divisible positive integers" });
    return { ok: false, issues };
  }

  const expected = options.expectTileForge;
  if (expected !== undefined) {
    const pinned = raw.dependencies?.tileforge ?? null;
    if (pinned === null) {
      issues.push({ path: "$.dependencies.tileforge", message: "artifact carries no TileForge identity but one was expected" });
    } else {
      for (const key of ["packageId", "packageSha256", "manifestSha256"] as const) {
        const want = expected[key];
        if (want !== undefined && pinned[key] !== want) {
          issues.push({
            path: `$.dependencies.tileforge.${key}`,
            message: `pinned ${key} ${pinned[key]} does not match expected ${want}`,
          });
        }
      }
    }
  }

  for (const table of ["semanticPalette", "structureTypes", "propTypes", "decalTypes", "cropTypes", "fenceTypes", "pierTypes"] as const) {
    if (!Array.isArray(raw[table])) {
      issues.push({ path: `$.${table}`, message: "missing key table" });
    }
  }

  const chunksAcross = dimensions.width / dimensions.chunkWidth;
  const chunksDown = dimensions.height / dimensions.chunkHeight;
  if (!Array.isArray(raw.chunks) || raw.chunks.length !== chunksAcross * chunksDown) {
    issues.push({
      path: "$.chunks",
      message: `expected ${chunksAcross * chunksDown} chunks covering the world exactly once`,
    });
  } else {
    const seen = new Set<string>();
    for (const chunk of raw.chunks) {
      const key = `${chunk.coord?.[0]},${chunk.coord?.[1]}`;
      if (seen.has(key)) {
        issues.push({ path: "$.chunks", message: `duplicate chunk ${key}` });
        break;
      }
      seen.add(key);
      for (const layer of CHUNK_LAYERS) {
        const rows = chunk.layers?.[layer];
        if (!Array.isArray(rows) || rows.length !== dimensions.chunkHeight) {
          issues.push({ path: `$.chunks[${key}].${layer}`, message: "missing or misshapen layer" });
          break;
        }
      }
      if (issues.length > 0) break;
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, world: new WorldHandle(raw) };
}

export class WorldHandle {
  readonly generator: ArtifactGenerator;
  readonly dimensions: ArtifactDimensions;
  readonly semanticPalette: readonly string[];
  readonly structureTypes: readonly string[];
  readonly propTypes: readonly string[];
  readonly decalTypes: readonly string[];
  readonly cropTypes: readonly string[];
  readonly fenceTypes: readonly string[];
  readonly pierTypes: readonly string[];
  readonly destinations: readonly WorldDestination[];
  readonly routes: readonly WorldRoute[];
  readonly tileforge: RawArtifact["dependencies"]["tileforge"];

  private readonly layers: Record<ChunkLayerName, Uint16Array>;
  private readonly crossingCells: Set<number>;

  constructor(raw: RawArtifact) {
    this.generator = raw.generator;
    this.dimensions = raw.dimensions;
    this.semanticPalette = raw.semanticPalette;
    this.structureTypes = raw.structureTypes;
    this.propTypes = raw.propTypes;
    this.decalTypes = raw.decalTypes;
    this.cropTypes = raw.cropTypes;
    this.fenceTypes = raw.fenceTypes;
    this.pierTypes = raw.pierTypes;
    this.destinations = raw.destinations;
    this.routes = raw.routes;
    this.tileforge = raw.dependencies.tileforge;

    const { width, height, chunkWidth, chunkHeight } = raw.dimensions;
    this.layers = {} as Record<ChunkLayerName, Uint16Array>;
    for (const layer of CHUNK_LAYERS) {
      this.layers[layer] = new Uint16Array(width * height);
    }
    for (const chunk of raw.chunks) {
      const originX = (chunk.coord[0] as number) * chunkWidth;
      const originY = (chunk.coord[1] as number) * chunkHeight;
      for (const layer of CHUNK_LAYERS) {
        const rows = chunk.layers[layer] as readonly (readonly number[])[];
        const flat = this.layers[layer];
        for (let ly = 0; ly < chunkHeight; ly += 1) {
          const row = rows[ly] as readonly number[];
          for (let lx = 0; lx < chunkWidth; lx += 1) {
            flat[(originY + ly) * width + originX + lx] = row[lx] as number;
          }
        }
      }
    }

    // Crossings a traveller may use: route crossings plus street fords —
    // stream cells on or between corridor materials (the same rule the
    // generator validates with and the TileForge adapter renders as fords).
    this.crossingCells = new Set<number>();
    for (const route of raw.routes) {
      for (const crossing of route.crossings) {
        this.crossingCells.add((crossing.cell[1] as number) * width + (crossing.cell[0] as number));
      }
    }
    const material = this.layers.material;
    const river = this.layers.river;
    const corridorAt = (index: number): boolean =>
      CORRIDOR_MATERIALS.has(this.semanticPalette[material[index] as number] as string);
    for (let index = 0; index < width * height; index += 1) {
      if ((river[index] as number) === 0) continue;
      const x = index % width;
      const y = (index - x) / width;
      const northSouth = y > 0 && y < height - 1 && corridorAt(index - width) && corridorAt(index + width);
      const eastWest = x > 0 && x < width - 1 && corridorAt(index - 1) && corridorAt(index + 1);
      if (corridorAt(index) || northSouth || eastWest) {
        this.crossingCells.add(index);
      }
    }
  }

  private index(x: number, y: number): number {
    const { width, height } = this.dimensions;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      throw new RangeError(`cell (${x}, ${y}) is outside the ${width}x${height} world`);
    }
    return y * width + x;
  }

  inBounds(x: number, y: number): boolean {
    const { width, height } = this.dimensions;
    return x >= 0 && y >= 0 && x < width && y < height;
  }

  layerValueAt(layer: ChunkLayerName, x: number, y: number): number {
    return this.layers[layer][this.index(x, y)] as number;
  }

  materialAt(x: number, y: number): string {
    return this.semanticPalette[this.layerValueAt("material", x, y)] as string;
  }

  elevationAt(x: number, y: number): number {
    return this.layerValueAt("elevation", x, y);
  }

  /** 0 none, 1 network stream, 2 major river. */
  riverTierAt(x: number, y: number): number {
    return this.layerValueAt("river", x, y);
  }

  trailAt(x: number, y: number): boolean {
    return this.layerValueAt("path", x, y) === 1;
  }

  structureAt(x: number, y: number): string | null {
    const value = this.layerValueAt("structure", x, y);
    return value === 0 ? null : (this.structureTypes[value - 1] as string);
  }

  propAt(x: number, y: number): string | null {
    const value = this.layerValueAt("prop", x, y);
    return value === 0 ? null : (this.propTypes[value - 1] as string);
  }

  decalAt(x: number, y: number): string | null {
    const value = this.layerValueAt("decal", x, y);
    return value === 0 ? null : (this.decalTypes[value - 1] as string);
  }

  cropAt(x: number, y: number): { readonly type: string; readonly stage: number } | null {
    const value = this.layerValueAt("crop", x, y);
    if (value === 0) return null;
    return { type: this.cropTypes[(value >> 4) - 1] as string, stage: value % 16 };
  }

  fenceAt(x: number, y: number): string | null {
    const value = this.layerValueAt("fence", x, y);
    return value === 0 ? null : (this.fenceTypes[value - 1] as string);
  }

  pierAt(x: number, y: number): string | null {
    const value = this.layerValueAt("pier", x, y);
    return value === 0 ? null : (this.pierTypes[value - 1] as string);
  }

  mossAt(x: number, y: number): boolean {
    return this.layerValueAt("moss", x, y) === 1;
  }

  tallGrassAt(x: number, y: number): boolean {
    return this.layerValueAt("tallgrass", x, y) === 1;
  }

  /**
   * The semantic walkability ladder, first hit wins — the loader-side mirror
   * of the package's §3 ladder, proven cell-identical by the parity fixture:
   * structures (gate walks, others block) → blocking props → fences →
   * trails and piers walk → crossings walk → streams block → blocked
   * materials → walkable.
   */
  walkableAt(x: number, y: number): boolean {
    const structure = this.structureAt(x, y);
    if (structure !== null) {
      return WALKABLE_STRUCTURES.has(structure);
    }
    const prop = this.propAt(x, y);
    if (prop !== null && BLOCKING_PROPS.has(prop)) {
      return false;
    }
    if (this.fenceAt(x, y) !== null) {
      return false;
    }
    if (this.trailAt(x, y) || this.pierAt(x, y) !== null) {
      return true;
    }
    if (this.crossingCells.has(this.index(x, y))) {
      return true;
    }
    if (this.riverTierAt(x, y) > 0) {
      return false;
    }
    return !BLOCKED_MATERIALS.has(this.materialAt(x, y));
  }

  chunkAt(chunkX: number, chunkY: number): {
    readonly coord: readonly [number, number];
    readonly originX: number;
    readonly originY: number;
    readonly width: number;
    readonly height: number;
  } {
    const { chunkWidth, chunkHeight, width, height } = this.dimensions;
    const across = width / chunkWidth;
    const down = height / chunkHeight;
    if (chunkX < 0 || chunkY < 0 || chunkX >= across || chunkY >= down) {
      throw new RangeError(`chunk (${chunkX}, ${chunkY}) outside ${across}x${down}`);
    }
    return {
      coord: [chunkX, chunkY],
      originX: chunkX * chunkWidth,
      originY: chunkY * chunkHeight,
      width: chunkWidth,
      height: chunkHeight,
    };
  }

  /** Stamp for consumer-specific derived caches (W8 exit criterion). */
  cacheStamp(adapterName: string, adapterVersion: number | string): {
    readonly baseGenerationIdentitySha256: string;
    readonly baseArtifactFormat: number;
    readonly adapterName: string;
    readonly adapterVersion: number | string;
  } {
    return {
      baseGenerationIdentitySha256: this.generator.generationIdentitySha256,
      baseArtifactFormat: SUPPORTED_ARTIFACT_FORMAT,
      adapterName,
      adapterVersion,
    };
  }
}
