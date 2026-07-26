import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { channel } from "../src/core/channels.js";

describe("named channels", () => {
  it("rejects names outside the dot-namespaced lowercase convention", () => {
    assert.throws(() => channel(1, "BadName"), /dot-namespaced/);
    assert.throws(() => channel(1, "nodot"), /dot-namespaced/);
    assert.throws(() => channel(1, "has.UpperCase"), /dot-namespaced/);
    assert.doesNotThrow(() => channel(1, "macro.elevation"));
  });

  it("gives every channel independent values", () => {
    const elevation = channel(103991, "macro.elevation");
    const oak = channel(103991, "decor.oak");
    assert.notEqual(elevation.hashAt(4, 4), oak.hashAt(4, 4));
  });

  it("never changes existing channels when a new channel appears", () => {
    const before = channel(103991, "macro.elevation").hashAt(10, 20);
    channel(103991, "decor.flowers"); // the channel the docs warn about
    const flowers = channel(103991, "decor.flowers").hashAt(10, 20);
    const after = channel(103991, "macro.elevation").hashAt(10, 20);
    assert.equal(before, after, "adding decor.flowers must not reshuffle macro.elevation");
    assert.notEqual(flowers, after);
  });

  it("is order-independent: interleaved and reversed queries agree", () => {
    const a1 = channel(7, "test.alpha");
    const b1 = channel(7, "test.beta");
    const firstOrder = [a1.hashAt(0, 0), b1.hashAt(0, 0), a1.hashAt(1, 1), b1.hashAt(1, 1)];

    const b2 = channel(7, "test.beta");
    const a2 = channel(7, "test.alpha");
    const secondOrder = [b2.hashAt(1, 1), a2.hashAt(1, 1), b2.hashAt(0, 0), a2.hashAt(0, 0)];

    assert.deepEqual(
      [firstOrder[0], firstOrder[1], firstOrder[2], firstOrder[3]],
      [secondOrder[3], secondOrder[2], secondOrder[1], secondOrder[0]],
    );
  });

  it("supports negative coordinates", () => {
    const ch = channel(1, "test.negative");
    assert.notEqual(ch.hashAt(-1, -1), ch.hashAt(1, 1));
    assert.equal(ch.hashAt(-5, 9), ch.hashAt(-5, 9));
  });

  it("keeps integer sampling in range and honors probability edges", () => {
    const ch = channel(42, "test.sampling");
    for (let x = -3; x <= 3; x += 1) {
      for (let y = -3; y <= 3; y += 1) {
        const value = ch.intAt(x, y, 5, 15);
        assert.ok(value >= 5 && value < 15);
        const permille = ch.permilleAt(x, y);
        assert.ok(permille >= 0 && permille < 1000);
        assert.equal(ch.chanceAt(x, y, 0), false);
        assert.equal(ch.chanceAt(x, y, 1000), true);
        const weighted = ch.weightedPickAt(x, y, [0, 3, 0, 7]);
        assert.ok(weighted === 1 || weighted === 3, "zero-weight entries are never picked");
      }
    }
    assert.throws(() => ch.intAt(0, 0, 5, 5), /ascending/);
    assert.throws(() => ch.pickAt(0, 0, []), /non-empty/);
    assert.throws(() => ch.weightedPickAt(0, 0, [0, 0]), /positive total/);
  });

  it("streams reproduce per (channel, salt) and shuffles are permutations", () => {
    const ch = channel(9, "test.stream");
    const first = [ch.stream(0).next(), ch.stream(0).next()];
    assert.equal(first[0], first[1], "fresh streams with the same salt start identically");
    assert.notEqual(ch.stream(0).next(), ch.stream(1).next());

    const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const shuffledA = ch.stream(2).shuffle(items);
    const shuffledB = ch.stream(2).shuffle(items);
    assert.deepEqual(shuffledA, shuffledB);
    assert.deepEqual([...shuffledA].sort((a, b) => a - b), items);
    assert.deepEqual(items, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], "shuffle must not mutate its input");
  });
});
