# roaringbun

Roaringbun is a zero-dependency roaring bitmap library for bun.

## Features

* Zero-dependency install — prebuilt `libroaring.so` ships with the package
* 32-bit and 64-bit roaring bitmaps with a consistent API
* Javascript `Set`-compatible API: `intersection()`, `union()`, `isSubsetOf()`.
* 99-test suite mostly ported from CRoaring
* SQLite-compatible serialization (interop with roaringlite)
* Advanced features like zero-copy frozen views backed directly by a `Uint8Array`

## Installation

```bash
bun add roaringbun
```

Prebuilt binaries are included for **linux-x64-glibc**. No postinstall hooks.
Other platforms: see [Building from source](#building-from-source).

## Quickstart

```ts
import { RoaringBitmap32 } from "roaringbun";

using bm = new RoaringBitmap32();
bm.add(1).add(2).add(3);

console.log(bm.has(2));    // true
console.log(bm.cardinality); // 3n
console.log(bm.size);       // 3

for (const v of bm) {
  console.log(v);
}

using other = RoaringBitmap32.from([3, 4, 5]);
using union = bm.union(other);
console.log([...union]); // [1, 2, 3, 4, 5]
```

## SQLite interop

Stored blobs from [roaringlite](https://github.com/dpwm/roaringlite) are
compatible with `deserializeSafe()` — both use the native CRoaring format:

```ts
const row = db.query("SELECT bitmap FROM data WHERE id = ?").get(42);
using bm = RoaringBitmap32.deserializeSafe(row.bitmap);
console.log(bm.cardinality, [...bm]);
```

Bitmaps serialized with `serialize()` can be loaded by roaringlite too.

## Frozen Views

Zero-copy loading from a `Uint8Array` — no parsing, no allocation.
The resulting bitmap is a direct view of the buffer's memory.

```ts
using bm = RoaringBitmap32.frozenView(uint8array);
console.log(bm.has(42));  // backed directly by the buffer, no copy
```

Requires data stored in frozen format (see `frozenSerialize()` in the source).

## API

All JSDoc lives in the source files — the README is a map to find what
you need. Each source file exports one or more public classes along with
related types.

| Source file | Exports | What it is |
|---|---|---|
| [`src/ffi.ts`](./src/ffi.ts) | ~110 raw C functions, `FFIType`, `read`, `ptr` | Low-level `dlopen` bindings to CRoaring. Every C function is callable directly. |
| [`src/roaring32.ts`](./src/roaring32.ts) | `RoaringBitmap32`, `RoaringBitmap32Iterator`, `BulkContext`, `RoaringStatistics` | 32-bit bitmap. Main class with the full API. |
| [`src/roaring64.ts`](./src/roaring64.ts) | `RoaringBitmap64`, `RoaringBitmap64Iterator`, `BulkContext64`, `Roaring64Statistics` | 64-bit bitmap. Same API as 32-bit, accepts `bigint`. |
| [`src/index.ts`](./src/index.ts) | (re-exports everything above) | Entry point. Import from `"roaringbun"`. |

### Quick method reference

Common operations (both `RoaringBitmap32` and `RoaringBitmap64`):

- **Lifecycle**: `constructor`, `free()`, `using`, `from()`, `copy()`, `frozenView()`
- **Add / remove**: `add()`, `delete()`, `addMany()`, `clear()`
- **Query**: `has()`, `hasAll()`, `hasRange()`, `cardinality`, `size`, `isEmpty`, `minimum`, `maximum`
- **Set ops**: `intersection()`, `union()`, `difference()`, `symmetricDifference()`, `isSubsetOf()`, `isSupersetOf()`, `isDisjointFrom()`, `intersects()`
- **In-place set ops**: `andInPlace()`, `orInPlace()`, `xorInPlace()`, `andnotInPlace()`
- **Rank / select**: `rank()`, `select()`, `indexOf()`
- **Iteration**: `[Symbol.iterator]()`, `values()`, `entries()`, `forEach()`
- **Serialization**: `serialize()`, `deserialize()`, `deserializeSafe()`, `portableSerialize()`, `portableDeserialize()`, `frozenSerialize()`, `frozenView()`
- **Bulk**: `addMany()`, `removeMany()`, `addRange()`, `removeRange()`, `toArray()`, `toRangeArray()`
- **Optimization**: `runOptimize()`, `removeRunCompression()`, `shrinkToFit()`
- **Validation**: `validate()`, `statistics()`
- **Lazy (expert)**: `lazyOr()`, `lazyXor()`, `repairAfterLazy()`
- **Other**: `flip()`, `addOffset()`, `equals()`, `jaccardIndex()`

Old CRoaring-style names (`and`, `or`, `xor`, `andnot`, `isSubset`,
`isStrictSubset`, `remove`) are kept as aliases.

## Benchmarks

Roaring's strength is bulk operations on sorted integer data.
Single-value `has()` is around 40x slower than JS `Set`.
Bulk construction, set operations, and compression are dramatically faster.

All measurements are wall-clock on an x86_64 Linux machine. See
[`test/bench.ts`](./test/bench.ts) for the full benchmark suite.

### Construction

| Scenario | RoaringBitmap32 | JS `Set` |
|---|---|---|
| 100k dense (`fromRange`) | < 0.01 ms | 15.1 ms |
| 100k sparse (scattered add) | 10.5 ms | — |
| 1M sorted ints (`from(Uint32Array)`) | 8.0 ms | 454 ms |

### Batch membership (per-value vs `hasAll`)

Building a query bitmap from the values and using `isSubsetOf` is
**6-8× faster** than calling `has()` on each value individually:

```ts
// Per-value: N FFI calls, ~47 ns each
for (const v of values) bm.has(v);

// Batch: 1 FFI call, ~7 ns per value
using query = RoaringBitmap32.from(values);
query.isSubsetOf(bm);
```

| Batch size | per-value `has()` | `isSubsetOf` | speedup |
|---|---|---|---|
| 128 | 46.79 ns | 14.82 ns | 3.16× |
| 256 | 48.93 ns | 11.50 ns | 4.26× |
| 512 | 50.16 ns | 9.67 ns | 5.19× |
| 1,024 | 49.45 ns | 7.68 ns | 6.44× |
| 2,048 | 51.22 ns | 7.85 ns | 6.53× |
| 4,096 | 51.24 ns | 7.51 ns | 6.82× |
| 8,192 | 50.12 ns | 7.49 ns | 6.69× |
| 16,384 | 48.58 ns | 7.70 ns | 6.31× |
| 32,768 | 49.10 ns | 7.26 ns | 6.76× |
| 65,536 | 51.91 ns | 6.20 ns | 8.38× |

Nanoseconds per element, minimum of 20 runs after warmup with CPU
governor set to performance. `intersection()` and `difference()` have
the same cost as `isSubsetOf` since all three are dominated by building
the query bitmap from the input array.

### Memory & Serialization

| | Raw `Uint32Array` | RoaringBitmap32 (portable) |
|---|---|---|
| 1M ints | 3.8 MB | 248 KB (16× smaller) |
| 100k dense range | 391 KB | 15 bytes |

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
