/**
 * Tests for RoaringBitmap32 (ported from CRoaring's C test examples).
 *
 * Run: bun test
 */

import { describe, test, expect } from "bun:test";
import { RoaringBitmap32 } from "../src/index.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check that bitmap internal validation passes. */
function assertValid(bm: RoaringBitmap32) {
  const { valid } = bm.validate();
  expect(valid).toBe(true);
}

/** Check that two bitmaps are equal. */
function assertBitmapEqual(a: RoaringBitmap32, b: RoaringBitmap32) {
  expect(a.equals(b)).toBe(true);
}

// ---------------------------------------------------------------------------
// Basic lifecycle
// ---------------------------------------------------------------------------

describe("RoaringBitmap32", () => {
  test("create empty bitmap", () => {
    const bm = new RoaringBitmap32();
    expect(bm.cardinality).toBe(0n);
    expect(bm.isEmpty).toBe(true);
    expect(bm.size).toBe(0);
    bm.free();
  });

  test("create with capacity", () => {
    const bm = new RoaringBitmap32({ capacity: 128 });
    expect(bm.cardinality).toBe(0n);
    bm.free();
  });

  test("free then operations are undefined behavior (just check no crash on free)", () => {
    const bm = new RoaringBitmap32();
    bm.free();
    // should not throw
  });

  // -----------------------------------------------------------------------
  // Add / contains
  // -----------------------------------------------------------------------

  test("add and contains", () => {
    const bm = new RoaringBitmap32();
    bm.add(42);
    expect(bm.has(42)).toBe(true);
    expect(bm.has(0)).toBe(false);
    expect(bm.has(43)).toBe(false);
    expect(bm.cardinality).toBe(1n);
    expect(bm.isEmpty).toBe(false);
    bm.free();
  });

  test("add multiple values, check min/max", () => {
    const bm = new RoaringBitmap32();
    for (let i = 0; i < 1000; i++) bm.add(i);
    expect(bm.cardinality).toBe(1000n);
    expect(bm.minimum).toBe(0);
    expect(bm.maximum).toBe(999);
    bm.free();
  });

  test("add spanning multiple containers (high bits)", () => {
    const bm = new RoaringBitmap32();
    // Values with different high 16-bit keys
    bm.add(0);
    bm.add(65536);  // key = 1
    bm.add(131072); // key = 2
    expect(bm.cardinality).toBe(3n);
    expect(bm.has(0)).toBe(true);
    expect(bm.has(65536)).toBe(true);
    expect(bm.has(131072)).toBe(true);
    bm.free();
  });

  test("addChecked returns true for new value, false for existing", () => {
    const bm = new RoaringBitmap32();
    expect(bm.addChecked(1)).toBe(true);
    expect(bm.addChecked(1)).toBe(false);
    expect(bm.cardinality).toBe(1n);
    bm.free();
  });

  test("chained add returns this", () => {
    const bm = new RoaringBitmap32()
      .add(1).add(2).add(3);
    expect(bm.cardinality).toBe(3n);
    bm.free();
  });

  // -----------------------------------------------------------------------
  // delete / remove
  // -----------------------------------------------------------------------

  test("delete returns true if value was present", () => {
    const bm = RoaringBitmap32.from([10, 20, 30]);
    expect(bm.delete(20)).toBe(true);
    expect(bm.has(20)).toBe(false);
    expect(bm.cardinality).toBe(2n);
    expect(bm.delete(999)).toBe(false);
    bm.free();
  });

  test("remove alias works", () => {
    const bm = RoaringBitmap32.from([1, 2, 3]);
    bm.remove(2);
    expect(bm.has(2)).toBe(false);
    expect(bm.cardinality).toBe(2n);
    bm.free();
  });

  test("removeChecked returns true if value was present", () => {
    const bm = RoaringBitmap32.from([1, 2, 3]);
    expect(bm.removeChecked(2)).toBe(true);
    expect(bm.removeChecked(2)).toBe(false);
    bm.free();
  });

  test("clear empties the bitmap", () => {
    const bm = RoaringBitmap32.from([1, 2, 3, 4, 5]);
    expect(bm.isEmpty).toBe(false);
    bm.clear();
    expect(bm.isEmpty).toBe(true);
    expect(bm.cardinality).toBe(0n);
    bm.free();
  });

  // -----------------------------------------------------------------------
  // addMany / removeMany
  // -----------------------------------------------------------------------

  test("addMany adds all values", () => {
    const bm = new RoaringBitmap32();
    const vals = new Uint32Array([10, 20, 30, 40, 50]);
    bm.addMany(vals);
    expect(bm.cardinality).toBe(5n);
    for (const v of vals) expect(bm.has(v)).toBe(true);
    bm.free();
  });

  test("addMany from array", () => {
    const bm = new RoaringBitmap32();
    bm.addMany([100, 200, 300]);
    expect(bm.cardinality).toBe(3n);
    bm.free();
  });

  test("removeMany removes all values", () => {
    const bm = RoaringBitmap32.from([1, 2, 3, 4, 5]);
    bm.removeMany([2, 4]);
    expect(bm.cardinality).toBe(3n);
    expect(bm.has(2)).toBe(false);
    expect(bm.has(4)).toBe(false);
    expect(bm.has(1)).toBe(true);
    bm.free();
  });

  // -----------------------------------------------------------------------
  // Range operations
  // -----------------------------------------------------------------------

  test("addRange adds values [min, max)", () => {
    const bm = new RoaringBitmap32();
    bm.addRange(0, 100);
    expect(bm.cardinality).toBe(100n);
    expect(bm.minimum).toBe(0);
    expect(bm.maximum).toBe(99);
    bm.free();
  });

  test("removeRange removes values [min, max)", () => {
    const bm = RoaringBitmap32.fromRange(0, 1000);
    bm.removeRange(100, 200);
    expect(bm.cardinality).toBe(900n);
    expect(bm.has(99)).toBe(true);
    expect(bm.has(100)).toBe(false);
    expect(bm.has(199)).toBe(false);
    expect(bm.has(200)).toBe(true);
    bm.free();
  });

  test("hasRange checks contiguous values", () => {
    const bm = RoaringBitmap32.from([1, 2, 3, 4, 5]);
    expect(bm.hasRange(1, 4)).toBe(true);   // [1,4) = {1,2,3}
    expect(bm.hasRange(1, 6)).toBe(true);   // [1,6) = {1,2,3,4,5}
    expect(bm.hasRange(1, 7)).toBe(false);  // 6 missing
    bm.free();
  });

  // -----------------------------------------------------------------------
  // Select / rank / min / max
  // -----------------------------------------------------------------------

  test("select returns element at rank", () => {
    const bm = RoaringBitmap32.from([10, 20, 30, 40, 50]);
    expect(bm.select(0)).toEqual({ value: 10, found: true });
    expect(bm.select(2)).toEqual({ value: 30, found: true });
    expect(bm.select(4)).toEqual({ value: 50, found: true });
    expect(bm.select(5)).toEqual({ value: expect.any(Number), found: false });
    bm.free();
  });

  test("rank returns count of elements ≤ value", () => {
    const bm = RoaringBitmap32.from([1, 2, 3, 10, 20]);
    expect(bm.rank(0)).toBe(0n);
    expect(bm.rank(1)).toBe(1n);
    expect(bm.rank(3)).toBe(3n);
    expect(bm.rank(10)).toBe(4n);
    expect(bm.rank(999)).toBe(5n);
    bm.free();
  });

  test("indexOf returns 0-based index or -1", () => {
    const bm = RoaringBitmap32.from([10, 20, 30]);
    expect(bm.indexOf(10)).toBe(0);
    expect(bm.indexOf(20)).toBe(1);
    expect(bm.indexOf(30)).toBe(2);
    expect(bm.indexOf(99)).toBe(-1);
    bm.free();
  });

  test("min/max on empty bitmap", () => {
    const bm = new RoaringBitmap32();
    expect(bm.minimum).toBe(4294967295); // UINT32_MAX
    expect(bm.maximum).toBe(0);
    bm.free();
  });

  // -----------------------------------------------------------------------
  // Set operations
  // -----------------------------------------------------------------------

  test("intersection", () => {
    const a = RoaringBitmap32.from([1, 2, 3, 4, 5]);
    const b = RoaringBitmap32.from([4, 5, 6, 7, 8]);
    const c = a.intersection(b);
    expect([...c]).toEqual([4, 5]);
    assertValid(c);
    a.free(); b.free(); c.free();
  });

  test("union", () => {
    const a = RoaringBitmap32.from([1, 2, 3]);
    const b = RoaringBitmap32.from([3, 4, 5]);
    const c = a.union(b);
    expect([...c]).toEqual([1, 2, 3, 4, 5]);
    assertValid(c);
    a.free(); b.free(); c.free();
  });

  test("symmetricDifference", () => {
    const a = RoaringBitmap32.from([1, 2, 3, 4]);
    const b = RoaringBitmap32.from([3, 4, 5, 6]);
    const c = a.symmetricDifference(b);
    expect([...c]).toEqual([1, 2, 5, 6]);
    a.free(); b.free(); c.free();
  });

  test("difference", () => {
    const a = RoaringBitmap32.from([1, 2, 3, 4, 5]);
    const b = RoaringBitmap32.from([4, 5, 6]);
    const c = a.difference(b);
    expect([...c]).toEqual([1, 2, 3]);
    a.free(); b.free(); c.free();
  });

  test("and alias delegates to intersection", () => {
    const a = RoaringBitmap32.from([1, 2, 3]);
    const b = RoaringBitmap32.from([2, 3, 4]);
    expect([...a.and(b)]).toEqual([2, 3]);
    a.free(); b.free();
  });

  // -----------------------------------------------------------------------
  // Cardinality of set operations
  // -----------------------------------------------------------------------

  test("andCardinality / orCardinality / xorCardinality / andnotCardinality", () => {
    const a = RoaringBitmap32.from([1, 2, 3, 4, 5]);
    const b = RoaringBitmap32.from([4, 5, 6, 7, 8]);
    expect(a.andCardinality(b)).toBe(2n);
    expect(a.orCardinality(b)).toBe(8n);
    expect(a.xorCardinality(b)).toBe(6n);
    expect(a.andnotCardinality(b)).toBe(3n);
    a.free(); b.free();
  });

  // -----------------------------------------------------------------------
  // In-place operations
  // -----------------------------------------------------------------------

  test("andInPlace modifies receiver", () => {
    const a = RoaringBitmap32.from([1, 2, 3, 4, 5]);
    const b = RoaringBitmap32.from([4, 5, 6]);
    a.andInPlace(b);
    expect([...a]).toEqual([4, 5]);
    a.free(); b.free();
  });

  test("orInPlace modifies receiver", () => {
    const a = RoaringBitmap32.from([1, 2]);
    const b = RoaringBitmap32.from([3, 4]);
    a.orInPlace(b);
    expect(a.cardinality).toBe(4n);
    a.free(); b.free();
  });

  // -----------------------------------------------------------------------
  // Comparison
  // -----------------------------------------------------------------------

  test("equals", () => {
    const a = RoaringBitmap32.from([1, 2, 3]);
    const b = RoaringBitmap32.from([1, 2, 3]);
    const c = RoaringBitmap32.from([1, 2]);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    a.free(); b.free(); c.free();
  });

  test("isSubsetOf / isSupersetOf", () => {
    const a = RoaringBitmap32.from([1, 2, 3, 4, 5]);
    const b = RoaringBitmap32.from([1, 2, 3]);
    expect(b.isSubsetOf(a)).toBe(true);
    expect(a.isSupersetOf(b)).toBe(true);
    expect(a.isSubsetOf(b)).toBe(false);
    a.free(); b.free();
  });

  test("isProperSubsetOf", () => {
    const a = RoaringBitmap32.from([1, 2, 3]);
    const b = RoaringBitmap32.from([1, 2, 3, 4]);
    const c = RoaringBitmap32.from([1, 2, 3]);
    expect(a.isProperSubsetOf(b)).toBe(true);
    expect(a.isProperSubsetOf(c)).toBe(false);  // equal, not proper
    a.free(); b.free(); c.free();
  });

  test("isDisjointFrom", () => {
    const a = RoaringBitmap32.from([1, 2, 3]);
    const b = RoaringBitmap32.from([4, 5, 6]);
    const c = RoaringBitmap32.from([3, 4]);
    expect(a.isDisjointFrom(b)).toBe(true);
    expect(a.isDisjointFrom(c)).toBe(false);
    a.free(); b.free(); c.free();
  });

  test("intersects", () => {
    const a = RoaringBitmap32.from([1, 2]);
    const b = RoaringBitmap32.from([2, 3]);
    const c = RoaringBitmap32.from([4, 5]);
    expect(a.intersects(b)).toBe(true);
    expect(a.intersects(c)).toBe(false);
    a.free(); b.free(); c.free();
  });

  test("intersectsWithRange", () => {
    const bm = RoaringBitmap32.from([10, 20, 30]);
    expect(bm.intersectsWithRange(5, 15)).toBe(true);   // 10 in [5,15)
    expect(bm.intersectsWithRange(1, 10)).toBe(false);   // 10 not in [1,10)
    expect(bm.intersectsWithRange(31, 40)).toBe(false);
    bm.free();
  });

  test("jaccardIndex", () => {
    const a = RoaringBitmap32.from([1, 2, 3, 4, 5]);
    const b = RoaringBitmap32.from([4, 5, 6]);
    const j = a.jaccardIndex(b);
    expect(j).toBeCloseTo(2 / 6, 6);  // |intersection| / |union|
    a.free(); b.free();
  });

  // -----------------------------------------------------------------------
  // flip / addOffset
  // -----------------------------------------------------------------------

  test("flip negates a range", () => {
    const bm = RoaringBitmap32.from([2, 3, 4]);
    const flipped = bm.flip(0, 6);
    // {0,1,5} were added, {2,3,4} were removed
    expect([...flipped]).toEqual([0, 1, 5]);
    expect(flipped.cardinality).toBe(3n);
    bm.free(); flipped.free();
  });

  test("addOffset shifts values", () => {
    const bm = RoaringBitmap32.from([1, 2, 3]);
    const shifted = bm.addOffset(10);
    expect([...shifted]).toEqual([11, 12, 13]);
    bm.free(); shifted.free();
  });

  // -----------------------------------------------------------------------
  // toArray
  // -----------------------------------------------------------------------

  test("toArray returns sorted elements", () => {
    const bm = RoaringBitmap32.from([3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5]);
    expect([...bm.toArray()]).toEqual([1, 2, 3, 4, 5, 6, 9]);
    bm.free();
  });

  test("toArray on empty bitmap", () => {
    const bm = new RoaringBitmap32();
    expect(bm.toArray().length).toBe(0);
    bm.free();
  });

  test("toRangeArray", () => {
    const bm = RoaringBitmap32.fromRange(0, 100);
    const { values, count } = bm.toRangeArray(10, 5);
    expect(count).toBe(5);
    expect([...values.subarray(0, 5)]).toEqual([10, 11, 12, 13, 14]);
    bm.free();
  });

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  test("portable serialize round-trip", () => {
    const bm = RoaringBitmap32.from([1, 2, 3, 1000, 65536, 100000]);
    const data = bm.portableSerialize();
    const restored = RoaringBitmap32.portableDeserialize(data);
    expect(bm.equals(restored)).toBe(true);
    assertValid(restored);
    bm.free(); restored.free();
  });

  test("portable serialize round-trip (safe)", () => {
    const bm = RoaringBitmap32.fromRange(0, 5000);
    const data = bm.portableSerialize();
    const restored = RoaringBitmap32.portableDeserializeSafe(data, data.length);
    expect(restored).not.toBeNull();
    expect(bm.equals(restored!)).toBe(true);
    bm.free(); restored!.free();
  });

  test("native serialize round-trip", () => {
    const bm = RoaringBitmap32.from([10, 20, 30, 40, 50]);
    const data = bm.serialize();
    const restored = RoaringBitmap32.deserialize(data);
    expect(bm.equals(restored)).toBe(true);
    bm.free(); restored.free();
  });

  test("native serialize round-trip (safe)", () => {
    const bm = RoaringBitmap32.fromRange(0, 1000);
    const data = bm.serialize();
    const restored = RoaringBitmap32.deserializeSafe(data, data.length);
    expect(restored).not.toBeNull();
    expect(bm.equals(restored!)).toBe(true);
    bm.free(); restored!.free();
  });

  test("serialize of empty bitmap", () => {
    const bm = new RoaringBitmap32();
    const data = bm.portableSerialize();
    expect(data.length).toBeGreaterThan(0); // header bytes
    const restored = RoaringBitmap32.portableDeserialize(data);
    expect(restored.isEmpty).toBe(true);
    bm.free(); restored.free();
  });

  // -----------------------------------------------------------------------
  // Iterator protocol
  // -----------------------------------------------------------------------

  test("for...of iteration", () => {
    const bm = RoaringBitmap32.from([1, 2, 3, 4, 5]);
    const collected: number[] = [];
    for (const v of bm) collected.push(v);
    expect(collected).toEqual([1, 2, 3, 4, 5]);
    bm.free();
  });

  test("spread into array", () => {
    const bm = RoaringBitmap32.from([10, 20, 30]);
    expect([...bm]).toEqual([10, 20, 30]);
    bm.free();
  });

  test("iterator on empty bitmap yields nothing", () => {
    const bm = new RoaringBitmap32();
    expect([...bm]).toEqual([]);
    bm.free();
  });

  test("iterator on single element", () => {
    const bm = RoaringBitmap32.from([42]);
    expect([...bm]).toEqual([42]);
    bm.free();
  });

  test("values() returns iterable", () => {
    const bm = RoaringBitmap32.from([1, 2, 3]);
    expect([...bm.values()]).toEqual([1, 2, 3]);
    bm.free();
  });

  test("keys() returns iterable", () => {
    const bm = RoaringBitmap32.from([1, 2, 3]);
    expect([...bm.keys()]).toEqual([1, 2, 3]);
    bm.free();
  });

  test("entries() yields [value, value] pairs", () => {
    const bm = RoaringBitmap32.from([1, 2, 3]);
    expect([...bm.entries()]).toEqual([[1, 1], [2, 2], [3, 3]]);
    bm.free();
  });

  test("forEach iterates all values", () => {
    const bm = RoaringBitmap32.from([1, 2, 3, 4, 5]);
    const collected: number[] = [];
    bm.forEach((v) => { collected.push(v); });
    expect(collected).toEqual([1, 2, 3, 4, 5]);
    bm.free();
  });

  test("forEach thisArg", () => {
    const bm = RoaringBitmap32.from([1, 2]);
    const ctx = { multiplier: 10, results: [] as number[] };
    bm.forEach(function (this: typeof ctx, v: number) {
      this.results.push(v * this.multiplier);
    }, ctx);
    expect(ctx.results).toEqual([10, 20]);
    bm.free();
  });

  // -----------------------------------------------------------------------
  // Static constructors
  // -----------------------------------------------------------------------

  test("RoaringBitmap32.from", () => {
    const bm = RoaringBitmap32.from([5, 3, 1, 4, 2]);
    expect([...bm]).toEqual([1, 2, 3, 4, 5]);
    assertValid(bm);
    bm.free();
  });

  test("RoaringBitmap32.from with Uint32Array", () => {
    const arr = new Uint32Array([100, 200, 300]);
    const bm = RoaringBitmap32.from(arr);
    expect(bm.cardinality).toBe(3n);
    bm.free();
  });

  test("RoaringBitmap32.fromRange", () => {
    const bm = RoaringBitmap32.fromRange(0, 10);
    expect([...bm]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    bm.free();
  });

  test("RoaringBitmap32.fromRange with step", () => {
    const bm = RoaringBitmap32.fromRange(0, 20, 3);
    expect([...bm]).toEqual([0, 3, 6, 9, 12, 15, 18]);
    bm.free();
  });

  test("RoaringBitmap32.copy", () => {
    const orig = RoaringBitmap32.from([1, 2, 3]);
    const copy = RoaringBitmap32.copy(orig);
    expect(orig.equals(copy)).toBe(true);
    copy.add(4);
    expect(orig.cardinality).toBe(3n);
    expect(copy.cardinality).toBe(4n);
    orig.free(); copy.free();
  });

  test("RoaringBitmap32.orMany", () => {
    const a = RoaringBitmap32.from([1, 2, 3]);
    const b = RoaringBitmap32.from([3, 4, 5]);
    const c = RoaringBitmap32.from([5, 6, 7]);
    const union = RoaringBitmap32.orMany([a, b, c]);
    expect([...union]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    a.free(); b.free(); c.free(); union.free();
  });

  // -----------------------------------------------------------------------
  // Optimization
  // -----------------------------------------------------------------------

  test("runOptimize compresses runs", () => {
    // A dense range will be stored as a run container
    const bm = RoaringBitmap32.fromRange(0, 10000);
    const sizeBefore = bm.portableSizeInBytes;
    const changed = bm.runOptimize();
    const sizeAfter = bm.portableSizeInBytes;
    // After run optimization, size should be smaller or same
    expect(sizeAfter).toBeLessThanOrEqual(sizeBefore);
    bm.free();
  });

  test("shrinkToFit returns bytes saved", () => {
    const bm = RoaringBitmap32.fromRange(0, 1000);
    const saved = bm.shrinkToFit();
    expect(Number.isSafeInteger(saved)).toBe(true);
    bm.free();
  });

  // -----------------------------------------------------------------------
  // Copy-on-write
  // -----------------------------------------------------------------------

  test("copyOnWrite get/set", () => {
    const bm = new RoaringBitmap32();
    expect(bm.copyOnWrite).toBe(false);
    bm.copyOnWrite = true;
    expect(bm.copyOnWrite).toBe(true);
    bm.copyOnWrite = false;
    expect(bm.copyOnWrite).toBe(false);
    bm.free();
  });

  // -----------------------------------------------------------------------
  // Statistics / validation
  // -----------------------------------------------------------------------

  test("statistics returns correct structure", () => {
    const bm = RoaringBitmap32.from([1, 2, 3, 65536, 131072]);
    const stats = bm.statistics();
    expect(stats.cardinality).toBe(5n);
    expect(stats.nContainers).toBe(3); // three different high-16-bit keys
    expect(stats.minValue).toBe(1);
    expect(stats.maxValue).toBe(131072);
    bm.free();
  });

  test("validate returns valid on well-formed bitmap", () => {
    const bm = RoaringBitmap32.from([1, 2, 3]);
    const { valid } = bm.validate();
    expect(valid).toBe(true);
    bm.free();
  });

  test("orMany with overlapping bitmaps", () => {
    const a = RoaringBitmap32.from([1, 2, 3]);
    const b = RoaringBitmap32.from([2, 3, 4]);
    const c = RoaringBitmap32.from([3, 4, 5]);
    const union = RoaringBitmap32.orMany([a, b, c]);
    expect(union.cardinality).toBe(5n);
    expect([...union]).toEqual([1, 2, 3, 4, 5]);
    a.free(); b.free(); c.free(); union.free();
  });

  // -----------------------------------------------------------------------
  // Large / stress
  // -----------------------------------------------------------------------

  test("large dense bitmap (10k elements)", () => {
    const bm = RoaringBitmap32.fromRange(0, 10000);
    expect(bm.cardinality).toBe(10000n);
    expect(bm.minimum).toBe(0);
    expect(bm.maximum).toBe(9999);

    // Check some values
    expect(bm.has(0)).toBe(true);
    expect(bm.has(5000)).toBe(true);
    expect(bm.has(9999)).toBe(true);
    expect(bm.has(10000)).toBe(false);

    // Serialize round-trip
    const data = bm.portableSerialize();
    const restored = RoaringBitmap32.portableDeserialize(data);
    expect(bm.equals(restored)).toBe(true);
    restored.free();
    bm.free();
  });

  test("sparse bitmap across many containers", () => {
    const bm = new RoaringBitmap32();
    // Every 2^16 boundary
    for (let i = 0; i < 10; i++) {
      bm.add(i * 65536 + 1);
    }
    expect(bm.cardinality).toBe(10n);
    expect(bm.minimum).toBe(1);
    expect(bm.maximum).toBe(9 * 65536 + 1);
    bm.free();
  });

  // -----------------------------------------------------------------------
  // Flip / in-place flip
  // -----------------------------------------------------------------------

  test("flipInPlace", () => {
    const bm = RoaringBitmap32.from([2, 3, 4]);
    bm.flipInPlace(0, 6);
    expect([...bm]).toEqual([0, 1, 5]);
    bm.free();
  });
});
