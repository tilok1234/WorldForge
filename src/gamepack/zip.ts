/**
 * Deterministic store-only ZIP writer for pack release transport (doc 18 §4.4
 * in the planning repo: packs ship as GitHub release assets, fetchable by tag
 * and hash-checkable forever).
 *
 * Same-bytes-in, same-bytes-out on every machine and every run: entries are
 * sorted by path, stored uncompressed (compression output varies across zlib
 * builds; store mode is timeless), and every timestamp is the fixed DOS epoch
 * 1980-01-01 00:00:00. No dependencies, classic (non-zip64) format — packs
 * are tens of megabytes against the 4 GiB / 65535-entry classic limits, and
 * the writer refuses anything larger rather than silently overflowing.
 */

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** Standard IEEE CRC-32 (the ZIP polynomial). */
export function crc32(bytes: Readonly<Uint8Array>): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = (CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Forward-slash relative path, ASCII, no leading slash. */
  readonly path: string;
  readonly bytes: Buffer;
}

const DOS_TIME = 0x0000; // 00:00:00
const DOS_DATE = 0x0021; // 1980-01-01

/**
 * Build a store-only ZIP from the given entries. Throws on paths that are
 * non-ASCII, absolute, backslashed, or duplicated, and on classic-format
 * overflow — a refused zip is better than an undecodable one.
 */
export function buildStoredZip(entries: readonly ZipEntry[]): Buffer {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const seen = new Set<string>();
  for (const entry of sorted) {
    if (!/^[\x20-\x7e]+$/.test(entry.path) || entry.path.startsWith("/") || entry.path.includes("\\")) {
      throw new Error(`zip entry path must be ASCII, relative, forward-slashed: "${entry.path}"`);
    }
    if (seen.has(entry.path)) {
      throw new Error(`duplicate zip entry path: "${entry.path}"`);
    }
    seen.add(entry.path);
    if (entry.bytes.length >= 0xffffffff) {
      throw new Error(`zip entry "${entry.path}" exceeds the classic-format size limit`);
    }
  }
  if (sorted.length >= 0xffff) {
    throw new Error(`too many zip entries for the classic format: ${sorted.length}`);
  }

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of sorted) {
    const name = Buffer.from(entry.path, "ascii");
    const crc = crc32(entry.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: store
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.bytes.length, 18); // compressed
    local.writeUInt32LE(entry.bytes.length, 22); // uncompressed
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra
    localParts.push(local, name, entry.bytes);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // method
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.bytes.length, 20);
    central.writeUInt32LE(entry.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += 30 + name.length + entry.bytes.length;
    if (offset >= 0xffffffff) {
      throw new Error("zip exceeds the classic-format archive size limit");
    }
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // central-dir disk
  eocd.writeUInt16LE(sorted.length, 8);
  eocd.writeUInt16LE(sorted.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment
  return Buffer.concat([...localParts, ...centralParts, eocd]);
}
