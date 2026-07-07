/**
 * High-level 32-bit RoaringBitmap wrapper.
 *
 * Provides an idiomatic JavaScript API on top of the raw CRoaring FFI
 * bindings. Each instance wraps an allocated `roaring_bitmap_t*` pointer
 * and frees it when garbage-collected (via FinalizationRegistry) or when
 * `.free()` is called explicitly.
 */

import { CString } from "bun:ffi";

import {
  roaring_bitmap_create,
  roaring_bitmap_create_with_capacity,
  roaring_bitmap_free,
  roaring_bitmap_copy,
  roaring_bitmap_add,
  roaring_bitmap_add_checked,
  roaring_bitmap_add_many,
  roaring_bitmap_add_range,
  roaring_bitmap_remove,
  roaring_bitmap_remove_checked,
  roaring_bitmap_remove_many,
  roaring_bitmap_remove_range,
  roaring_bitmap_contains,
  roaring_bitmap_contains_range,
  roaring_bitmap_clear,
  roaring_bitmap_get_cardinality,
  roaring_bitmap_is_empty,
  roaring_bitmap_minimum,
  roaring_bitmap_maximum,
  roaring_bitmap_select,
  roaring_bitmap_rank,
  roaring_bitmap_get_index,
  roaring_bitmap_and,
  roaring_bitmap_or,
  roaring_bitmap_xor,
  roaring_bitmap_andnot,
  roaring_bitmap_and_cardinality,
  roaring_bitmap_or_cardinality,
  roaring_bitmap_xor_cardinality,
  roaring_bitmap_andnot_cardinality,
  roaring_bitmap_intersect,
  roaring_bitmap_intersect_with_range,
  roaring_bitmap_jaccard_index,
  roaring_bitmap_equals,
  roaring_bitmap_is_subset,
  roaring_bitmap_is_strict_subset,
  roaring_bitmap_and_inplace,
  roaring_bitmap_or_inplace,
  roaring_bitmap_xor_inplace,
  roaring_bitmap_andnot_inplace,
  roaring_bitmap_flip,
  roaring_bitmap_flip_inplace,
  roaring_bitmap_add_offset,
  roaring_bitmap_to_uint32_array,
  roaring_bitmap_range_uint32_array,
  roaring_bitmap_run_optimize,
  roaring_bitmap_remove_run_compression,
  roaring_bitmap_shrink_to_fit,
  roaring_bitmap_of_ptr,
  roaring_bitmap_from_range,
  roaring_bitmap_or_many,
  roaring_bitmap_portable_size_in_bytes,
  roaring_bitmap_portable_serialize,
  roaring_bitmap_portable_deserialize,
  roaring_bitmap_portable_deserialize_safe,
  roaring_bitmap_size_in_bytes,
  roaring_bitmap_serialize,
  roaring_bitmap_deserialize,
  roaring_bitmap_deserialize_safe,
  roaring_bitmap_statistics,
  roaring_bitmap_internal_validate,
  roaring_bitmap_get_copy_on_write,
  roaring_bitmap_set_copy_on_write,
  roaring_contains_shared,
  roaring_unshare_all,
  roaring_bitmap_lazy_or,
  roaring_bitmap_lazy_or_inplace,
  roaring_bitmap_lazy_xor,
  roaring_bitmap_lazy_xor_inplace,
  roaring_bitmap_repair_after_lazy,
  ptr as toPtr,
  toArrayBuffer,
  read,
  roaring_iterator_create,
  roaring_uint32_iterator_free,
  roaring_uint32_iterator_advance,
} from "./ffi.ts";

// ---- helpers -----------------------------------------------------------

/** Aligned size of `roaring_statistics_t` (12× uint32 + 4 padding + 2× uint64). */
const STATS_SIZE = 64;

/** Interpret a buffer as a statistics struct. */
function readStats(buf: ArrayBuffer): RoaringStatistics {
  const dv = new DataView(buf);
  return {
    nContainers: dv.getUint32(0, true),
    nArrayContainers: dv.getUint32(4, true),
    nRunContainers: dv.getUint32(8, true),
    nBitsetContainers: dv.getUint32(12, true),
    nValuesArrayContainers: dv.getUint32(16, true),
    nValuesRunContainers: dv.getUint32(20, true),
    nValuesBitsetContainers: dv.getUint32(24, true),
    nBytesArrayContainers: dv.getUint32(28, true),
    nBytesRunContainers: dv.getUint32(32, true),
    nBytesBitsetContainers: dv.getUint32(36, true),
    maxValue: dv.getUint32(40, true),
    minValue: dv.getUint32(44, true),
    // padding at 48-51 (4 bytes to align uint64)
    sumValue: Number(dv.getBigUint64(48, true)),
    cardinality: dv.getBigUint64(56, true),
  };
}

