# roaringbun

Roaringbun is a zero-dependency roaring bitmap library for bun. It is a two-layered wrapper around croaring. Croaring is vendored and provided by this package.

> **Status:** Early development. The API is usable but may change.

## Features

* Zero-dependency bindings to native code using Bun’s FFI. 
* 32-bit and 64-bit roaring bitmaps supported
* Set-compatible convenience layer
* Full-featured API
* Tests ported from CRoaring

## Installation

```bash
bun add roaringbun
```

Binaries are already included for linux-x86_64-glibc. No postinstall hooks.

## Quickstart

```ts
import { RoaringBitmap32 } from "roaringbun";

// Create a bitmap and add values
using bm = new RoaringBitmap32();
bm.add(1).add(2).add(3);

// Query
console.log(bm.has(2));    // true
console.log(bm.cardinality); // 3n
console.log(bm.size);       // 3

// Iterate
for (const v of bm) {
  console.log(v);
}

// Set operations
using other = RoaringBitmap32.from([3, 4, 5]);
using union = bm.union(other);
console.log([...union]); // [1, 2, 3, 4, 5]
```

## SQLite interop

Stored blobs from [roaringlite](https://github.com/dpwm/roaringlite) are
compatible with `deserializeSafe()`:

```ts
const row = db.query("SELECT bitmap FROM data WHERE id = ?").get(42);
using bm = RoaringBitmap32.deserializeSafe(row.bitmap);
console.log(bm.cardinality, [...bm]);
```

Bitmaps serialized with `serialize()` can be loaded by
roaringlite.

## Frozen Views

For zero-copy loading from a `Uint8Array` (no parsing, no allocation),
use `frozenView()` — requires data stored in frozen format:

```ts
using bm = RoaringBitmap32.frozenView(uint8array);
console.log(bm.has(42));
```

## API

Both `RoaringBitmap32` and `RoaringBitmap64` share the same API surface.
The 64-bit variant accepts and returns `bigint` values. Full JSDoc is in
[the source](./src).

### Common operations

```ts
// Create
const bm = new RoaringBitmap32();
const fromValues = RoaringBitmap32.from([1, 2, 3]);
const fromRange = RoaringBitmap32.fromRange(0, 1000); // [0, 1000)
const copy = RoaringBitmap32.copy(fromValues);

// Add / remove
bm.add(42);
bm.add(1).add(2).add(3);     // chaining
bm.addChecked(99);            // returns true if newly inserted
bm.addMany([10, 20, 30]);     // bulk add
bm.addRange(0, 100);          // add [0, 100)

bm.delete(42);                // returns true if present
bm.removeChecked(99);         // returns true if present
bm.removeMany([10, 20]);      // bulk remove
bm.clear();

// Query
bm.has(42);                   // true / false
bm.hasRange(0, 10);           // all of [0, 10) present?
bm.cardinality;               // bigint
bm.size;                      // number
bm.isEmpty;
bm.minimum;                   // smallest element
bm.maximum;                   // largest element

// Convert
const arr: Uint32Array = bm.toArray();

// Iterate
for (const v of bm) { ... }
const all = [...bm];
bm.forEach(v => console.log(v));
for (const [k, v] of bm.entries()) { ... }
```

### Set operations

All return new bitmaps (caller frees). In-place variants (`andInPlace`,
`orInPlace`, etc.) modify `this`.

```ts
const a = RoaringBitmap32.from([1, 2, 3, 4]);
const b = RoaringBitmap32.from([3, 4, 5, 6]);

using intersection = a.intersection(b);   // { 3, 4 }  (alias: and)
using union = a.union(b);                 // { 1, 2, 3, 4, 5, 6 }  (alias: or)
using diff = a.difference(b);             // { 1, 2 }  (alias: andnot)
using sym = a.symmetricDifference(b);     // { 1, 2, 5, 6 }  (alias: xor)

// Queries
console.log(a.equals(b));           // false
console.log(a.isSubsetOf(b));       // false
console.log(a.isSupersetOf(b));     // false
console.log(a.isDisjointFrom(b));   // false (they share 3, 4)
console.log(a.intersects(b));       // true

// Bulk union
using many = RoaringBitmap32.orMany([a, b, c]);
```

### Serialization

Three formats, each with a different tradeoff:

```ts
// Native  — C-optimized, may be more compact for sparse data
const buf = bm.serialize();
using loaded = RoaringBitmap32.deserialize(buf);
using safe = RoaringBitmap32.deserializeSafe(buf);  // bounds-checked, returns null on failure

// Portable — cross-language (Java, Go, etc.)
const buf = bm.portableSerialize();
using loaded = RoaringBitmap32.portableDeserialize(buf);
using safe = RoaringBitmap32.portableDeserializeSafe(buf);

// Frozen  — zero-copy view, no parsing, no allocation
// Requires shrinkToFit() before serialization
bm.shrinkToFit();
const frozen = bm.frozenSerialize();
using view = RoaringBitmap32.frozenView(frozen);
console.log(view.has(42));  // backed directly by the buffer
```

Frozen views are read-only — the backing `Uint8Array` must outlive the
bitmap. The bitmap keeps a reference to prevent GC.

### Bulk operations

```ts
// from a sorted TypedArray (zero-copy input)
const arr = new Uint32Array([1, 2, 3, 1000, 50000]);
using bm = RoaringBitmap32.from(arr);

// add/remove many at once
bm.addMany([10, 20, 30, 40]);
bm.removeMany([10, 20]);

// add/remove a whole range
bm.addRange(0, 1000);      // [0, 1000)
bm.removeRange(500, 600);  // [500, 600)

// check a range
bm.hasRange(0, 100);       // true if all present

// convert back to array
const all: Uint32Array = bm.toArray();              // all elements
const slice = bm.toRangeArray(100, 50);             // 50 elements starting at rank 100
```

### Rank / select

```ts
// rank: number of elements ≤ value
console.log(bm.rank(42));       // 0 if 42 < min, else count

// select: element at 0-based rank
const { value, found } = bm.select(0);  // smallest element
console.log(found ? value : "empty");

// index of a specific value
console.log(bm.indexOf(42));    // 0-based index, or -1 if absent
```

### Optimization

```ts
bm.runOptimize();        // convert to run containers where beneficial
bm.removeRunCompression(); // revert to array/bitmap containers
bm.shrinkToFit();        // reallocate to minimum size, returns bytes saved
```

### Validation

```ts
const { valid, reason } = bm.validate();
if (!valid) console.log("bitmap corrupt:", reason);
// e.g. "array elements not strictly increasing"
```

### Statistics

```ts
const stats = bm.statistics();
console.log(stats.nContainers);     // 2
console.log(stats.nArrayContainers); // 1
console.log(stats.nRunContainers);   // 1
console.log(stats.cardinality);      // 1000n
```

### Lazy operations (expert)

Defers cardinality computation for faster batched unions. **Must** call
`repairAfterLazy()` before using the result with non-lazy operations.

```ts
using l = a.lazyOr(b);
l.lazyOrInPlace(c);
l.repairAfterLazy();
console.log(l.cardinality);  // now accurate
```

### Flip / offset

```ts
using negated = bm.flip(0, 100);       // negate [0, 100)
bm.flipInPlace(0, 100);               // in-place

using shifted = bm.addOffset(10);      // shift all values up by 10
```

## Benchmarks

Roaring's strength is bulk operations on sorted integer data. Single-value
`has()` is slower than JS `Set` due to FFI overhead per call — roughly 40×.
But bulk construction, set operations, and compression are dramatically faster.

All measurements are wall-clock on an x86_64 Linux machine, averaged over
5 runs. The C library uses runtime CPU dispatch (AVX2 when available).

### Construction

| Scenario | RoaringBitmap32 | JS `Set` |
|---|---|---|
| 100k dense (`fromRange`) | < 0.01 ms | 15.1 ms |
| 100k sparse (scattered add) | 10.5 ms | — |
| 1M sorted ints (`from(Uint32Array)`) | 8.0 ms | 454 ms |

`from(Uint32Array)` is zero-copy — bun passes the TypedArray's backing store
pointer directly to C. No iteration, no marshalling.

### Membership (100k lookups)

| Scenario | RoaringBitmap32 `has()` | JS `Set` `has()` |
|---|---|---|
| Dense (consecutive range) | 8.8 ms | 0.2 ms |
| Sparse (scattered hits) | 13.6 ms | 0.3 ms |

Single-value `has()` crosses the FFI boundary on every call, which dominates.
For bulk lookups on the same key range, the C API offers
`contains_bulk()` with a reusable context — not yet exposed in the JS layer.

### Set operations (100k ∩ 100k dense)

| Operation | RoaringBitmap32 | JS `Set` (filter) |
|---|---|---|
| Intersection | 0.01 ms | 15.6 ms |
| Union | < 0.01 ms | ~30 ms |
| Difference | 0.01 ms | ~15 ms |

Set operations execute entirely in C without FFI crossings between steps.
The gap widens with larger inputs.

### Iteration (100k dense, for...of)

| | RoaringBitmap32 | JS `Set` |
|---|---|---|
| Time | 17.6 ms | 1.4 ms |

Each iterator step crosses FFI. For bulk read, `toArray()` (3.6 ms for 1M
ints) or `roaring_uint32_iterator_read()` are faster paths.

### Memory & Serialization

| | Raw `Uint32Array` | RoaringBitmap32 (portable) |
|---|---|---|
| 1M ints | 3.8 MB | 248 KB (16× smaller) |
| 100k dense range | 391 KB | 15 bytes |

The compressed format excels on dense and clustered data. A consecutive
range of 100k integers stores as a single run container — just 15 bytes
in portable form.

## Building from source

```bash
git clone --recursive https://github.com/dpwm/roaringbun.git
cd roaringbun
cd CRoaring && mkdir build && cd build
cmake .. -DBUILD_SHARED_LIBS=ON -DENABLE_ROARING_TESTS=OFF
cmake --build . -j$(nproc)
cd ../..
bun install
```

## Running tests

```bash
bun test
```

## License

MIT

## Acknowledgements

- [CRoaring](https://github.com/RoaringBitmap/CRoaring) — the C library this wraps
- [RoaringBitmap](https://roaringbitmap.org/) — the bitmap format
