import { ARTIFACT_FORMAT_VERSION, type WorldArtifact } from "../generation/generate.js";
import { SEED_MAX, SEED_MIN } from "../recipe/schema.js";

export interface ValidationReport {
  readonly status: "pass" | "fail";
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export interface ValidationOptions {
  /** Regions below this size warn; one-cell regions are always errors. */
  readonly minRegionCells?: number;
}

const HEX64 = /^[0-9a-f]{64}$/;
const SEMANTIC_KEY = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/**
 * Structural validation (docs/GENERATION_RULES.md, "Validation gates"): exact
 * chunk coverage, consistent layer shapes, in-range palette references, a
 * complete generation identity, and region-size gates. Later milestones add
 * topology gates.
 */
export function validateArtifact(artifact: WorldArtifact, options: ValidationOptions = {}): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (artifact.formatVersion !== ARTIFACT_FORMAT_VERSION) {
    errors.push(`formatVersion must be ${ARTIFACT_FORMAT_VERSION}`);
  }

  const { width, height, chunkWidth, chunkHeight } = artifact.dimensions;
  for (const [label, value] of Object.entries(artifact.dimensions)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      errors.push(`dimensions.${label} must be a positive integer`);
    }
  }
  if (errors.length === 0 && (width % chunkWidth !== 0 || height % chunkHeight !== 0)) {
    errors.push("world dimensions must be divisible by chunk dimensions");
  }

  const generator = artifact.generator;
  if (!Number.isSafeInteger(generator.seed) || generator.seed < SEED_MIN || generator.seed > SEED_MAX) {
    errors.push("generator.seed is out of range");
  }
  for (const field of ["recipeSha256", "resolvedConfigSha256", "generationIdentitySha256"] as const) {
    if (!HEX64.test(generator[field])) {
      errors.push(`generator.${field} must be a 64-character lowercase hex hash`);
    }
  }
  if (generator.name === "" || generator.version === "") {
    errors.push("generator.name and generator.version must be present");
  }

  if (artifact.semanticPalette.length === 0) {
    errors.push("semanticPalette must not be empty");
  }
  for (const key of artifact.semanticPalette) {
    if (!SEMANTIC_KEY.test(key)) {
      errors.push(`semantic key "${key}" is not a dot-namespaced lowercase identifier`);
    }
  }

  if (errors.length === 0) {
    const chunksAcross = width / chunkWidth;
    const chunksDown = height / chunkHeight;
    const expected = chunksAcross * chunksDown;
    const seen = new Set<string>();

    for (const chunk of artifact.chunks) {
      const [cx, cy] = chunk.coord;
      const key = `${cx},${cy}`;
      if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cy)) {
        errors.push(`chunk coord [${String(cx)}, ${String(cy)}] is not integral`);
        continue;
      }
      if (cx < 0 || cx >= chunksAcross || cy < 0 || cy >= chunksDown) {
        errors.push(`chunk [${key}] lies outside the world bounds`);
        continue;
      }
      if (seen.has(key)) {
        errors.push(`chunk [${key}] appears more than once`);
        continue;
      }
      seen.add(key);

      const material = chunk.layers.material;
      if (material.length !== chunkHeight) {
        errors.push(`chunk [${key}] material must have ${chunkHeight} rows`);
        continue;
      }
      for (const row of material) {
        if (row.length !== chunkWidth) {
          errors.push(`chunk [${key}] has a row of width ${row.length}, expected ${chunkWidth}`);
          break;
        }
        for (const cell of row) {
          if (!Number.isSafeInteger(cell) || cell < 0 || cell >= artifact.semanticPalette.length) {
            errors.push(`chunk [${key}] references palette index ${String(cell)} out of range`);
            break;
          }
        }
      }
    }

    if (seen.size !== expected) {
      errors.push(`chunks must cover the world exactly once: expected ${expected}, found ${seen.size}`);
    }
  }

  if (errors.length === 0 && artifact.regions.length > 0) {
    let regionCellTotal = 0;
    for (const region of artifact.regions) {
      regionCellTotal += region.cellCount;
      if (!artifact.semanticPalette.includes(region.biome)) {
        errors.push(`region ${region.id} names biome "${region.biome}" outside the palette`);
      }
      if (region.cellCount === 1) {
        errors.push(`region ${region.id} is one-cell biome confetti`);
      } else if (options.minRegionCells !== undefined && region.cellCount < options.minRegionCells) {
        warnings.push(
          `region ${region.id} (${region.biome}) has ${region.cellCount} cells, below the ${options.minRegionCells}-cell minimum`,
        );
      }
    }
    if (regionCellTotal !== width * height) {
      errors.push(
        `region cell counts must cover the world exactly once: expected ${width * height}, found ${regionCellTotal}`,
      );
    }
  }

  return {
    status: errors.length === 0 ? "pass" : "fail",
    errors,
    warnings,
  };
}