// ---- types -------------------------------------------------------------

export interface RoaringStatistics {
  nContainers: number;
  nArrayContainers: number;
  nRunContainers: number;
  nBitsetContainers: number;
  nValuesArrayContainers: number;
  nValuesRunContainers: number;
  nValuesBitsetContainers: number;
  nBytesArrayContainers: number;
  nBytesRunContainers: number;
  nBytesBitsetContainers: number;
  maxValue: number;
  minValue: number;
  sumValue: number;
  cardinality: bigint;
}

export interface RoaringBitmap32Opts {
  capacity?: number;
}

// ---- constants (roaring_uint32_iterator_t struct layout) ---------------
// Verified on x86_64 Linux (System V ABI):
//   parent(ptr.8) + container(ptr.8) + typecode(u8.1) + pad(3)
//   + container_index(i32.4) + highbits(u32.4) + container_it.index(i32.4)
//   + current_value(u32.4) + has_value(u8.1) + pad(3)  =  40 bytes
const ITER32_CURVAL_OFF = 32;
const ITER32_HASVAL_OFF = 36;

// ---- 32-bit iterator ---------------------------------------------------

export class RoaringBitmap32Iterator implements Iterator<number> {
  /** Pointer to the C `roaring_uint32_iterator_t`. 0 once exhausted. */
  #it: number;
  #started = false;

  constructor(bitmap: RoaringBitmap32) {
    this.#it = roaring_iterator_create(bitmap.ptr);
  }

