/**
 * High-level 32-bit RoaringBitmap wrapper.
 *
 * Provides an idiomatic JavaScript API on top of the raw CRoaring FFI
 * bindings. Each instance wraps an allocated `roaring_bitmap_t*` pointer
 * and frees it when garbage-collected (via FinalizationRegistry) or when
 * `.free()` is called explicitly.
 */

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

  /** Add a single value. */
  add(value: number): void {
    roaring_bitmap_add(this.#ptr, value);
  }

  /** Add a single value. Returns `true` if the value was newly inserted. */
  addChecked(value: number): boolean {
    return roaring_bitmap_add_checked(this.#ptr, value);
  }

  /** Add many values at once (more efficient than repeated `add()`). */
  addMany(values: readonly number[] | Uint32Array): void {
    const buf = values instanceof Uint32Array ? values : new Uint32Array(values);
    roaring_bitmap_add_many(this.#ptr, buf.length, buf);
  }

  /** Add all values in the range `[min, max)`. */
  addRange(min: number, max: number): void {
    roaring_bitmap_add_range(this.#ptr, min, max);
  }

  /** Remove a single value. */
  remove(value: number): void {
    roaring_bitmap_remove(this.#ptr, value);
  }

  /** Remove a single value. Returns `true` if the value was present. */
  removeChecked(value: number): boolean {
    return roaring_bitmap_remove_checked(this.#ptr, value);
  }

  /** Remove many values at once. */
  removeMany(values: readonly number[] | Uint32Array): void {
    const buf = values instanceof Uint32Array ? values : new Uint32Array(values);
    roaring_bitmap_remove_many(this.#ptr, buf.length, buf);
  }

  /** Remove all values in the range `[min, max)`. */
  removeRange(min: number, max: number): void {
    roaring_bitmap_remove_range(this.#ptr, min, max);
  }

  /** Returns `true` if `value` is in the set. */
  has(value: number): boolean {
    return roaring_bitmap_contains(this.#ptr, value);
  }

  /** Returns `true` if all values in `[min, max)` are present. */
  hasRange(min: number, max: number): boolean {
    return roaring_bitmap_contains_range(this.#ptr, min, max);
  }

  /** Remove all elements. */
  clear(): void {
    roaring_bitmap_clear(this.#ptr);
  }

  // ---- cardinality / queries ------------------------------------------

  /** Number of elements in the bitmap. */
  get cardinality(): bigint {
    return roaring_bitmap_get_cardinality(this.#ptr);
  }

  /** `true` if the bitmap contains no elements. */
  get isEmpty(): boolean {
    return roaring_bitmap_is_empty(this.#ptr);
  }

  /** The smallest element, or `4294967295` (`UINT32_MAX`) if empty. */
  get minimum(): number {
    return roaring_bitmap_minimum(this.#ptr);
  }

  /** The largest element, or `0` if empty. */
  get maximum(): number {
    return roaring_bitmap_maximum(this.#ptr);
  }

  /**
   * Select the element at `rank` (0-based).
   * Returns `{ value, found }` where `found` is `false` when rank >= cardinality.
   */
  select(rank: number): { value: number; found: boolean } {
    const out = new Uint32Array(1);
    const found = roaring_bitmap_select(this.#ptr, rank, out);
    return { value: out[0], found };
  }

  /**
   * Return the number of elements ≤ `value`.
   * (0 if `value` is smaller than the smallest element)
   */
  rank(value: number): bigint {
    return roaring_bitmap_rank(this.#ptr, value);
  }

  /**
   * Return the 0-based index of `value`, or `-1` if not present.
   */
  indexOf(value: number): number {
    return Number(roaring_bitmap_get_index(this.#ptr, value));
  }

  // ---- set operations (returning new bitmap) --------------------------

  /** Intersection: elements present in both `this` and `other`. */
  and(other: RoaringBitmap32): RoaringBitmap32 {
    const ptr = roaring_bitmap_and(this.#ptr, other.#ptr);
    return new RoaringBitmap32(ptr);
  }

  /** Union: elements present in either `this` or `other`. */
  or(other: RoaringBitmap32): RoaringBitmap32 {
    const ptr = roaring_bitmap_or(this.#ptr, other.#ptr);
    return new RoaringBitmap32(ptr);
  }

  /** Symmetric difference (XOR): elements present in exactly one bitmap. */
  xor(other: RoaringBitmap32): RoaringBitmap32 {
    const ptr = roaring_bitmap_xor(this.#ptr, other.#ptr);
    return new RoaringBitmap32(ptr);
  }

  /** Difference (ANDNOT): elements in `this` but not in `other`. */
  andnot(other: RoaringBitmap32): RoaringBitmap32 {
    const ptr = roaring_bitmap_andnot(this.#ptr, other.#ptr);
    return new RoaringBitmap32(ptr);
  }

  // ---- set operation cardinalities ------------------------------------

  /** Cardinality of the intersection. */
  andCardinality(other: RoaringBitmap32): bigint {
    return roaring_bitmap_and_cardinality(this.#ptr, other.#ptr);
  }

  /** Cardinality of the union. */
  orCardinality(other: RoaringBitmap32): bigint {
    return roaring_bitmap_or_cardinality(this.#ptr, other.#ptr);
  }

  /** Cardinality of the symmetric difference. */
  xorCardinality(other: RoaringBitmap32): bigint {
    return roaring_bitmap_xor_cardinality(this.#ptr, other.#ptr);
  }

  /** Cardinality of the difference. */
  andnotCardinality(other: RoaringBitmap32): bigint {
    return roaring_bitmap_andnot_cardinality(this.#ptr, other.#ptr);
  }

  /** `true` if the two bitmaps have any element in common. */
  intersects(other: RoaringBitmap32): boolean {
    return roaring_bitmap_intersect(this.#ptr, other.#ptr);
  }

  /** `true` if the bitmap intersects `[min, max)`. */
  intersectsWithRange(min: number, max: number): boolean {
    return roaring_bitmap_intersect_with_range(this.#ptr, min, max);
  }

  /** Jaccard similarity coefficient (Tanimoto distance). */
  jaccardIndex(other: RoaringBitmap32): number {
    return roaring_bitmap_jaccard_index(this.#ptr, other.#ptr);
  }

  // ---- set operations (in-place) --------------------------------------

  /** In-place intersection. `this` is modified. */
  andInPlace(other: RoaringBitmap32): void {
    roaring_bitmap_and_inplace(this.#ptr, other.#ptr);
  }

  /** In-place union. `this` is modified. */
  orInPlace(other: RoaringBitmap32): void {
    roaring_bitmap_or_inplace(this.#ptr, other.#ptr);
  }

  /** In-place symmetric difference. `this` is modified. */
  xorInPlace(other: RoaringBitmap32): void {
    roaring_bitmap_xor_inplace(this.#ptr, other.#ptr);
  }

  /** In-place difference. `this` is modified. */
  andnotInPlace(other: RoaringBitmap32): void {
    roaring_bitmap_andnot_inplace(this.#ptr, other.#ptr);
  }

  // ---- lazy operations ------------------------------------------------

  /** Lazy union (expert). Call `repairAfterLazy()` before further use. */
  lazyOr(other: RoaringBitmap32, bitsetConversion = false): RoaringBitmap32 {
    const ptr = roaring_bitmap_lazy_or(this.#ptr, other.#ptr, bitsetConversion);
    return new RoaringBitmap32(ptr);
  }

  /** In-place lazy union. */
  lazyOrInPlace(other: RoaringBitmap32, bitsetConversion = false): void {
    roaring_bitmap_lazy_or_inplace(this.#ptr, other.#ptr, bitsetConversion);
  }

  /** Lazy xor (expert). Call `repairAfterLazy()` before further use. */
  lazyXor(other: RoaringBitmap32): RoaringBitmap32 {
    const ptr = roaring_bitmap_lazy_xor(this.#ptr, other.#ptr);
    return new RoaringBitmap32(ptr);
  }

  /** In-place lazy xor. */
  lazyXorInPlace(other: RoaringBitmap32): void {
    roaring_bitmap_lazy_xor_inplace(this.#ptr, other.#ptr);
  }

  /** Repair after lazy operations. */
  repairAfterLazy(): void {
    roaring_bitmap_repair_after_lazy(this.#ptr);
  }

  // ---- comparison -----------------------------------------------------

  /** `true` if both bitmaps contain exactly the same elements. */
  equals(other: RoaringBitmap32): boolean {
    return roaring_bitmap_equals(this.#ptr, other.#ptr);
  }

  /** `true` if all elements of `this` are also in `other`. */
  isSubset(other: RoaringBitmap32): boolean {
    return roaring_bitmap_is_subset(this.#ptr, other.#ptr);
  }

  /** `true` if `this` is a strict subset of `other`. */
  isStrictSubset(other: RoaringBitmap32): boolean {
    return roaring_bitmap_is_strict_subset(this.#ptr, other.#ptr);
  }

  // ---- flip / offset --------------------------------------------------

  /**
   * Return a new bitmap with the values in `[min, max)` negated.
   * Areas outside the range are unchanged.
   */
  flip(min: number, max: number): RoaringBitmap32 {
    const ptr = roaring_bitmap_flip(this.#ptr, min, max);
    return new RoaringBitmap32(ptr);
  }

  /** In-place flip. */
  flipInPlace(min: number, max: number): void {
    roaring_bitmap_flip_inplace(this.#ptr, min, max);
  }

  /**
   * Return a new bitmap with all values shifted by `offset`.
   * Positive offset shifts values up, negative shifts down.
   */
  addOffset(offset: number): RoaringBitmap32 {
    const ptr = roaring_bitmap_add_offset(this.#ptr, offset);
    return new RoaringBitmap32(ptr);
  }

  // ---- conversion -----------------------------------------------------

  /** Convert the bitmap to an array of uint32 values. */
  toArray(): Uint32Array {
    const n = Number(roaring_bitmap_get_cardinality(this.#ptr));
    const out = new Uint32Array(n);
    if (n > 0) {
      roaring_bitmap_to_uint32_array(this.#ptr, out);
    }
    return out;
  }

  /**
   * Convert a range of values to an array.
   * Reads up to `limit` values starting from `offset`.
   */
  toRangeArray(offset: number, limit: number): { values: Uint32Array; count: number } {
    const out = new Uint32Array(limit);
    const ok = roaring_bitmap_range_uint32_array(this.#ptr, offset, limit, out);
    return { values: out, count: ok ? limit : 0 };
  }

  // ---- serialization (portable, cross-language) -----------------------

  /** Number of bytes needed for portable serialization. */
  get portableSizeInBytes(): number {
    return Number(roaring_bitmap_portable_size_in_bytes(this.#ptr));
  }

  /** Serialize to a portable (cross-language) buffer. */
  portableSerialize(): Uint8Array {
    const n = Number(roaring_bitmap_portable_size_in_bytes(this.#ptr));
    const buf = new Uint8Array(n);
    roaring_bitmap_portable_serialize(this.#ptr, buf);
    return buf;
  }

  /** Deserialize from a portable buffer. */
  static portableDeserialize(buf: ArrayBuffer | Uint8Array): RoaringBitmap32 {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const ptr = roaring_bitmap_portable_deserialize(
      b as unknown as string,
    );
    if (!ptr) throw new Error("RoaringBitmap32.portableDeserialize: failed");
    return new RoaringBitmap32(ptr);
  }

  /** Safe deserialize (bounds-checked). Returns `null` on failure. */
  static portableDeserializeSafe(buf: ArrayBuffer | Uint8Array, maxBytes: number): RoaringBitmap32 | null {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const ptr = roaring_bitmap_portable_deserialize_safe(
      b as unknown as string,
      maxBytes,
    );
    return ptr ? new RoaringBitmap32(ptr) : null;
  }

  // ---- serialization (native) -----------------------------------------

  /** Number of bytes needed for native serialization. */
  get sizeInBytes(): number {
    return Number(roaring_bitmap_size_in_bytes(this.#ptr));
  }

  /** Serialize to a native (C-specific) buffer. */
  serialize(): Uint8Array {
    const n = Number(roaring_bitmap_size_in_bytes(this.#ptr));
    const buf = new Uint8Array(n);
    roaring_bitmap_serialize(this.#ptr, buf);
    return buf;
  }

  /** Deserialize from a native buffer. */
  static deserialize(buf: ArrayBuffer | Uint8Array): RoaringBitmap32 {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const ptr = roaring_bitmap_deserialize(b);
    if (!ptr) throw new Error("RoaringBitmap32.deserialize: failed");
    return new RoaringBitmap32(ptr);
  }

  /** Safe deserialize (bounds-checked). Returns `null` on failure. */
  static deserializeSafe(buf: ArrayBuffer | Uint8Array, maxBytes: number): RoaringBitmap32 | null {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const ptr = roaring_bitmap_deserialize_safe(b, maxBytes);
    return ptr ? new RoaringBitmap32(ptr) : null;
  }

  // ---- optimization ---------------------------------------------------

  /** Convert array/bitmap containers to run containers where beneficial. */
  runOptimize(): boolean {
    return roaring_bitmap_run_optimize(this.#ptr);
  }

  /** Remove run-length encoding. Returns `true` if changed. */
  removeRunCompression(): boolean {
    return roaring_bitmap_remove_run_compression(this.#ptr);
  }

  /** Reallocate to shrink memory usage. Returns bytes saved. */
  shrinkToFit(): number {
    return Number(roaring_bitmap_shrink_to_fit(this.#ptr));
  }

  // ---- copy-on-write --------------------------------------------------

  get copyOnWrite(): boolean {
    return roaring_bitmap_get_copy_on_write(this.#ptr);
  }

  set copyOnWrite(cow: boolean) {
    roaring_bitmap_set_copy_on_write(this.#ptr, cow);
  }

  /** `true` if the bitmap has shared containers (for COW). */
  get containsShared(): boolean {
    return roaring_contains_shared(this.#ptr);
  }

  /** Unshare all shared containers. Returns `true` if any were unshared. */
  unshareAll(): boolean {
    return roaring_unshare_all(this.#ptr);
  }

  // ---- statistics / validation ----------------------------------------

  /** Collect detailed statistics about the bitmap composition. */
  statistics(): RoaringStatistics {
    const buf = new ArrayBuffer(STATS_SIZE);
    roaring_bitmap_statistics(this.#ptr, toPtr(new Uint8Array(buf)));
    return readStats(buf);
  }

  /**
   * Internal consistency check.
   * Returns `{ valid, reason }` where `reason` is `null` when valid.
   */
  validate(): { valid: boolean; reason: string | null } {
    // FIXME: const char **reason is not directly accessible via FFI
    // For now we pass null and just get the bool
    const valid = roaring_bitmap_internal_validate(this.#ptr, 0);
    return { valid, reason: null };
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
   * Returns `true` if the bitmap is a superset of `other`.
   * (Equivalent to `other.isSubset(this)`.)
   */
  isSuperset(other: RoaringBitmap32): boolean {
    return other.isSubset(this);
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
