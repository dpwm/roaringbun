/**
 * High-level 64-bit RoaringBitmap wrapper.
 *
 * Each instance wraps an allocated `roaring64_bitmap_t*` pointer
 * and frees it via FinalizationRegistry or explicit `.free()`.
 */

import { CString } from "bun:ffi";

import {
  roaring64_bitmap_create,
  roaring64_bitmap_free,
  roaring64_bitmap_copy,
  roaring64_bitmap_add,
  roaring64_bitmap_add_checked,
  roaring64_bitmap_add_many,
  roaring64_bitmap_add_range,
  roaring64_bitmap_remove,
  roaring64_bitmap_remove_checked,
  roaring64_bitmap_remove_many,
  roaring64_bitmap_remove_range,
  roaring64_bitmap_contains,
  roaring64_bitmap_contains_range,
  roaring64_bitmap_clear,
  roaring64_bitmap_get_cardinality,
  roaring64_bitmap_is_empty,
  roaring64_bitmap_minimum,
  roaring64_bitmap_maximum,
  roaring64_bitmap_select,
  roaring64_bitmap_rank,
  roaring64_bitmap_get_index,
  roaring64_bitmap_and,
  roaring64_bitmap_or,
  roaring64_bitmap_xor,
  roaring64_bitmap_andnot,
  roaring64_bitmap_and_cardinality,
  roaring64_bitmap_or_cardinality,
  roaring64_bitmap_xor_cardinality,
  roaring64_bitmap_andnot_cardinality,
  roaring64_bitmap_intersect,
  roaring64_bitmap_intersect_with_range,
  roaring64_bitmap_jaccard_index,
  roaring64_bitmap_equals,
  roaring64_bitmap_is_subset,
  roaring64_bitmap_is_strict_subset,
  roaring64_bitmap_and_inplace,
  roaring64_bitmap_or_inplace,
  roaring64_bitmap_xor_inplace,
  roaring64_bitmap_andnot_inplace,
  roaring64_bitmap_flip,
  roaring64_bitmap_flip_inplace,
  roaring64_bitmap_add_offset_signed,
  roaring64_bitmap_to_uint64_array,
  roaring64_bitmap_run_optimize,
  roaring64_bitmap_remove_run_compression,
  roaring64_bitmap_frozen_size_in_bytes,
  roaring64_bitmap_frozen_serialize,
  roaring64_bitmap_frozen_view,
  roaring64_bitmap_shrink_to_fit,
  roaring64_bitmap_of_ptr,
  roaring64_bitmap_from_range,
  roaring64_bitmap_portable_serialize,
  roaring64_bitmap_portable_size_in_bytes,
  roaring64_bitmap_portable_deserialize_safe,
  roaring64_bitmap_statistics,
  roaring64_bitmap_internal_validate,
  roaring64_bitmap_move_from_roaring32,
  ptr as toPtr,
  roaring64_iterator_create,
  roaring64_iterator_free,
  roaring64_iterator_has_value,
  roaring64_iterator_value,
  roaring64_iterator_advance,
} from "./ffi.ts";
import { RoaringBitmap32 } from "./roaring32.ts";

// ---- helpers -----------------------------------------------------------

/** Aligned size of `roaring64_statistics_t` (13 × uint64 = 104 bytes). */
const STATS64_SIZE = 104;

/** Interpret a buffer as a 64-bit statistics struct. */
function readStats64(buf: ArrayBuffer): Roaring64Statistics {
  const dv = new DataView(buf);
  return {
    nContainers: dv.getBigUint64(0, true),
    nArrayContainers: dv.getBigUint64(8, true),
    nRunContainers: dv.getBigUint64(16, true),
    nBitsetContainers: dv.getBigUint64(24, true),
    nValuesArrayContainers: dv.getBigUint64(32, true),
    nValuesRunContainers: dv.getBigUint64(40, true),
    nValuesBitsetContainers: dv.getBigUint64(48, true),
    nBytesArrayContainers: dv.getBigUint64(56, true),
    nBytesRunContainers: dv.getBigUint64(64, true),
    nBytesBitsetContainers: dv.getBigUint64(72, true),
    maxValue: dv.getBigUint64(80, true),
    minValue: dv.getBigUint64(88, true),
    cardinality: dv.getBigUint64(96, true),
  };
}