  next(): IteratorResult<number> {
    if (this.#it === 0) return { value: undefined as any, done: true };

    if (!this.#started) {
      this.#started = true;
      if (read.u8(this.#it, ITER32_HASVAL_OFF)) {
        return { value: read.u32(this.#it, ITER32_CURVAL_OFF), done: false };
      }
    } else {
      if (roaring_uint32_iterator_advance(this.#it)) {
        return { value: read.u32(this.#it, ITER32_CURVAL_OFF), done: false };
      }
    }

    roaring_uint32_iterator_free(this.#it);
    this.#it = 0;
    return { value: undefined as any, done: true };
  }

  [Symbol.iterator](): RoaringBitmap32Iterator {
    return this;
  }
}

// ---- FinalizationRegistry ----------------------------------------------

const finalizers = new FinalizationRegistry((ptr: number) => {
  roaring_bitmap_free(ptr);
});

// ---- main class --------------------------------------------------------

export class RoaringBitmap32 {
  /** Opaque pointer to the C `roaring_bitmap_t` */
  readonly #ptr: number;

  /**
   * Create a new empty bitmap, or wrap an existing pointer.
   *
   * When `arg` is a `number`, it is assumed to be a valid
   * `roaring_bitmap_t*` pointer (advanced use). Otherwise a new
   * bitmap is allocated.
   */
  constructor(arg?: number | RoaringBitmap32Opts) {
    if (typeof arg === "number") {
      this.#ptr = arg;
    } else {
      const cap = arg?.capacity ?? 0;
      this.#ptr =
        cap > 0
          ? roaring_bitmap_create_with_capacity(cap)
          : roaring_bitmap_create();
      if (this.#ptr === 0 || this.#ptr === null) {
        throw new Error("RoaringBitmap32: failed to allocate bitmap");
      }
    }
    finalizers.register(this, this.#ptr, this);
  }

  /** The raw pointer (for advanced interop). */
  get ptr(): number {
    return this.#ptr;
  }

  /** Release the underlying C bitmap. */
  free(): void {
    finalizers.unregister(this);
    roaring_bitmap_free(this.#ptr);
  }

  // ---- add / remove / contains ----------------------------------------

  /**
   * Add a single value to the set.
   *
   * Wraps `roaring_bitmap_add`.
   * Returns `this` for chaining.
   *
   * @example
   * ```ts
   * bitmap.add(42);
   * bitmap.add(1).add(2).add(3);
   * ```
   */
  add(value: number): this {
    roaring_bitmap_add(this.#ptr, value);
    return this;
  }

  /**
   * Add a single value, returning `true` only if it wasn't already present.
   *
   * Wraps `roaring_bitmap_add_checked`.
   * Useful when you need to know whether the bitmap changed.
   */
  addChecked(value: number): boolean {
    return roaring_bitmap_add_checked(this.#ptr, value);
  }

  /**
   * Add many values at once.
   *
   * Wraps `roaring_bitmap_add_many`. More efficient than repeated
   * calls to `add()` when adding many values, especially when the
   * values with the same high 16 bits are grouped together.
   *
   * Accepts both `number[]` and `Uint32Array`.
   */
  addMany(values: readonly number[] | Uint32Array): void {
    const buf = values instanceof Uint32Array ? values : new Uint32Array(values);
    roaring_bitmap_add_many(this.#ptr, buf.length, buf);
  }

  /**
   * Add all values in the range `[min, max)` (half-open interval).
   *
   * Wraps `roaring_bitmap_add_range`. `min` is included, `max` is excluded.
   * Equivalent to adding every integer from `min` to `max - 1`.
   */
  addRange(min: number, max: number): void {
    roaring_bitmap_add_range(this.#ptr, min, max);
  }

  /**
   * Remove a single value (Set-compatible name).
   *
   * Wraps `roaring_bitmap_contains` / `roaring_bitmap_remove`.
   * Returns `true` if the value was present and removed, `false` if
   * it wasn't in the set.
   *
   * Also available as `remove()`.
   */
  delete(value: number): boolean {
    const prev = roaring_bitmap_contains(this.#ptr, value);
    if (prev) roaring_bitmap_remove(this.#ptr, value);
    return prev;
  }

  /** Remove a single value (alias for `delete`). */
  remove(value: number): boolean {
    return this.delete(value);
  }

  /**
   * Remove a single value, returning `true` only if it was present.
   *
   * Wraps `roaring_bitmap_remove_checked`.
   * Unlike `delete`/`remove`, this returns whether the value existed
   * before removal.
   */
  removeChecked(value: number): boolean {
    return roaring_bitmap_remove_checked(this.#ptr, value);
  }

  /**
   * Remove many values at once.
   *
   * Wraps `roaring_bitmap_remove_many`. More efficient than repeated
   * calls to `remove()`.
   */
  removeMany(values: readonly number[] | Uint32Array): void {
    const buf = values instanceof Uint32Array ? values : new Uint32Array(values);
    roaring_bitmap_remove_many(this.#ptr, buf.length, buf);
  }

  /**
   * Remove all values in the range `[min, max)` (half-open interval).
   *
   * Wraps `roaring_bitmap_remove_range`. `min` is included, `max` is excluded.
   */
  removeRange(min: number, max: number): void {
    roaring_bitmap_remove_range(this.#ptr, min, max);
  }

  /**
   * Returns `true` if `value` is in the set.
   *
   * Wraps `roaring_bitmap_contains`. O(1) average, O(log n) worst case.
   */
  has(value: number): boolean {
    return roaring_bitmap_contains(this.#ptr, value);
  }

  /**
   * Returns `true` if all values in the half-open range `[min, max)` are present.
   *
   * Wraps `roaring_bitmap_contains_range`.
   */
  hasRange(min: number, max: number): boolean {
    return roaring_bitmap_contains_range(this.#ptr, min, max);
  }

  /**
   * Remove all elements from the bitmap.
   *
   * Wraps `roaring_bitmap_clear`. The bitmap remains valid and
   * can be reused.
   */
  clear(): void {
    roaring_bitmap_clear(this.#ptr);
  }

  // ---- cardinality / queries ------------------------------------------

  /**
   * Number of elements in the bitmap.
   *
   * Wraps `roaring_bitmap_get_cardinality`. Returns a `bigint` because
   * bitmaps can hold more than 2^53 values. Use `size` for a `number`.
   */
  get cardinality(): bigint {
    return roaring_bitmap_get_cardinality(this.#ptr);
  }

  /** `true` if the bitmap contains no elements. */
  get isEmpty(): boolean {
    return roaring_bitmap_is_empty(this.#ptr);
  }

  /**
   * The smallest element in the set.
   *
   * Returns `4294967295` (`UINT32_MAX`) if the bitmap is empty.
   */
  get minimum(): number {
    return roaring_bitmap_minimum(this.#ptr);
  }

  /**
   * The largest element in the set.
   *
   * Returns `0` if the bitmap is empty.
   */
  get maximum(): number {
    return roaring_bitmap_maximum(this.#ptr);
  }

  /**
   * Return the element at the given 0-based rank (select operation).
   *
   * Wraps `roaring_bitmap_select`. `rank` is 0-based, so `select(0)`
   * returns the smallest element.
   *
   * Returns `{ value, found }` where `found` is `false` when
   * `rank >= cardinality`.
   *
   * @example
   * ```ts
   * const { value, found } = bitmap.select(0);
   * if (found) console.log('smallest element:', value);
   * ```
   */
  select(rank: number): { value: number; found: boolean } {
    const out = new Uint32Array(1);
    const found = roaring_bitmap_select(this.#ptr, rank, out);
    return { value: out[0], found };
  }

  /**
   * Return the number of elements less than or equal to `value`.
   *
   * Wraps `roaring_bitmap_rank`. Returns 0 if `value` is smaller
   * than the smallest element. Uses a 1-based convention where
   * ranking the smallest element returns 1 (unlike the 0-based
   * `select`/`indexOf`).
   */
  rank(value: number): bigint {
    return roaring_bitmap_rank(this.#ptr, value);
  }

  /**
   * Return the 0-based index of `value`, or `-1` if not present.
   *
   * Wraps `roaring_bitmap_get_index`. The difference from `rank` is
   * that this returns `-1` when the value isn't in the set, while
   * `rank` returns the count of elements ≤ value regardless.
   */
  indexOf(value: number): number {
    return Number(roaring_bitmap_get_index(this.#ptr, value));
  }

  // ---- set operations (returning new bitmap) --------------------------

  /**
   * Returns a new bitmap with elements present in both `this` and `other`.
   *
   * Wraps `roaring_bitmap_and`. The caller is responsible for freeing
   * the returned bitmap.
   *
   * (Set-compatible name; also available as `and`.)
   */
  intersection(other: RoaringBitmap32): RoaringBitmap32 {
    const ptr = roaring_bitmap_and(this.#ptr, other.#ptr);
    return new RoaringBitmap32(ptr);
  }

  /** @alias intersection */
  and(other: RoaringBitmap32): RoaringBitmap32 {
    return this.intersection(other);
  }

  /**
   * Returns a new bitmap with elements present in either `this` or `other`.
   *
   * Wraps `roaring_bitmap_or`. The caller is responsible for freeing
   * the returned bitmap.
   *
   * (Set-compatible name; also available as `or`.)
   */
  union(other: RoaringBitmap32): RoaringBitmap32 {
    const ptr = roaring_bitmap_or(this.#ptr, other.#ptr);
    return new RoaringBitmap32(ptr);
  }

  /** @alias union */
  or(other: RoaringBitmap32): RoaringBitmap32 {
    return this.union(other);
  }

  /**
   * Returns a new bitmap with elements present in exactly one of `this` or `other`.
   *
   * Wraps `roaring_bitmap_xor`. The caller is responsible for freeing
   * the returned bitmap.
   *
   * (Set-compatible name; also available as `xor`.)
   */
  symmetricDifference(other: RoaringBitmap32): RoaringBitmap32 {
    const ptr = roaring_bitmap_xor(this.#ptr, other.#ptr);
    return new RoaringBitmap32(ptr);
  }

  /** @alias symmetricDifference */
  xor(other: RoaringBitmap32): RoaringBitmap32 {
    return this.symmetricDifference(other);
  }

  /**
   * Returns a new bitmap with elements in `this` but not in `other`.
   *
   * Wraps `roaring_bitmap_andnot`. The caller is responsible for freeing
   * the returned bitmap.
   *
   * (Set-compatible name; also available as `andnot`.)
   */
  difference(other: RoaringBitmap32): RoaringBitmap32 {
    const ptr = roaring_bitmap_andnot(this.#ptr, other.#ptr);
    return new RoaringBitmap32(ptr);
  }

  /** @alias difference */
  andnot(other: RoaringBitmap32): RoaringBitmap32 {
    return this.difference(other);
  }

  // ---- set operation cardinalities ------------------------------------

  /**
   * Cardinality of `this.intersection(other)` without allocating a new bitmap.
   * Wraps `roaring_bitmap_and_cardinality`.
   */
  andCardinality(other: RoaringBitmap32): bigint {
    return roaring_bitmap_and_cardinality(this.#ptr, other.#ptr);
  }

  /**
   * Cardinality of `this.union(other)` without allocating a new bitmap.
   * Wraps `roaring_bitmap_or_cardinality`.
   */
  orCardinality(other: RoaringBitmap32): bigint {
    return roaring_bitmap_or_cardinality(this.#ptr, other.#ptr);
  }

  /**
   * Cardinality of `this.symmetricDifference(other)` without allocating a new bitmap.
   * Wraps `roaring_bitmap_xor_cardinality`.
   */
  xorCardinality(other: RoaringBitmap32): bigint {
    return roaring_bitmap_xor_cardinality(this.#ptr, other.#ptr);
  }

  /**
   * Cardinality of `this.difference(other)` without allocating a new bitmap.
   * Wraps `roaring_bitmap_andnot_cardinality`.
   */
  andnotCardinality(other: RoaringBitmap32): bigint {
    return roaring_bitmap_andnot_cardinality(this.#ptr, other.#ptr);
  }

  /**
   * Returns `true` if the two bitmaps share any element.
   *
   * Wraps `roaring_bitmap_intersect`. More efficient than
   * `intersection(other).isEmpty` because it short-circuits.
   */
  intersects(other: RoaringBitmap32): boolean {
    return roaring_bitmap_intersect(this.#ptr, other.#ptr);
  }

  /**
   * Returns `true` if the two bitmaps have no element in common.
   * Equivalent to `!intersects(other)`.
   *
   * (Set-compatible name.)
   */
  isDisjointFrom(other: RoaringBitmap32): boolean {
    return !roaring_bitmap_intersect(this.#ptr, other.#ptr);
  }

  /**
   * Returns `true` if the bitmap intersects the half-open range `[min, max)`.
   * Wraps `roaring_bitmap_intersect_with_range`.
   */
  intersectsWithRange(min: number, max: number): boolean {
    return roaring_bitmap_intersect_with_range(this.#ptr, min, max);
  }

  /**
   * Jaccard similarity coefficient (Tanimoto distance) between two bitmaps.
   *
   * Wraps `roaring_bitmap_jaccard_index`. Result is in `[0, 1]`.
   * Returns `0` if both are empty.
   */
  jaccardIndex(other: RoaringBitmap32): number {
    return roaring_bitmap_jaccard_index(this.#ptr, other.#ptr);
  }

  // ---- set operations (in-place) --------------------------------------

  /**
   * In-place intersection. Modifies `this`.
   * Wraps `roaring_bitmap_and_inplace`.
   */
  andInPlace(other: RoaringBitmap32): void {
    roaring_bitmap_and_inplace(this.#ptr, other.#ptr);
  }

  /**
   * In-place union. Modifies `this`.
   * Wraps `roaring_bitmap_or_inplace`.
   */
  orInPlace(other: RoaringBitmap32): void {
    roaring_bitmap_or_inplace(this.#ptr, other.#ptr);
  }

  /**
   * In-place symmetric difference. Modifies `this`.
   * Wraps `roaring_bitmap_xor_inplace`.
   */
  xorInPlace(other: RoaringBitmap32): void {
    roaring_bitmap_xor_inplace(this.#ptr, other.#ptr);
  }

  /**
   * In-place difference. Modifies `this`.
   * Wraps `roaring_bitmap_andnot_inplace`.
   */
  andnotInPlace(other: RoaringBitmap32): void {
    roaring_bitmap_andnot_inplace(this.#ptr, other.#ptr);
  }

  // ---- lazy operations ------------------------------------------------

  /**
   * Lazy union. Returns a new bitmap.
   *
   * Wraps `roaring_bitmap_lazy_or`. Defers cardinality computation
   * and container-type decisions. **Must** call `repairAfterLazy()`
   * before using the result.
   *
   * @param bitsetConversion - When `true`, intermediate results force
   *   bitset conversion for faster subsequent lazy operations.
   *
   * @see repairAfterLazy
   */
  lazyOr(other: RoaringBitmap32, bitsetConversion = false): RoaringBitmap32 {
    const ptr = roaring_bitmap_lazy_or(this.#ptr, other.#ptr, bitsetConversion);
    return new RoaringBitmap32(ptr);
  }

  /**
   * In-place lazy union. Modifies `this`.
   *
   * Wraps `roaring_bitmap_lazy_or_inplace`.
   * **Must** call `repairAfterLazy()` before further use.
   */
  lazyOrInPlace(other: RoaringBitmap32, bitsetConversion = false): void {
    roaring_bitmap_lazy_or_inplace(this.#ptr, other.#ptr, bitsetConversion);
  }

  /**
   * Lazy symmetric difference. Returns a new bitmap.
   *
   * Wraps `roaring_bitmap_lazy_xor`. **Must** call `repairAfterLazy()`
   * before using the result.
   */
  lazyXor(other: RoaringBitmap32): RoaringBitmap32 {
    const ptr = roaring_bitmap_lazy_xor(this.#ptr, other.#ptr);
    return new RoaringBitmap32(ptr);
  }

  /**
   * In-place lazy symmetric difference. Modifies `this`.
   *
   * Wraps `roaring_bitmap_lazy_xor_inplace`.
   * **Must** call `repairAfterLazy()` before further use.
   */
  lazyXorInPlace(other: RoaringBitmap32): void {
    roaring_bitmap_lazy_xor_inplace(this.#ptr, other.#ptr);
  }

  /**
   * Recompute cardinalities and finalize container types after lazy operations.
   *
   * Wraps `roaring_bitmap_repair_after_lazy`.
   * Required after any `lazyOr*`/`lazyXor*` call before the bitmap
   * can be used with non-lazy operations.
   */
  repairAfterLazy(): void {
    roaring_bitmap_repair_after_lazy(this.#ptr);
  }

  // ---- comparison -----------------------------------------------------

  /**
   * Returns `true` if both bitmaps contain exactly the same elements.
   *
   * Wraps `roaring_bitmap_equals`.
   */
  equals(other: RoaringBitmap32): boolean {
    return roaring_bitmap_equals(this.#ptr, other.#ptr);
  }

  /**
   * `true` if all elements of `this` are also in `other`.
   *
   * Wraps `roaring_bitmap_is_subset`.
   * (Set-compatible name; also available as `isSubset`.)
   */
  isSubsetOf(other: RoaringBitmap32): boolean {
    return roaring_bitmap_is_subset(this.#ptr, other.#ptr);
  }

  /** @alias isSubsetOf */
  isSubset(other: RoaringBitmap32): boolean {
    return this.isSubsetOf(other);
  }

  /**
   * `true` if `this` is a proper (strict) subset of `other`.
   *
   * Wraps `roaring_bitmap_is_strict_subset`. Unlike `isSubsetOf`,
   * returns `false` if the two bitmaps are equal.
   *
   * (Set-compatible name; also available as `isStrictSubset`.)
   */
  isProperSubsetOf(other: RoaringBitmap32): boolean {
    return roaring_bitmap_is_strict_subset(this.#ptr, other.#ptr);
  }

  /** @alias isProperSubsetOf */
  isStrictSubset(other: RoaringBitmap32): boolean {
    return this.isProperSubsetOf(other);
  }

  // ---- flip / offset --------------------------------------------------

  /**
   * Return a new bitmap with the values in `[min, max)` negated.
   *
   * Wraps `roaring_bitmap_flip`. Areas outside the range are
   * passed through unchanged. The caller frees the result.
   */
  flip(min: number, max: number): RoaringBitmap32 {
    const ptr = roaring_bitmap_flip(this.#ptr, min, max);
    return new RoaringBitmap32(ptr);
  }

  /**
   * In-place flip for the range `[min, max)`. Modifies `this`.
   *
   * Wraps `roaring_bitmap_flip_inplace`.
   */
  flipInPlace(min: number, max: number): void {
    roaring_bitmap_flip_inplace(this.#ptr, min, max);
  }

  /**
   * Return a new bitmap with all values shifted by `offset`.
   *
   * Wraps `roaring_bitmap_add_offset`. Positive offset shifts values
   * up, negative shifts down. Values that overflow `uint32_t` are
   * dropped. The caller frees the result.
   */
  addOffset(offset: number): RoaringBitmap32 {
    const ptr = roaring_bitmap_add_offset(this.#ptr, offset);
    return new RoaringBitmap32(ptr);
  }

  // ---- conversion -----------------------------------------------------

  /**
   * Convert the bitmap to a sorted array of uint32 values.
   *
   * Wraps `roaring_bitmap_to_uint32_array`. The result is always
   * sorted in ascending order.
   */
  toArray(): Uint32Array {
    const n = Number(roaring_bitmap_get_cardinality(this.#ptr));
    const out = new Uint32Array(n);
    if (n > 0) {
      roaring_bitmap_to_uint32_array(this.#ptr, out);
    }
    return out;
  }

  /**
   * Read a slice of the bitmap as an array.
   *
   * Wraps `roaring_bitmap_range_uint32_array`. Reads up to `limit`
   * values starting from `offset`. Useful for pagination.
   */
  toRangeArray(offset: number, limit: number): { values: Uint32Array; count: number } {
    const out = new Uint32Array(limit);
    const ok = roaring_bitmap_range_uint32_array(this.#ptr, offset, limit, out);
    return { values: out, count: ok ? limit : 0 };
  }

  // ---- serialization (portable, cross-language) -----------------------

  /**
   * Number of bytes required for portable serialization.
   *
   * Wraps `roaring_bitmap_portable_size_in_bytes`.
   * The portable format is compatible with Java and Go
   * implementations of RoaringBitmap.
   */
  get portableSizeInBytes(): number {
    return Number(roaring_bitmap_portable_size_in_bytes(this.#ptr));
  }

  /**
   * Serialize to a portable (cross-language) buffer.
   *
   * Wraps `roaring_bitmap_portable_serialize`. The format is
   * compatible with Java and Go RoaringBitmap implementations.
   * Use `portableDeserialize` to restore.
   */
  portableSerialize(): Uint8Array {
    const n = Number(roaring_bitmap_portable_size_in_bytes(this.#ptr));
    const buf = new Uint8Array(n);
    roaring_bitmap_portable_serialize(this.#ptr, buf);
    return buf;
  }

  /**
   * Deserialize from a portable buffer.
   *
   * Wraps `roaring_bitmap_portable_deserialize`. Throws if the
   * buffer does not contain a valid bitmap.
   * For untrusted data, prefer `portableDeserializeSafe`.
   */
  static portableDeserialize(buf: ArrayBuffer | Uint8Array): RoaringBitmap32 {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const ptr = roaring_bitmap_portable_deserialize(
      b as unknown as string,
    );
    if (!ptr) throw new Error("RoaringBitmap32.portableDeserialize: failed");
    return new RoaringBitmap32(ptr);
  }

  /**
   * Safe deserialize from a portable buffer (bounds-checked).
   *
   * Wraps `roaring_bitmap_portable_deserialize_safe`. Returns `null`
   * on failure instead of throwing. Recommended for untrusted data.
   * Call `validate()` on the result before use.
   */
  static portableDeserializeSafe(buf: ArrayBuffer | Uint8Array, maxBytes: number): RoaringBitmap32 | null {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const ptr = roaring_bitmap_portable_deserialize_safe(
      b as unknown as string,
      maxBytes,
    );
    return ptr ? new RoaringBitmap32(ptr) : null;
  }

  // ---- serialization (native) -----------------------------------------

  /**
   * Number of bytes required for native serialization.
   *
   * Wraps `roaring_bitmap_size_in_bytes`. The native format is
   * C-specific and not compatible with other language implementations.
   */
  get sizeInBytes(): number {
    return Number(roaring_bitmap_size_in_bytes(this.#ptr));
  }

  /**
   * Serialize to a native (C-optimized) buffer.
   *
   * Wraps `roaring_bitmap_serialize`. May be more compact than
   * portable format for sparse data. Not compatible with Java/Go.
   */
  serialize(): Uint8Array {
    const n = Number(roaring_bitmap_size_in_bytes(this.#ptr));
    const buf = new Uint8Array(n);
    roaring_bitmap_serialize(this.#ptr, buf);
    return buf;
  }

  /**
   * Deserialize from a native buffer.
   *
   * Wraps `roaring_bitmap_deserialize`. Throws on failure.
   * For untrusted data, prefer `deserializeSafe`.
   */
  static deserialize(buf: ArrayBuffer | Uint8Array): RoaringBitmap32 {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const ptr = roaring_bitmap_deserialize(b);
    if (!ptr) throw new Error("RoaringBitmap32.deserialize: failed");
    return new RoaringBitmap32(ptr);
  }

  /**
   * Safe deserialize from a native buffer (bounds-checked).
   *
   * Wraps `roaring_bitmap_deserialize_safe`. Returns `null` on
   * failure. Call `validate()` on the result before use.
   */
  static deserializeSafe(buf: ArrayBuffer | Uint8Array, maxBytes: number): RoaringBitmap32 | null {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const ptr = roaring_bitmap_deserialize_safe(b, maxBytes);
    return ptr ? new RoaringBitmap32(ptr) : null;
  }

  // ---- optimization ---------------------------------------------------

  /**
   * Convert array and bitmap containers to run containers where
   * more space-efficient.
   *
   * Wraps `roaring_bitmap_run_optimize`. Returns `true` if at least
   * one run container was created. Can reduce serialization size
   * for dense ranges.
   */
  runOptimize(): boolean {
    return roaring_bitmap_run_optimize(this.#ptr);
  }

  /**
   * Remove run-length encoding, reverting to array/bitmap containers.
   *
   * Wraps `roaring_bitmap_remove_run_compression`. Returns `true`
   * if any containers were converted.
   */
  removeRunCompression(): boolean {
    return roaring_bitmap_remove_run_compression(this.#ptr);
  }

  /**
   * Reallocate internal buffers to shrink memory usage.
   *
   * Wraps `roaring_bitmap_shrink_to_fit`. Returns the number of
   * bytes saved.
   */
  shrinkToFit(): number {
    return Number(roaring_bitmap_shrink_to_fit(this.#ptr));
  }

  // ---- copy-on-write --------------------------------------------------

  /**
   * Whether copy-on-write is enabled for this bitmap.
   *
   * Wraps `roaring_bitmap_get_copy_on_write` / `roaring_bitmap_set_copy_on_write`.
   * When enabled, containers can be shared between bitmaps to save
   * memory. Must be set consistently across interacting bitmaps.
   */
  get copyOnWrite(): boolean {
    return roaring_bitmap_get_copy_on_write(this.#ptr);
  }

  set copyOnWrite(cow: boolean) {
    roaring_bitmap_set_copy_on_write(this.#ptr, cow);
  }

  /**
   * `true` if the bitmap has shared containers (when COW is enabled).
   *
   * Wraps `roaring_contains_shared`.
   */
  get containsShared(): boolean {
    return roaring_contains_shared(this.#ptr);
  }

  /**
   * Clone all shared containers so this bitmap owns its data.
   *
   * Wraps `roaring_unshare_all`. Returns `true` if any containers
   * were unshared.
   */
  unshareAll(): boolean {
    return roaring_unshare_all(this.#ptr);
  }

  // ---- statistics / validation ----------------------------------------

  /**
   * Collect detailed statistics about the internal composition of
   * the bitmap (number of containers by type, byte usage, etc.).
   *
   * Wraps `roaring_bitmap_statistics`.
   */
  statistics(): RoaringStatistics {
    const buf = new ArrayBuffer(STATS_SIZE);
    roaring_bitmap_statistics(this.#ptr, toPtr(new Uint8Array(buf)));
    return readStats(buf);
  }

  /**
   * Internal consistency check.
   * Walks the bitmap's internal structure and verifies invariants:
   *   - containers are sorted by key
   *   - array containers hold sorted, unique values
   *   - run containers have sorted, non-overlapping runs
   *   - bitset containers have the right structure
   *   - typecode flags match the actual container type
   *   - cardinalities are consistent
   *
   * Returns `{ valid, reason }` where `reason` is `null` when valid.
   * Useful after deserializing untrusted data or after lazy operations.
   */
  validate(): { valid: boolean; reason: string | null } {
    const reasonBuf = new BigUint64Array(1);
    const valid = roaring_bitmap_internal_validate(this.#ptr, reasonBuf);
    const reasonPtr = Number(reasonBuf[0]);
    const reason = reasonPtr !== 0 ? String(new CString(reasonPtr)) : null;
    return { valid, reason };
  }

  // ---- iteration & Set compatibility ---------------------------------

  /**
   * Returns the number of elements as a JavaScript `number`.
   * For bitmaps with > 2^53 elements, use `cardinality` (which returns `bigint`).
   */
  get size(): number {
    return Number(roaring_bitmap_get_cardinality(this.#ptr));
  }

  /** Iterate over all values in ascending order. */
  *[Symbol.iterator](): IterableIterator<number> {
    const it = new RoaringBitmap32Iterator(this);
    let result = it.next();
    while (!result.done) {
      yield result.value;
      result = it.next();
    }
  }

  /** Same as `[Symbol.iterator]()`. */
  values(): IterableIterator<number> {
    return this[Symbol.iterator]();
  }

  /** Alias for `values()` (Set compatibility). */
  keys(): IterableIterator<number> {
    return this.values();
  }

  /**
   * Returns an iterable of `[value, value]` pairs (Set compatibility).
   *
   * ```ts
   * for (const [k, v] of bitmap.entries()) { ... }
   * ```
   */
  *entries(): IterableIterator<[number, number]> {
    for (const v of this) {
      yield [v, v];
    }
  }

  /** Calls `callbackfn` for each value in the bitmap (Set compatibility). */
  forEach(callbackfn: (value: number, key: number, set: RoaringBitmap32) => void, thisArg?: any): void {
    for (const v of this) {
      callbackfn.call(thisArg, v, v, this);
    }
  }

  /**
   * `true` if all elements of `other` are also in `this`.
   * (Set-compatible name.)
   */
  isSupersetOf(other: RoaringBitmap32): boolean {
    return other.isSubsetOf(this);
  }

  // ---- static constructors --------------------------------------------

  /** Create a bitmap containing the given values. */
  static from(values: readonly number[] | Uint32Array): RoaringBitmap32 {
    const buf = values instanceof Uint32Array ? values : new Uint32Array(values);
    const ptr = roaring_bitmap_of_ptr(buf.length, buf);
    if (!ptr) throw new Error("RoaringBitmap32.from: failed");
    return new RoaringBitmap32(ptr);
  }

  /**
   * Create a bitmap with all values in `[min, max)` at `step` intervals.
   * Values are: min, min+step, min+2*step, ...
   */
  static fromRange(min: number, max: number, step = 1): RoaringBitmap32 {
    const ptr = roaring_bitmap_from_range(min, max, step);
    if (!ptr) throw new Error("RoaringBitmap32.fromRange: failed");
    return new RoaringBitmap32(ptr);
  }

  /** Create a copy of an existing bitmap. */
  static copy(source: RoaringBitmap32): RoaringBitmap32 {
    const ptr = roaring_bitmap_copy(source.#ptr);
    if (!ptr) throw new Error("RoaringBitmap32.copy: failed");
    return new RoaringBitmap32(ptr);
  }

  /** Union of multiple bitmaps. */
  static orMany(bitmaps: readonly RoaringBitmap32[]): RoaringBitmap32 {
    const ptrs = new BigUint64Array(bitmaps.length);
    for (let i = 0; i < bitmaps.length; i++) {
      ptrs[i] = BigInt(bitmaps[i].#ptr);
    }
    const result = roaring_bitmap_or_many(bitmaps.length, toPtr(ptrs));
    if (!result) throw new Error("RoaringBitmap32.orMany: failed");
    return new RoaringBitmap32(result);
  }

  // ---- toString / inspect ---------------------------------------------

  toString(): string {
    return `RoaringBitmap32 { cardinality: ${this.cardinality} }`;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toString();
  }
}
