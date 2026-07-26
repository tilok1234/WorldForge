/**
 * Minimal read-only ZIP reader for TileForge release packages. Supports the
 * plain ZIP subset those exports use: stored or deflate entries, no
 * encryption, no zip64, forward-slash entry names. Anything outside that
 * subset fails loudly rather than being guessed at.
 */

import { crc32, inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export interface ZipEntry {
  readonly name: string;
  readonly isDirectory: boolean;
  readonly isSymlink: boolean;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  /** Inflate and CRC-check the entry's bytes. */
  readonly read: () => Buffer;
}

export function readZipEntries(zip: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  const centralSize = zip.readUInt32LE(eocdOffset + 12);
  const centralOffset = zip.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("zip64 archives are not supported");
  }

  const entries: ZipEntry[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new Error(`central directory entry ${index} has a bad signature`);
    }
    const versionMadeBy = zip.readUInt16LE(cursor + 4);
    const flags = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const expectedCrc = zip.readUInt32LE(cursor + 16);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const externalAttributes = zip.readUInt32LE(cursor + 38);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    cursor += 46 + nameLength + extraLength + commentLength;

    if ((flags & 0x1) !== 0) {
      throw new Error(`entry "${name}" is encrypted`);
    }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error(`entry "${name}" requires zip64`);
    }
    if (method !== 0 && method !== 8) {
      throw new Error(`entry "${name}" uses unsupported compression method ${method}`);
    }

    const madeByUnix = versionMadeBy >>> 8 === 3;
    const unixMode = externalAttributes >>> 16;
    const isSymlink = madeByUnix && (unixMode & 0xf000) === 0xa000;

    entries.push({
      name,
      isDirectory: name.endsWith("/"),
      isSymlink,
      compressedSize,
      uncompressedSize,
      read: (): Buffer => {
        if (zip.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
          throw new Error(`entry "${name}" has a bad local header`);
        }
        const localNameLength = zip.readUInt16LE(localOffset + 26);
        const localExtraLength = zip.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const raw = zip.subarray(dataStart, dataStart + compressedSize);
        const data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
        if (data.length !== uncompressedSize) {
          throw new Error(`entry "${name}" inflated to ${data.length} bytes, expected ${uncompressedSize}`);
        }
        if ((crc32(data) >>> 0) !== expectedCrc) {
          throw new Error(`entry "${name}" failed its CRC-32 check`);
        }
        return data;
      },
    });
  }
  return entries;
}

function findEndOfCentralDirectory(zip: Buffer): number {
  const scanFloor = Math.max(0, zip.length - 22 - 65535);
  for (let offset = zip.length - 22; offset >= scanFloor; offset -= 1) {
    if (zip.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw new Error("not a zip archive (no end-of-central-directory record)");
}
