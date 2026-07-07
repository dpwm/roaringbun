# roaringbun

<!-- TODO: one-liner describing what this is -->

> **Status:** Early development. The API is usable but may change.

## Features

<!-- TODO: list key selling points — FFI bindings, 32-bit + 64-bit, Set-compatible API, iterator protocol, serialization, etc. -->

## Installation

```bash
bun add roaringbun
```

<!-- TODO: any prerequisites (build tools for CRoaring submodule, etc.) -->

## Quickstart

```ts
import { RoaringBitmap32 } from "roaringbun";

// Create a bitmap and add values
const bm = new RoaringBitmap32();
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
const other = RoaringBitmap32.from([3, 4, 5]);
const union = bm.union(other);
console.log([...union]); // [1, 2, 3, 4, 5]

// Free when done
bm.free();
other.free();
union.free();
```

## API

<!-- TODO: organize into sections — lifecycle, add/remove, queries, set operations, iteration, serialization, optimization, static methods -->

### 32-bit (`RoaringBitmap32`)

<!-- TODO: table or list of methods with brief descriptions -->

### 64-bit (`RoaringBitmap64`)

<!-- TODO: same for 64-bit — mention bigint usage -->

## Benchmarks

<!-- TODO: brief summary with numbers comparing to JS Set for relevant operations (union/intersection are faster, single has() is slower due to FFI) -->

## Building from source

```bash
git clone --recursive https://github.com/your-username/roaringbun.git
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
