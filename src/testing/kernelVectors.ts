/**
 * Cross-platform golden-vector builder for the deterministic kernel. The
 * committed fixture (fixtures/golden/kernel-vectors.json) is this function's
 * canonical JSON; every supported platform must reproduce it byte-for-byte
 * (docs/ROADMAP.md, W1 exit criteria). Regenerate only via
 * tools/update-golden.ts after an approved behavior change.
 */

import { cellIndexRowMajor, chunkOrigin, floorDiv, floorMod, worldToChunk, worldToLocal } from "../core/coords.js";
import { combine32, hashCoords, hashString32, mix32 } from "../core/hash.js";
import { channel } from "../core/channels.js";
import { classifyByThresholds, clampInt, lerpPermille, remapInt } from "../core/fixedPoint.js";
import { GENERATOR_VERSION } from "../core/version.js";

const DIV_CASES: ReadonlyArray<readonly [number, number]> = [
  [7, 3], [-7, 3], [7, -3], [-7, -3], [0, 5], [-1, 16], [15, 16], [-16, 16],
  [2147483647, 16], [-2147483648, 16], [9007199254740991, 3], [-9007199254740991, 3],
];

const MIX_INPUTS = [0, 1, 2, 42, 0xdeadbeef, 0xffffffff, 0x9e3779b9, 103991];

const STRING_INPUTS = ["", "a", "ab", "macro.elevation", "decor.oak", "terrain.grass", "🌲🗺️", "Straße"];

const COORD_CASES: ReadonlyArray<readonly [number, number, number, number]> = [
  [1, 0, 0, 0], [1, 1, 0, 0], [1, 0, 1, 0], [1, 1, 1, 0], [1, -1, -1, 0],
  [1, 2147483647, -2147483648, 0], [103991, 7, -13, 0], [103991, 7, -13, 5],
  [103991, -1000, 1000, 0],
];

const CHANNEL_SEEDS = [1, 103991];
const CHANNEL_NAMES = ["macro.elevation", "decor.oak", "test.channel"];
const CHANNEL_COORDS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1, 0], [0, 1], [-1, -1], [2, 2], [1000, -1000],
];

export function buildKernelVectors(): unknown {
  return {
    meta: { vectorFormat: 1, generatorVersion: GENERATOR_VERSION },
    floorDivMod: DIV_CASES.map(([value, divisor]) => ({
      value,
      divisor,
      div: floorDiv(value, divisor),
      mod: floorMod(value, divisor),
    })),
    coordConversions: [
      { x: -1, y: -1, chunkW: 16, chunkH: 16 },
      { x: 0, y: 0, chunkW: 16, chunkH: 16 },
      { x: 31, y: 47, chunkW: 16, chunkH: 16 },
      { x: -33, y: 15, chunkW: 32, chunkH: 32 },
    ].map(({ x, y, chunkW, chunkH }) => {
      const chunk = worldToChunk(x, y, chunkW, chunkH);
      const local = worldToLocal(x, y, chunkW, chunkH);
      const origin = chunkOrigin(chunk.cx, chunk.cy, chunkW, chunkH);
      return {
        x, y, chunkW, chunkH,
        cx: chunk.cx, cy: chunk.cy, lx: local.lx, ly: local.ly,
        originX: origin.x, originY: origin.y,
        cellIndex: cellIndexRowMajor(local.lx, local.ly, chunkW),
      };
    }),
    mix32: MIX_INPUTS.map((input) => ({ input, output: mix32(input) })),
    combine32: [
      { state: 0, value: 0 },
      { state: 1, value: 2 },
      { state: 2, value: 1 },
      { state: 0xdeadbeef, value: 103991 },
    ].map(({ state, value }) => ({ state, value, output: combine32(state, value) })),
    hashString32: STRING_INPUTS.map((text) => ({ text, output: hashString32(text) })),
    hashCoords: COORD_CASES.map(([seed, x, y, salt]) => ({
      seed, x, y, salt,
      output: hashCoords(seed, x, y, salt),
    })),
    channels: CHANNEL_SEEDS.flatMap((worldSeed) =>
      CHANNEL_NAMES.map((name) => {
        const ch = channel(worldSeed, name);
        return {
          worldSeed,
          name,
          samples: CHANNEL_COORDS.map(([x, y]) => ({
            x, y,
            hash: ch.hashAt(x, y),
            permille: ch.permilleAt(x, y),
            int0to100: ch.intAt(x, y, 0, 100),
            pickOf5: ch.hashAt(x, y) % 5,
            weighted: ch.weightedPickAt(x, y, [1, 2, 3, 10]),
          })),
        };
      }),
    ),
    streams: CHANNEL_SEEDS.map((worldSeed) => {
      const ch = channel(worldSeed, "test.stream");
      const stream = ch.stream(0);
      const salted = ch.stream(7);
      return {
        worldSeed,
        firstEight: Array.from({ length: 8 }, () => stream.next()),
        saltedFirstFour: Array.from({ length: 4 }, () => salted.next()),
        shuffledTen: ch.stream(1).shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
      };
    }),
    fixedPoint: {
      lerpPermille: [
        { a: 0, b: 1000, t: 500 }, { a: -1000, b: 1000, t: 250 }, { a: 7, b: -13, t: 333 },
        { a: 0, b: 3, t: 500 }, { a: 3, b: 0, t: 500 }, { a: -3, b: 0, t: 500 },
      ].map(({ a, b, t }) => ({ a, b, t, output: lerpPermille(a, b, t) })),
      remapInt: [
        { value: 500, fromLo: 0, fromHi: 1000, toLo: 0, toHi: 255 },
        { value: -250, fromLo: -1000, fromHi: 1000, toLo: 0, toHi: 8 },
        { value: 2000, fromLo: 0, fromHi: 1000, toLo: 0, toHi: 10 },
      ].map((args) => ({ ...args, output: remapInt(args.value, args.fromLo, args.fromHi, args.toLo, args.toHi) })),
      classify: [
        { value: -50, thresholds: [0, 250, 700] },
        { value: 0, thresholds: [0, 250, 700] },
        { value: 250, thresholds: [0, 250, 700] },
        { value: 699, thresholds: [0, 250, 700] },
        { value: 700, thresholds: [0, 250, 700] },
        { value: 5000, thresholds: [0, 250, 700] },
      ].map(({ value, thresholds }) => ({
        value,
        thresholds: [...thresholds],
        output: classifyByThresholds(value, thresholds),
      })),
      clamp: [{ value: -5, min: 0, max: 10 }, { value: 15, min: 0, max: 10 }, { value: 5, min: 0, max: 10 }].map(
        (args) => ({ ...args, output: clampInt(args.value, args.min, args.max) }),
      ),
    },
  };
}
