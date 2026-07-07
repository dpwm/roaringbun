/**
 * Simple benchmarks for roaringbun.
 *
 * Run: bun run test/bench.ts
 *
 * These are wall-clock benchmarks (not micro-benchmarks). They compare
 * roaringbun against JS's native Set for the same operations to give
 * a rough sense of where roaring shines.
 *
 * Caveats:
 *  - JS Set stores arbitrary values, not just uint32, so the comparison
 *    is only meaningful for integer sets.
 *  - Times include FFI overhead, which bun minimizes but doesn't eliminate.
 *  - Use --runs=N to control iterations (default 5).
 */

import { RoaringBitmap32 } from "../src/index.ts";

const RUNS = parseInt(process.env.RUNS || "5", 10);
const DENSE_SIZE = 100_000;
const SPARSE_SIZE = 100_000;
const SPARSE_SPREAD = 10_000_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nano(tag: string, fn: () => void, runs = RUNS) {
  // warmup
  fn();

  const start = performance.now();
  for (let i = 0; i < runs; i++) fn();
  const elapsed = performance.now() - start;
  const perRun = (elapsed / runs).toFixed(2);
  console.log(`  ${tag}: ${perRun} ms/run  (${runs} runs, ${elapsed.toFixed(1)} ms total)`);
}

function format(n: bigint | number): string {
  return Number(n).toLocaleString();
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

console.log("\n=== Construct / populate ===\n");

// Dense bitmap vs Set
nano("RoaringBitmap32.fromRange(0, 100k)", () => {
  const bm = RoaringBitmap32.fromRange(0, DENSE_SIZE);
  bm.free();
});

// Sparse bitmap
nano("RoaringBitmap32 add 100k sparse values", () => {
  const bm = new RoaringBitmap32();
  for (let i = 0; i < SPARSE_SIZE; i++) {
    bm.add(i * (SPARSE_SPREAD / SPARSE_SIZE));
  }
  bm.free();
});

// JS Set dense
nano("JS Set add 100k dense values", () => {
  const s = new Set<number>();
  for (let i = 0; i < DENSE_SIZE; i++) s.add(i);
});

console.log("\n=== Membership ===\n");

// Contains dense
(() => {
  const bm = RoaringBitmap32.fromRange(0, DENSE_SIZE);
  const jsSet = new Set<number>();
  for (let i = 0; i < DENSE_SIZE; i++) jsSet.add(i);

  nano("RoaringBitmap32 has (all dense)", () => {
    for (let i = 0; i < DENSE_SIZE; i++) bm.has(i);
  });

  nano("JS Set has (all dense)", () => {
    for (let i = 0; i < DENSE_SIZE; i++) jsSet.has(i);
  });

  bm.free();
})();

// Contains sparse
(() => {
  const bm = new RoaringBitmap32();
  const jsSet = new Set<number>();
  for (let i = 0; i < SPARSE_SIZE; i++) {
    const v = i * (SPARSE_SPREAD / SPARSE_SIZE);
    bm.add(v);
    jsSet.add(v);
  }

  nano("RoaringBitmap32 has (sparse, hit)", () => {
    for (let i = 0; i < SPARSE_SIZE; i++) {
      bm.has(i * (SPARSE_SPREAD / SPARSE_SIZE));
    }
  });

  nano("JS Set has (sparse, hit)", () => {
    for (let i = 0; i < SPARSE_SIZE; i++) {
      jsSet.has(i * (SPARSE_SPREAD / SPARSE_SIZE));
    }
  });

  bm.free();
})();

console.log("\n=== Set operations (dense 100k ∩ 100k) ===\n");

(() => {
  const a = RoaringBitmap32.fromRange(0, DENSE_SIZE);
  const b = RoaringBitmap32.fromRange(DENSE_SIZE / 2, DENSE_SIZE + DENSE_SIZE / 2);

  const jsA = new Set<number>();
  const jsB = new Set<number>();
  for (let i = 0; i < DENSE_SIZE; i++) jsA.add(i);
  for (let i = DENSE_SIZE / 2; i < DENSE_SIZE + DENSE_SIZE / 2; i++) jsB.add(i);

  nano("RoaringBitmap32 intersection", () => {
    const r = a.intersection(b);
    r.free();
  });

  nano("JS Set intersection (filter)", () => {
    const r = new Set([...jsA].filter(x => jsB.has(x)));
  });

  nano("RoaringBitmap32 union", () => {
    const r = a.union(b);
    r.free();
  });

  nano("RoaringBitmap32 difference", () => {
    const r = a.difference(b);
    r.free();
  });

  a.free(); b.free();
})();

console.log("\n=== Iteration (100k dense) ===\n");

(() => {
  const bm = RoaringBitmap32.fromRange(0, DENSE_SIZE);
  const jsSet = new Set<number>();
  for (let i = 0; i < DENSE_SIZE; i++) jsSet.add(i);

  nano("RoaringBitmap32 for...of", () => {
    let sum = 0;
    for (const v of bm) sum += v;
  });

  nano("JS Set for...of", () => {
    let sum = 0;
    for (const v of jsSet) sum += v;
  });

  bm.free();
})();

console.log("\n=== Serialization (100k dense) ===\n");

(() => {
  const bm = RoaringBitmap32.fromRange(0, DENSE_SIZE);

  nano("RoaringBitmap32 portable serialize", () => {
    const data = bm.portableSerialize();
  });

  const data = bm.portableSerialize();

  nano("RoaringBitmap32 portable deserialize", () => {
    const restored = RoaringBitmap32.portableDeserialize(data);
    restored.free();
  });

  console.log(`  Serialized size: ${(data.length / 1024).toFixed(1)} KB`);

  bm.free();
})();

console.log("\n✅ Benchmarks complete");
