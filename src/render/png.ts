/**
 * Minimal deterministic PNG encoder: 8-bit RGB, filter 0 on every scanline,
 * one IDAT chunk deflated at a fixed level. With the pinned Node toolchain the
 * output bytes are stable, so debug renders can be golden fixtures.
 */

import { crc32, deflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Encode a width*height*3 RGB buffer into PNG bytes. */
export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error("png dimensions must be positive integers");
  }
  if (rgb.length !== width * height * 3) {
    throw new Error(`rgb buffer must hold ${width * height * 3} bytes, got ${rgb.length}`);
  }

  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type 0 (None)
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, "ascii");
  const typed = Buffer.concat([header.subarray(4), data]);
  const footer = Buffer.alloc(4);
  footer.writeUInt32BE(crc32(typed) >>> 0, 0);
  return Buffer.concat([header, data, footer]);
}
