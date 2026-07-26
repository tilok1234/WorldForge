/**
 * Named deterministic channels (docs/ARCHITECTURE_AND_CONTRACTS.md,
 * "Determinism contract"). Every generation pass draws randomness from its own
 * named channel; a channel's values depend only on (world seed, channel name,
 * position, salt), so:
 *
 * - query order never changes results (positional hashing, no shared state);
 * - adding a new channel never reshuffles existing channels (seeds derive
 *   from the channel name, not from registration order).
 *
 * All sampling is integer-only. `intAt`/`pickAt` use modulo reduction: the
 * bias for ranges far below 2^32 is negligible and, more importantly,
 * deterministic. Streams exist for explicitly-ordered algorithms (shuffles);
 * their draw order is part of the consuming pass's contract.
 */

import { hashCoords, hashString32, mix32 } from "./hash.js";

const CHANNEL_NAME_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function deriveChannelSeed(worldSeed: number, name: string): number {
  if (!CHANNEL_NAME_PATTERN.test(name)) {
    throw new Error(
      `channel name "${name}" must be dot-namespaced lowercase (e.g. "macro.elevation")`,
    );
  }
  return mix32((hashString32(name) ^ mix32(worldSeed >>> 0)) >>> 0);
}

export function channel(worldSeed: number, name: string): Channel {
  return new Channel(name, deriveChannelSeed(worldSeed, name));
}

export class Channel {
  constructor(
    readonly name: string,
    private readonly channelSeed: number,
  ) {}

  /** Raw uint32 at a position. */
  hashAt(x: number, y: number, salt = 0): number {
    return hashCoords(this.channelSeed, x, y, salt);
  }

  /** Integer in [minInclusive, maxExclusive). */
  intAt(x: number, y: number, minInclusive: number, maxExclusive: number, salt = 0): number {
    const span = maxExclusive - minInclusive;
    if (!Number.isSafeInteger(span) || span <= 0) {
      throw new Error(`intAt requires an ascending integer range, got [${minInclusive}, ${maxExclusive})`);
    }
    return minInclusive + (this.hashAt(x, y, salt) % span);
  }

  /** Integer in [0, 1000). */
  permilleAt(x: number, y: number, salt = 0): number {
    return this.hashAt(x, y, salt) % 1000;
  }

  /** True with probability probabilityPermille/1000. */
  chanceAt(x: number, y: number, probabilityPermille: number, salt = 0): boolean {
    if (!Number.isSafeInteger(probabilityPermille) || probabilityPermille < 0 || probabilityPermille > 1000) {
      throw new Error("probabilityPermille must be an integer in [0, 1000]");
    }
    return this.permilleAt(x, y, salt) < probabilityPermille;
  }

  /** Uniform pick from a non-empty list. */
  pickAt<T>(x: number, y: number, items: readonly T[], salt = 0): T {
    if (items.length === 0) {
      throw new Error("pickAt requires a non-empty list");
    }
    const item = items[this.hashAt(x, y, salt) % items.length];
    return item as T;
  }

  /** Weighted pick using non-negative integer weights (at least one positive). */
  weightedPickAt(x: number, y: number, weights: readonly number[], salt = 0): number {
    let total = 0;
    for (const weight of weights) {
      if (!Number.isSafeInteger(weight) || weight < 0) {
        throw new Error("weights must be non-negative integers");
      }
      total += weight;
    }
    if (total === 0) {
      throw new Error("weightedPickAt requires a positive total weight");
    }
    let roll = this.hashAt(x, y, salt) % total;
    for (let index = 0; index < weights.length; index += 1) {
      roll -= weights[index] as number;
      if (roll < 0) {
        return index;
      }
    }
    return weights.length - 1;
  }

  /**
   * Counter-based stream for explicitly-ordered draws. Same (channel, salt)
   * always yields the same sequence; the consuming algorithm owns draw order.
   */
  stream(salt = 0): ChannelStream {
    return new ChannelStream(mix32((this.channelSeed ^ (salt >>> 0)) >>> 0));
  }
}

export class ChannelStream {
  private counter = 0;

  constructor(private readonly streamSeed: number) {}

  /** Next uint32. */
  next(): number {
    const value = hashCoords(this.streamSeed, this.counter, 0);
    this.counter += 1;
    return value;
  }

  /** Next integer in [minInclusive, maxExclusive). */
  nextInt(minInclusive: number, maxExclusive: number): number {
    const span = maxExclusive - minInclusive;
    if (!Number.isSafeInteger(span) || span <= 0) {
      throw new Error(`nextInt requires an ascending integer range, got [${minInclusive}, ${maxExclusive})`);
    }
    return minInclusive + (this.next() % span);
  }

  /** Deterministic Fisher-Yates shuffle (returns a new array). */
  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = this.nextInt(0, index + 1);
      const held = result[index] as T;
      result[index] = result[swap] as T;
      result[swap] = held;
    }
    return result;
  }
}