// ---- types -------------------------------------------------------------

export interface Roaring64Statistics {
  nContainers: bigint;
  nArrayContainers: bigint;
  nRunContainers: bigint;
  nBitsetContainers: bigint;
  nValuesArrayContainers: bigint;
  nValuesRunContainers: bigint;
  nValuesBitsetContainers: bigint;
  nBytesArrayContainers: bigint;
  nBytesRunContainers: bigint;
  nBytesBitsetContainers: bigint;
  maxValue: bigint;
  minValue: bigint;
  cardinality: bigint;
}

// ---- 64-bit iterator ---------------------------------------------------

export class RoaringBitmap64Iterator implements Iterator<bigint> {
  /** Pointer to the C `roaring64_iterator_t`. 0 once exhausted. */
  #it: number;
  #started = false;

  constructor(bitmap: RoaringBitmap64) {
    this.#it = roaring64_iterator_create(bitmap.ptr);
  }

  next(): IteratorResult<bigint> {
    if (this.#it === 0) return { value: undefined as any, done: true };

    if (!this.#started) {
      this.#started = true;
      if (roaring64_iterator_has_value(this.#it)) {
        return { value: roaring64_iterator_value(this.#it), done: false };
      }
    } else {
      if (roaring64_iterator_advance(this.#it)) {
        return { value: roaring64_iterator_value(this.#it), done: false };
      }
    }

    roaring64_iterator_free(this.#it);
    this.#it = 0;
    return { value: undefined as any, done: true };
  }

  [Symbol.iterator](): RoaringBitmap64Iterator {
    return this;
  }
}

// ---- FinalizationRegistry ----------------------------------------------

const finalizers = new FinalizationRegistry((ptr: number) => {
  roaring64_bitmap_free(ptr);
});

// ---- main class --------------------------------------------------------

export class RoaringBitmap64 {
  /** Opaque pointer to the C `roaring64_bitmap_t` */
  readonly #ptr: number;

  /** Reference to the backing buffer for frozen-view bitmaps. */
  #backingBuffer: ArrayBuffer | Uint8Array | null = null;

  /**
   * Create a new empty 64-bit bitmap, or wrap an existing pointer.
   *
   * When `ptr` is a `number`, it is assumed to be a valid
   * `roaring64_bitmap_t*` pointer (advanced use). Otherwise a new
   * bitmap is allocated.
   */
  constructor(ptr?: number) {
    if (typeof ptr === "number") {
      this.#ptr = ptr;
    } else {
      this.#ptr = roaring64_bitmap_create();
      if (this.#ptr === 0 || this.#ptr === null) {
        throw new Error("RoaringBitmap64: failed to allocate bitmap");
      }
    }
    finalizers.register(this, this.#ptr, this);
  }

  /** The raw pointer (for advanced interop). */
  get ptr(): number {
    return this.#ptr;
  }

  /**
   * Release the underlying C bitmap.
   *
   * Wraps `roaring64_bitmap_free`. The bitmap becomes unusable after
   * this call. Safe to call multiple times (subsequent calls are no-ops
   * at the JS level, but the C pointer becomes dangling).
   */
  free(): void {
    finalizers.unregister(this);
    roaring64_bitmap_free(this.#ptr);
  }

  // ---- add / remove / contains ----------------------------------------

  /**
   * Add a single 64-bit value to the set.
   *
   * Wraps `roaring64_bitmap_add`. Accepts both `bigint` and `number`.
   * Returns `this` for chaining.
   */
  add(value: bigint | number): this {
    roaring64_bitmap_add(this.#ptr, BigInt(value));
    return this;
  }

  /**
   * Add a single value, returning `true` only if it wasn't already present.
   *
   * Wraps `roaring64_bitmap_add_checked`.
   */
  addChecked(value: bigint | number): boolean {
    return roaring64_bitmap_add_checked(this.#ptr, BigInt(value));
  }

  /**
   * Add many values at once.
   *
   * Wraps `roaring64_bitmap_add_many`. Accepts both arrays and
   * `BigUint64Array`.
   */
  addMany(values: readonly (bigint | number)[] | BigUint64Array): void {
    const buf = values instanceof BigUint64Array
      ? values
      : new BigUint64Array(values.map(BigInt));
    roaring64_bitmap_add_many(this.#ptr, buf.length, buf);
  }

  /**
   * Add all values in the range `[min, max)` (half-open interval).
   *
   * Wraps `roaring64_bitmap_add_range`.
   */
  addRange(min: bigint | number, max: bigint | number): void {
    roaring64_bitmap_add_range(this.#ptr, BigInt(min), BigInt(max));
  }

  /**
   * Remove a single value (Set-compatible name).
   *
   * Wraps `roaring64_bitmap_contains` / `roaring64_bitmap_remove`.
   * Returns `true` if the value was present and removed.
   *
   * Also available as `remove()`.
   */
  delete(value: bigint | number): boolean {
    const prev = roaring64_bitmap_contains(this.#ptr, BigInt(value));
    if (prev) roaring64_bitmap_remove(this.#ptr, BigInt(value));
    return prev;
  }

  /** Remove a single value (alias for `delete`). */
  remove(value: bigint | number): boolean {
    return this.delete(value);
  }

  /**
   * Remove a single value, returning `true` only if it was present.
   *
   * Wraps `roaring64_bitmap_remove_checked`.
   */
  removeChecked(value: bigint | number): boolean {
    return roaring64_bitmap_remove_checked(this.#ptr, BigInt(value));
  }

  /**
   * Remove many values at once.
   *
   * Wraps `roaring64_bitmap_remove_many`.
   */
  removeMany(values: readonly (bigint | number)[] | BigUint64Array): void {
    const buf = values instanceof BigUint64Array
      ? values
      : new BigUint64Array(values.map(BigInt));
    roaring64_bitmap_remove_many(this.#ptr, buf.length, buf);
  }

  /**
   * Remove all values in the range `[min, max)` (half-open interval).
   *
   * Wraps `roaring64_bitmap_remove_range`.
   */
  removeRange(min: bigint | number, max: bigint | number): void {
    roaring64_bitmap_remove_range(this.#ptr, BigInt(min), BigInt(max));
  }

  /**
   * Returns `true` if `value` is in the set.
   *
   * Wraps `roaring64_bitmap_contains`.
   */
  has(value: bigint | number): boolean {
    return roaring64_bitmap_contains(this.#ptr, BigInt(value));
  }

  /**
   * Returns `true` if all values in the half-open range `[min, max)` are present.
   *
   * Wraps `roaring64_bitmap_contains_range`.
   */
  hasRange(min: bigint | number, max: bigint | number): boolean {
    return roaring64_bitmap_contains_range(this.#ptr, BigInt(min), BigInt(max));
  }

  /**
   * Remove all elements from the bitmap.
   *
   * Wraps `roaring64_bitmap_clear`. The bitmap remains valid and
   * can be reused.
   */
  clear(): void {
    roaring64_bitmap_clear(this.#ptr);
  }

  // ---- cardinality / queries ------------------------------------------

  /**
   * Number of elements in the bitmap.
   *
   * Wraps `roaring64_bitmap_get_cardinality`. Returns a `bigint`
   * because bitmaps can hold more than 2^53 values. Use `size`
   * for a `number`.
   */
  get cardinality(): bigint {
    return roaring64_bitmap_get_cardinality(this.#ptr);
  }

  /** `true` if the bitmap contains no elements. */
  get isEmpty(): boolean {
    return roaring64_bitmap_is_empty(this.#ptr);
  }

  /**
   * The smallest element in the set.
   *
   * Returns `UINT64_MAX` if the bitmap is empty.
   */
  get minimum(): bigint {
    return roaring64_bitmap_minimum(this.#ptr);
  }

  /**
   * The largest element in the set.
   *
   * Returns `0n` if the bitmap is empty.
   */
  get maximum(): bigint {
    return roaring64_bitmap_maximum(this.#ptr);
  }

  /**
   * Return the element at the given 0-based rank (select operation).
   *
   * Wraps `roaring64_bitmap_select`. Returns `{ value, found }`
   * where `found` is `false` when `rank >= cardinality`.
   */
  select(rank: bigint | number): { value: bigint; found: boolean } {
    const out = new BigUint64Array(1);
    const found = roaring64_bitmap_select(this.#ptr, BigInt(rank), out);
    return { value: out[0], found };
  }

  /**
   * Return the number of elements less than or equal to `value`.
   *
   * Wraps `roaring64_bitmap_rank`. Returns 0 if `value` is smaller
   * than the smallest element.
   */
  rank(value: bigint | number): bigint {
    return roaring64_bitmap_rank(this.#ptr, BigInt(value));
  }

  /**
   * Return the 0-based index of `value`, or `null` if not present.
   *
   * Wraps `roaring64_bitmap_get_index`. Unlike `rank`, returns `null`
   * when the value is not in the set rather than a count.
   */
  indexOf(value: bigint | number): bigint | null {
    const out = new BigUint64Array(1);
    const found = roaring64_bitmap_get_index(this.#ptr, BigInt(value), out);
    return found ? out[0] : null;
  }

  // ---- set operations (returning new bitmap) --------------------------

  /**
   * Returns a new bitmap with elements present in both `this` and `other`.
   *
   * Wraps `roaring64_bitmap_and`.
   * (Set-compatible name; also available as `and`.)
   */
  intersection(other: RoaringBitmap64): RoaringBitmap64 {
    return new RoaringBitmap64(roaring64_bitmap_and(this.#ptr, other.#ptr));
  }

  /** @alias intersection */
  and(other: RoaringBitmap64): RoaringBitmap64 {
    return this.intersection(other);
  }

  /**
   * Returns a new bitmap with elements present in either `this` or `other`.
   *
   * Wraps `roaring64_bitmap_or`.
   * (Set-compatible name; also available as `or`.)
   */
  union(other: RoaringBitmap64): RoaringBitmap64 {
    return new RoaringBitmap64(roaring64_bitmap_or(this.#ptr, other.#ptr));
  }

  /** @alias union */
  or(other: RoaringBitmap64): RoaringBitmap64 {
    return this.union(other);
  }

  /**
   * Returns a new bitmap with elements present in exactly one of `this` or `other`.
   *
   * Wraps `roaring64_bitmap_xor`.
   * (Set-compatible name; also available as `xor`.)
   */
  symmetricDifference(other: RoaringBitmap64): RoaringBitmap64 {
    return new RoaringBitmap64(roaring64_bitmap_xor(this.#ptr, other.#ptr));
  }

  /** @alias symmetricDifference */
  xor(other: RoaringBitmap64): RoaringBitmap64 {
    return this.symmetricDifference(other);
  }

  /**
   * Returns a new bitmap with elements in `this` but not in `other`.
   *
   * Wraps `roaring64_bitmap_andnot`.
   * (Set-compatible name; also available as `andnot`.)
   */
  difference(other: RoaringBitmap64): RoaringBitmap64 {
    return new RoaringBitmap64(roaring64_bitmap_andnot(this.#ptr, other.#ptr));
  }

  /** @alias difference */
  andnot(other: RoaringBitmap64): RoaringBitmap64 {
    return this.difference(other);
  }

  // ---- set operation cardinalities ------------------------------------

  /**
   * Cardinality of `this.intersection(other)` without allocating a new bitmap.
   * Wraps `roaring64_bitmap_and_cardinality`.
   */
  andCardinality(other: RoaringBitmap64): bigint {
    return roaring64_bitmap_and_cardinality(this.#ptr, other.#ptr);
  }

  /**
   * Cardinality of `this.union(other)` without allocating a new bitmap.
   * Wraps `roaring64_bitmap_or_cardinality`.
   */
  orCardinality(other: RoaringBitmap64): bigint {
    return roaring64_bitmap_or_cardinality(this.#ptr, other.#ptr);
  }

  /**
   * Cardinality of `this.symmetricDifference(other)` without allocating a new bitmap.
   * Wraps `roaring64_bitmap_xor_cardinality`.
   */
  xorCardinality(other: RoaringBitmap64): bigint {
    return roaring64_bitmap_xor_cardinality(this.#ptr, other.#ptr);
  }

  /**
   * Cardinality of `this.difference(other)` without allocating a new bitmap.
   * Wraps `roaring64_bitmap_andnot_cardinality`.
   */
  andnotCardinality(other: RoaringBitmap64): bigint {
    return roaring64_bitmap_andnot_cardinality(this.#ptr, other.#ptr);
  }

  /**
   * Returns `true` if the two bitmaps share any element.
   *
   * Wraps `roaring64_bitmap_intersect`.
   */
  intersects(other: RoaringBitmap64): boolean {
    return roaring64_bitmap_intersect(this.#ptr, other.#ptr);
  }

  /**
   * Returns `true` if the two bitmaps have no element in common.
   *
   * Equivalent to `!intersects(other)`.
   * (Set-compatible name.)
   */
  isDisjointFrom(other: RoaringBitmap64): boolean {
    return !roaring64_bitmap_intersect(this.#ptr, other.#ptr);
  }

  /**
   * Returns `true` if the bitmap intersects the half-open range `[min, max)`.
   * Wraps `roaring64_bitmap_intersect_with_range`.
   */
  intersectsWithRange(min: bigint | number, max: bigint | number): boolean {
    return roaring64_bitmap_intersect_with_range(this.#ptr, BigInt(min), BigInt(max));
  }

  /**
   * Jaccard similarity coefficient (Tanimoto distance) between two bitmaps.
   *
   * Wraps `roaring64_bitmap_jaccard_index`.
   */
  jaccardIndex(other: RoaringBitmap64): number {
    return roaring64_bitmap_jaccard_index(this.#ptr, other.#ptr);
  }

  // ---- set operations (in-place) --------------------------------------

  /** In-place intersection. Modifies `this`. Wraps `roaring64_bitmap_and_inplace`. */
  andInPlace(other: RoaringBitmap64): void {
    roaring64_bitmap_and_inplace(this.#ptr, other.#ptr);
  }

  /** In-place union. Modifies `this`. Wraps `roaring64_bitmap_or_inplace`. */
  orInPlace(other: RoaringBitmap64): void {
    roaring64_bitmap_or_inplace(this.#ptr, other.#ptr);
  }

  /** In-place symmetric difference. Modifies `this`. Wraps `roaring64_bitmap_xor_inplace`. */
  xorInPlace(other: RoaringBitmap64): void {
    roaring64_bitmap_xor_inplace(this.#ptr, other.#ptr);
  }

  /** In-place difference. Modifies `this`. Wraps `roaring64_bitmap_andnot_inplace`. */
  andnotInPlace(other: RoaringBitmap64): void {
    roaring64_bitmap_andnot_inplace(this.#ptr, other.#ptr);
  }

  // ---- flip / offset --------------------------------------------------

  /**
   * Return a new bitmap with the values in `[min, max)` negated.
   *
   * Wraps `roaring64_bitmap_flip`. Areas outside the range are unchanged.
   */
  flip(min: bigint | number, max: bigint | number): RoaringBitmap64 {
    return new RoaringBitmap64(
      roaring64_bitmap_flip(this.#ptr, BigInt(min), BigInt(max)),
    );
  }

  /** In-place flip. Modifies `this`. Wraps `roaring64_bitmap_flip_inplace`. */
  flipInPlace(min: bigint | number, max: bigint | number): void {
    roaring64_bitmap_flip_inplace(this.#ptr, BigInt(min), BigInt(max));
  }

  /**
   * Return a new bitmap with all values shifted by `offset`.
   *
   * Wraps `roaring64_bitmap_add_offset_signed`. When `positive` is
   * `true`, values are shifted up; otherwise down. Values that
   * overflow/underflow `uint64_t` are dropped.
   */
  addOffset(offset: bigint | number, positive = true): RoaringBitmap64 {
    return new RoaringBitmap64(
      roaring64_bitmap_add_offset_signed(this.#ptr, positive, BigInt(offset)),
    );
  }

  // ---- comparison -----------------------------------------------------

  /**
   * Returns `true` if both bitmaps contain exactly the same elements.
   *
   * Wraps `roaring64_bitmap_equals`.
   */
  equals(other: RoaringBitmap64): boolean {
    return roaring64_bitmap_equals(this.#ptr, other.#ptr);
  }

  /**
   * `true` if all elements of `this` are also in `other`.
   *
   * Wraps `roaring64_bitmap_is_subset`.
   * (Set-compatible name; also available as `isSubset`.)
   */
  isSubsetOf(other: RoaringBitmap64): boolean {
    return roaring64_bitmap_is_subset(this.#ptr, other.#ptr);
  }

  /** @alias isSubsetOf */
  isSubset(other: RoaringBitmap64): boolean {
    return this.isSubsetOf(other);
  }

  /**
   * `true` if `this` is a proper (strict) subset of `other`.
   *
   * Wraps `roaring64_bitmap_is_strict_subset`. Unlike `isSubsetOf`,
   * returns `false` if the two bitmaps are equal.
   */
  isProperSubsetOf(other: RoaringBitmap64): boolean {
    return roaring64_bitmap_is_strict_subset(this.#ptr, other.#ptr);
  }

  /** @alias isProperSubsetOf */
  isStrictSubset(other: RoaringBitmap64): boolean {
    return this.isProperSubsetOf(other);
  }

  // ---- conversion -----------------------------------------------------

  /**
   * Convert the bitmap to a sorted array of uint64 values.
   *
   * Wraps `roaring64_bitmap_to_uint64_array`. The result is always
   * sorted in ascending order.
   */
  toArray(): BigUint64Array {
    const n = Number(roaring64_bitmap_get_cardinality(this.#ptr));
    const out = new BigUint64Array(n);
    if (n > 0) {
      roaring64_bitmap_to_uint64_array(this.#ptr, out);
    }
    return out;
  }

  // ---- serialization (portable, cross-language) -----------------------

  /**
   * Number of bytes required for portable serialization.
   *
   * Wraps `roaring64_bitmap_portable_size_in_bytes`.
   */
  get portableSizeInBytes(): number {
    return Number(roaring64_bitmap_portable_size_in_bytes(this.#ptr));
  }

  /**
   * Serialize to a portable (cross-language) buffer.
   *
   * Wraps `roaring64_bitmap_portable_serialize`.
   */
  portableSerialize(): Uint8Array {
    const n = Number(roaring64_bitmap_portable_size_in_bytes(this.#ptr));
    const buf = new Uint8Array(n);
    roaring64_bitmap_portable_serialize(this.#ptr, buf);
    return buf;
  }

  /**
   * Safe deserialize from a portable buffer (bounds-checked).
   *
   * Wraps `roaring64_bitmap_portable_deserialize_safe`.
   * Returns `null` on failure. Call `validate()` on the result
   * if the source is untrusted.
   */
  static portableDeserializeSafe(buf: ArrayBuffer | Uint8Array): RoaringBitmap64 | null {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const ptr = roaring64_bitmap_portable_deserialize_safe(
      b as unknown as string,
      b.length,
    );
    return ptr ? new RoaringBitmap64(ptr) : null;
  }

  // ---- frozen serialization (zero-copy view) -------------------------

  get frozenSizeInBytes(): number {
    return Number(roaring64_bitmap_frozen_size_in_bytes(this.#ptr));
  }

  frozenSerialize(): Uint8Array {
    const n = Number(roaring64_bitmap_frozen_size_in_bytes(this.#ptr));
    const buf = new Uint8Array(n);
    roaring64_bitmap_frozen_serialize(this.#ptr, buf);
    return buf;
  }

  static frozenView(buffer: Uint8Array, options?: { offset?: number; length?: number }): RoaringBitmap64 {
    const offset = options?.offset ?? 0;
    const length = options?.length ?? buffer.length - offset;
    const slice = offset === 0 && length === buffer.length
      ? buffer
      : buffer.subarray(offset, offset + length);
    const ptr = roaring64_bitmap_frozen_view(slice, length);
    if (!ptr) return new RoaringBitmap64();
    const bm = new RoaringBitmap64(ptr);
    bm.#backingBuffer = slice.buffer || slice;
    return bm;
  }

  // ---- optimization ---------------------------------------------------

  /**
   * Convert array and bitmap containers to run containers where
   * more space-efficient.
   *
   * Wraps `roaring64_bitmap_run_optimize`.
   */
  runOptimize(): boolean {
    return roaring64_bitmap_run_optimize(this.#ptr);
  }

  /**
   * Remove run-length encoding.
   *
   * Wraps `roaring64_bitmap_remove_run_compression`.
   */
  removeRunCompression(): boolean {
    return roaring64_bitmap_remove_run_compression(this.#ptr);
  }

  /**
   * Reallocate internal buffers to shrink memory usage.
   *
   * Wraps `roaring64_bitmap_shrink_to_fit`. Returns bytes saved.
   */
  shrinkToFit(): number {
    return Number(roaring64_bitmap_shrink_to_fit(this.#ptr));
  }

  // ---- statistics / validation ----------------------------------------

  /**
   * Collect detailed statistics about the internal composition of
   * the bitmap.
   *
   * Wraps `roaring64_bitmap_statistics`.
   */
  statistics(): Roaring64Statistics {
    const buf = new ArrayBuffer(STATS64_SIZE);
    roaring64_bitmap_statistics(this.#ptr, toPtr(new Uint8Array(buf)));
    return readStats64(buf);
  }

  /**
   * Internal consistency check.
   *
   * Walks the bitmap's internal structure and verifies invariants.
   * Returns `{ valid, reason }` where `reason` is `null` when valid.
   * Useful after deserializing untrusted data.
   *
   * Wraps `roaring64_bitmap_internal_validate`.
   */
  validate(): { valid: boolean; reason: string | null } {
    const reasonBuf = new BigUint64Array(1);
    const valid = roaring64_bitmap_internal_validate(this.#ptr, reasonBuf);
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
    return Number(roaring64_bitmap_get_cardinality(this.#ptr));
  }

  /** Iterate over all values in ascending order. */
  *[Symbol.iterator](): IterableIterator<bigint> {
    const it = new RoaringBitmap64Iterator(this);
    let result = it.next();
    while (!result.done) {
      yield result.value;
      result = it.next();
    }
  }

  /** Same as `[Symbol.iterator]()`. */
  values(): IterableIterator<bigint> {
    return this[Symbol.iterator]();
  }

  /** Alias for `values()` (Set compatibility). */
  keys(): IterableIterator<bigint> {
    return this.values();
  }

  /** Yields `[value, value]` tuples (Set compatibility). */
  *entries(): IterableIterator<[bigint, bigint]> {
    for (const v of this) {
      yield [v, v];
    }
  }

  /** Calls `callbackfn` for each value in the bitmap. */
  forEach(callbackfn: (value: bigint, key: bigint, set: RoaringBitmap64) => void, thisArg?: any): void {
    for (const v of this) {
      callbackfn.call(thisArg, v, v, this);
    }
  }

  /**
   * `true` if all elements of `other` are also in `this`.
   * (Set-compatible name.)
   */
  isSupersetOf(other: RoaringBitmap64): boolean {
    return other.isSubsetOf(this);
  }

  // ---- static constructors --------------------------------------------

  /**
   * Create a bitmap containing the given values.
   *
   * Wraps `roaring64_bitmap_of_ptr`. Accepts both arrays of
   * `bigint`/`number` and `BigUint64Array`.
   */
  static from(values: readonly (bigint | number)[] | BigUint64Array): RoaringBitmap64 {
    const buf = values instanceof BigUint64Array
      ? values
      : new BigUint64Array(values.map(BigInt));
    const ptr = roaring64_bitmap_of_ptr(buf.length, buf);
    if (!ptr) throw new Error("RoaringBitmap64.from: failed");
    return new RoaringBitmap64(ptr);
  }

  /**
   * Create a bitmap with values in `[min, max)` at `step` intervals.
   *
   * Wraps `roaring64_bitmap_from_range`. Values are:
   * `min, min+step, min+2*step, ...`
   */
  static fromRange(min: bigint | number, max: bigint | number, step: bigint | number = 1n): RoaringBitmap64 {
    const ptr = roaring64_bitmap_from_range(BigInt(min), BigInt(max), BigInt(step));
    if (!ptr) throw new Error("RoaringBitmap64.fromRange: failed");
    return new RoaringBitmap64(ptr);
  }

  /**
   * Create a copy of an existing bitmap.
   *
   * Wraps `roaring64_bitmap_copy`.
   */
  static copy(source: RoaringBitmap64): RoaringBitmap64 {
    const ptr = roaring64_bitmap_copy(source.#ptr);
    if (!ptr) throw new Error("RoaringBitmap64.copy: failed");
    return new RoaringBitmap64(ptr);
  }

  /**
   * Create a 64-bit bitmap by moving containers from a 32-bit bitmap.
   *
   * Wraps `roaring64_bitmap_move_from_roaring32`. The source bitmap
   * will be empty after this call.
   */
  static moveFromRoaring32(source: RoaringBitmap32): RoaringBitmap64 {
    const ptr = roaring64_bitmap_move_from_roaring32(source.ptr);
    if (!ptr) throw new Error("RoaringBitmap64.moveFromRoaring32: failed");
    return new RoaringBitmap64(ptr);
  }

  // ---- toString / inspect ---------------------------------------------

  /**
   * Returns a human-readable string like `RoaringBitmap64(5) { 1, 2, 3, 4, 5 }`.
   * For large bitmaps, shows the first and last few elements with `...`.
   */
  toString(): string {
    const n = this.size;
    const preview = formatPreview64(this);
    return `RoaringBitmap64(${n}) { ${preview} }`;
  }

  /** Release resources when used with `using` statements. */
  [Symbol.dispose](): void {
    this.free();
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toString();
  }
}

/** Format the first/last few elements for display (64-bit). */
function formatPreview64(bm: RoaringBitmap64): string {
  const n = bm.size;
  if (n === 0) return "";

  const SHOW = 5;

  if (n <= SHOW * 2) {
    const all: string[] = [];
    for (const v of bm) all.push(v.toString());
    return all.join(", ");
  }

  const head: string[] = [];
  let i = 0;
  for (const v of bm) {
    if (i >= SHOW) break;
    head.push(v.toString());
    i++;
  }

  const tail: string[] = [];
  for (let k = n - SHOW; k < n; k++) {
    const { value } = bm.select(BigInt(k));
    tail.push(value.toString());
  }

  return [...head, "...", ...tail].join(", ");
}
