/**
 * Minimal PNG decoder for verification tooling (zero external dependencies;
 * inflate comes from node:zlib). Supports exactly what the pinned TileForge
 * package ships: 8-bit RGBA, non-interlaced, standard filters 0-4. Anything
 * else fails loudly rather than decoding approximately.
 */

import { inflateSync } from "node:zlib";

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  /** RGBA8, row-major, 4 bytes per pixel. */
  readonly rgba: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] as number) << 24 >>> 0) +
    ((bytes[offset + 1] as number) << 16) +
    ((bytes[offset + 2] as number) << 8) +
    (bytes[offset + 3] as number)
  );
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(bytes: Uint8Array): DecodedPng {
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (bytes[i] !== SIGNATURE[i]) {
      throw new Error("not a PNG file");
    }
  }
  let width = 0;
  let height = 0;
  let sawIhdr = false;
  const idatParts: Uint8Array[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4] as number,
      bytes[offset + 5] as number,
      bytes[offset + 6] as number,
      bytes[offset + 7] as number,
    );
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = readU32(data, 0);
      height = readU32(data, 4);
      const bitDepth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(
          `unsupported PNG variant (bitDepth ${bitDepth}, colorType ${colorType}, ` +
            `interlace ${interlace}); the pinned package ships RGBA8 non-interlaced`,
        );
      }
      sawIhdr = true;
    } else if (type === "IDAT") {
      idatParts.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (!sawIhdr || width === 0 || height === 0) {
    throw new Error("PNG has no usable IHDR");
  }

  const compressed = Buffer.concat(idatParts.map((part) => Buffer.from(part)));
  const raw = inflateSync(compressed);
  const stride = width * 4;
  if (raw.length !== (stride + 1) * height) {
    throw new Error(
      `PNG data length ${raw.length} does not match ${width}x${height} RGBA8`,
    );
  }

  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] as number;
    const rowIn = (y * (stride + 1)) + 1;
    const rowOut = y * stride;
    const prevOut = rowOut - stride;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[rowIn + i] as number;
      const left = i >= 4 ? (rgba[rowOut + i - 4] as number) : 0;
      const up = y > 0 ? (rgba[prevOut + i] as number) : 0;
      const upLeft = y > 0 && i >= 4 ? (rgba[prevOut + i - 4] as number) : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + left;
          break;
        case 2:
          value = x + up;
          break;
        case 3:
          value = x + ((left + up) >> 1);
          break;
        case 4:
          value = x + paethPredictor(left, up, upLeft);
          break;
        default:
          throw new Error(`unsupported PNG filter ${filter} on row ${y}`);
      }
      rgba[rowOut + i] = value & 0xff;
    }
  }
  return { width, height, rgba };
}
