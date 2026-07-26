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

      const layerChecks: ReadonlyArray<{
        name: string;
        rows: ReadonlyArray<readonly number[]>;
        min: number;
        max: number;
      }> = [
        {
          name: "material",
          rows: chunk.layers.material,
          min: 0,
          max: artifact.semanticPalette.length - 1,
        },
        { name: "elevation", rows: chunk.layers.elevation, min: 0, max: 999 },
        { name: "river", rows: chunk.layers.river, min: 0, max: 2 },
        { name: "path", rows: chunk.layers.path, min: 0, max: 1 },
        { name: "structure", rows: chunk.layers.structure, min: 0, max: artifact.structureTypes.length },
        { name: "prop", rows: chunk.layers.prop, min: 0, max: artifact.propTypes.length },
        { name: "moss", rows: chunk.layers.moss, min: 0, max: 1 },
        { name: "tallgrass", rows: chunk.layers.tallgrass, min: 0, max: 1 },
        { name: "decal", rows: chunk.layers.decal, min: 0, max: artifact.decalTypes.length },
        { name: "crop", rows: chunk.layers.crop, min: 0, max: artifact.cropTypes.length * 16 + 4 },
        { name: "fence", rows: chunk.layers.fence, min: 0, max: artifact.fenceTypes.length },
        { name: "pier", rows: chunk.layers.pier, min: 0, max: artifact.pierTypes.length },
      ];
      for (const layer of layerChecks) {
        if (layer.rows.length !== chunkHeight) {
          errors.push(`chunk [${key}] ${layer.name} must have ${chunkHeight} rows`);
          continue;
        }
        for (const row of layer.rows) {
          if (row.length !== chunkWidth) {
            errors.push(
              `chunk [${key}] ${layer.name} has a row of width ${row.length}, expected ${chunkWidth}`,
            );
            break;
          }
          let rowValid = true;
          for (const cell of row) {
            if (!Number.isSafeInteger(cell) || cell < layer.min || cell > layer.max) {
              errors.push(`chunk [${key}] ${layer.name} value ${String(cell)} is out of range`);
              rowValid = false;
              break;
            }
          }
          if (!rowValid) {
            break;
          }
        }
      }
    }

    if (seen.size !== expected) {
      errors.push(`chunks must cover the world exactly once: expected ${expected}, found ${seen.size}`);
    }
  }

  if (errors.length === 0) {
    const occupied = new Set<number>();
    const claim = (label: string, cellX: number, cellY: number, fw: number, fh: number): void => {
      for (let sy = 0; sy < fh; sy += 1) {
        for (let sx = 0; sx < fw; sx += 1) {
          const cx = cellX + sx;
          const cy = cellY + sy;
          if (cx < 0 || cy < 0 || cx >= width || cy >= height) {
            errors.push(`${label} footprint leaves the world at (${cx}, ${cy})`);
            return;
          }
          const key = cy * width + cx;
          if (occupied.has(key)) {
            errors.push(`${label} overlaps another structure at (${cx}, ${cy})`);
            return;
          }
          occupied.add(key);
        }
      }
    };
    for (const settlement of artifact.settlements) {
      for (const structure of settlement.structures) {
        claim(
          `settlement ${settlement.id} ${structure.type}`,
          structure.cell[0],
          structure.cell[1],
          structure.footprint[0],
          structure.footprint[1],
        );
      }
    }
    for (const landmark of artifact.landmarks) {
      claim(`landmark ${landmark.id}`, landmark.cell[0], landmark.cell[1], landmark.footprint[0], landmark.footprint[1]);
    }
    for (const poi of artifact.pois) {
      if (poi.structure !== undefined) {
        claim(`poi ${poi.id} ${poi.structure.type}`, poi.structure.x, poi.structure.y, poi.structure.w, poi.structure.h);
      }
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
