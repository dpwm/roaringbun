/**
 * Tests for RoaringBitmap64.
 *
 * Run: bun test
 */

import { describe, test, expect } from "bun:test";
import { RoaringBitmap64, RoaringBitmap32 } from "../src/index.ts";

function assertValid(bm: RoaringBitmap64) {
  const { valid } = bm.validate();
  expect(valid).toBe(true);
}

describe("RoaringBitmap64", () => {
  test("create empty bitmap", () => {
    const bm = new RoaringBitmap64();
    expect(bm.cardinality).toBe(0n);
    expect(bm.isEmpty).toBe(true);
    expect(bm.size).toBe(0);
    bm.free();
  });

  test("add and contains", () => {
    const bm = new RoaringBitmap64();
    bm.add(1n);
    bm.add(1000000000000n);
    bm.add(0xFFFFFFFFFFFFFFFFn);
    expect(bm.has(1n)).toBe(true);
    expect(bm.has(1000000000000n)).toBe(true);
    expect(bm.has(0xFFFFFFFFFFFFFFFFn)).toBe(true);
    expect(bm.has(2n)).toBe(false);
    expect(bm.cardinality).toBe(3n);
    bm.free();
  });

  test("chained add", () => {
    const bm = new RoaringBitmap64()
      .add(1n).add(2n).add(3n);
    expect(bm.cardinality).toBe(3n);
    bm.free();
  });

  test("delete", () => {
    const bm = RoaringBitmap64.from([10n, 20n, 30n]);
    expect(bm.delete(20n)).toBe(true);
    expect(bm.has(20n)).toBe(false);
    expect(bm.delete(99n)).toBe(false);
    bm.free();
  });

  test("remove alias", () => {
    const bm = RoaringBitmap64.from([1n, 2n, 3n]);
    bm.remove(2n);
    expect(bm.has(2n)).toBe(false);
    bm.free();
  });

  test("addChecked", () => {
    const bm = new RoaringBitmap64();
    expect(bm.addChecked(42n)).toBe(true);
    expect(bm.addChecked(42n)).toBe(false);
    bm.free();
  });

  test("range operations", () => {
    const bm = new RoaringBitmap64();
    bm.addRange(0n, 100n);
    expect(bm.cardinality).toBe(100n);
    expect(bm.minimum).toBe(0n);
    expect(bm.maximum).toBe(99n);

    bm.removeRange(50n, 100n);
    expect(bm.cardinality).toBe(50n);
    expect(bm.maximum).toBe(49n);
    bm.free();
  });

  test("select", () => {
    const bm = RoaringBitmap64.from([10n, 20n, 30n, 40n, 50n]);
    const { value, found } = bm.select(2n);
    expect(found).toBe(true);
    expect(value).toBe(30n);
    bm.free();
  });

  test("rank", () => {
    const bm = RoaringBitmap64.from([1n, 2n, 3n, 10n, 20n]);
    expect(bm.rank(3n)).toBe(3n);
    expect(bm.rank(10n)).toBe(4n);
    bm.free();
  });

  test("indexOf", () => {
    const bm = RoaringBitmap64.from([10n, 20n, 30n]);
    expect(bm.indexOf(10n)).toBe(0n);
    expect(bm.indexOf(20n)).toBe(1n);
    expect(bm.indexOf(99n)).toBeNull();
    bm.free();
  });

  test("set operations", () => {
    const a = RoaringBitmap64.from([1n, 2n, 3n, 4n, 5n]);
    const b = RoaringBitmap64.from([4n, 5n, 6n, 7n, 8n]);

    expect([...a.intersection(b)]).toEqual([4n, 5n]);
    expect([...a.union(b)]).toEqual([1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n]);
    expect([...a.symmetricDifference(b)]).toEqual([1n, 2n, 3n, 6n, 7n, 8n]);
    expect([...a.difference(b)]).toEqual([1n, 2n, 3n]);

    // aliases
    expect([...a.and(b)]).toEqual([4n, 5n]);
    expect([...a.or(b)]).toEqual([1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n]);

    a.free(); b.free();
  });

  test("in-place operations", () => {
    const a = RoaringBitmap64.from([1n, 2n, 3n, 4n, 5n]);
    const b = RoaringBitmap64.from([4n, 5n, 6n]);
    a.andInPlace(b);
    expect([...a]).toEqual([4n, 5n]);
    a.free(); b.free();
  });

  test("comparison", () => {
    const a = RoaringBitmap64.from([1n, 2n, 3n]);
    const b = RoaringBitmap64.from([1n, 2n, 3n]);
    const c = RoaringBitmap64.from([1n, 2n]);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    expect(c.isSubsetOf(a)).toBe(true);
    expect(a.isSupersetOf(c)).toBe(true);
    expect(a.isDisjointFrom(c)).toBe(false);
    a.free(); b.free(); c.free();
  });

  test("portable serialize round-trip", () => {
    const bm = RoaringBitmap64.from([1n, 2n, 3n, 1000000000000n]);
    const data = bm.portableSerialize();
    const restored = RoaringBitmap64.portableDeserializeSafe(data);
    expect(restored).not.toBeNull();
    expect(bm.equals(restored!)).toBe(true);
    assertValid(restored!);
    bm.free(); restored!.free();
  });

  test("iterator protocol", () => {
    const bm = RoaringBitmap64.from([1n, 2n, 3n]);
    expect([...bm]).toEqual([1n, 2n, 3n]);
    expect([...bm.entries()]).toEqual([[1n, 1n], [2n, 2n], [3n, 3n]]);

    const collected: bigint[] = [];
    bm.forEach((v) => collected.push(v));
    expect(collected).toEqual([1n, 2n, 3n]);
    bm.free();
  });

  test("iterator on empty bitmap", () => {
    const bm = new RoaringBitmap64();
    expect([...bm]).toEqual([]);
    bm.free();
  });

  test("toArray", () => {
    const bm = RoaringBitmap64.from([3n, 1n, 2n]);
    const arr = bm.toArray();
    expect([...arr]).toEqual([1n, 2n, 3n]);
    bm.free();
  });

  test("from", () => {
    const bm = RoaringBitmap64.from([5n, 3n, 1n]);
    expect([...bm]).toEqual([1n, 3n, 5n]);
    assertValid(bm);
    bm.free();
  });

  test("fromRange", () => {
    const bm = RoaringBitmap64.fromRange(0n, 10n);
    expect([...bm]).toEqual([0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n]);
    bm.free();
  });

  // ---- ranges ---------------------------------------------------------

  test("ranges on empty bitmap", () => {
    const bm = new RoaringBitmap64();
    expect([...bm.ranges()]).toEqual([]);
    bm.free();
  });

  test("ranges on single value", () => {
    const bm = RoaringBitmap64.from([42n]);
    expect([...bm.ranges()]).toEqual([{ start: 42n, end: 42n }]);
    bm.free();
  });

  test("ranges on disjoint values", () => {
    const bm = new RoaringBitmap64();
    bm.addRange(0n, 10n);
    bm.addRange(100n, 110n);
    bm.add(500n);
    const ranges = [...bm.ranges()];
    expect(ranges).toEqual([
      { start: 0n, end: 9n },
      { start: 100n, end: 109n },
      { start: 500n, end: 500n },
    ]);
    bm.free();
  });

  test("ranges after runOptimize", () => {
    const bm = RoaringBitmap64.fromRange(0n, 1_000_000n);
    bm.runOptimize();
    const ranges = [...bm.ranges()];
    expect(ranges).toEqual([{ start: 0n, end: 999_999n }]);
    bm.free();
  });

  test("copy", () => {
    const orig = RoaringBitmap64.from([1n, 2n, 3n]);
    const copy = RoaringBitmap64.copy(orig);
    expect(orig.equals(copy)).toBe(true);
    copy.add(4n);
    expect(orig.cardinality).toBe(3n);
    orig.free(); copy.free();
  });

  test("moveFromRoaring32", () => {
    const bm32 = RoaringBitmap32.from([100, 200, 300]);
    const bm64 = RoaringBitmap64.moveFromRoaring32(bm32);
    expect(bm64.cardinality).toBe(3n);
    expect(bm64.has(100n)).toBe(true);
    bm32.free();
    bm64.free();
  });

  test("statistics", () => {
    const bm = RoaringBitmap64.from([1n, 2n, 3n]);
    const stats = bm.statistics();
    expect(stats.cardinality).toBe(3n);
    bm.free();
  });

  test("runOptimize", () => {
    const bm = RoaringBitmap64.fromRange(0n, 10000n);
    bm.runOptimize();
    expect(bm.cardinality).toBe(10000n);
    bm.free();
  });

  test("large sparse bitmap across layers", () => {
    const bm = new RoaringBitmap64();
    // Values across different high-48-bit layers
    bm.add(1n << 32n);
    bm.add((1n << 32n) + 1n);
    bm.add(2n << 32n);
    expect(bm.cardinality).toBe(3n);
    bm.free();
  });

  test("flip", () => {
    const bm = RoaringBitmap64.from([2n, 3n, 4n]);
    const flipped = bm.flip(0n, 6n);
    expect([...flipped]).toEqual([0n, 1n, 5n]);
    bm.free(); flipped.free();
  });

  test("addOffset", () => {
    const bm = RoaringBitmap64.from([1n, 2n, 3n]);
    const shifted = bm.addOffset(10n);
    expect([...shifted]).toEqual([11n, 12n, 13n]);
    bm.free(); shifted.free();
  });
});
