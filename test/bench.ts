/**
 * Benchmarks for roaringbun.
 *
 * Run: bun run test/bench.ts
 *
 * All times are minimum over N runs after warmup.
 * Per-element times in nanoseconds to normalize across batch sizes.
 */

import { RoaringBitmap32 } from "../src/index.ts";

const RUNS = parseInt(process.env.RUNS || "20", 10);
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

console.log("\n=== Batch contains (per-value vs isSubsetOf) ===\n");

// Build a bitmap with 50k even numbers
const bm = new RoaringBitmap32();
for (let i = 0; i < 50000; i++) bm.add(i * 2);

// Warmup — ~500k operations to stabilize JIT and CPU frequency
for (let i = 0; i < 20; i++) {
  const w = new Uint32Array(8192);
  for (let j = 0; j < 8192; j++) w[j] = (j * 7) % 100000;
  bm.hasAll(w);
  for (let j = 0; j < 8192; j++) bm.has(w[j]);
  RoaringBitmap32.from(w).intersection(bm).free();
}

function bench(fn: () => void, runs: number): number {
  let min = Infinity;
  for (let r = 0; r < runs; r++) {
    const t1 = performance.now();
    fn();
    const t2 = performance.now();
    const elapsed = t2 - t1;
    if (elapsed < min) min = elapsed;
  }
  return min;
}

const RUNS2 = parseInt(process.env.RUNS || "20", 10);

console.log("Batch size | per-value ns | batch ns | speedup");
console.log("-----------+--------------+----------+--------");

for (let log2 = 12; log2 <= 16; log2++) {
  const n = 1 << log2;
  const vals = new Uint32Array(n);
  for (let i = 0; i < n; i++) vals[i] = (i * 7) % 100000;

  const pv = bench(() => { for (let i = 0; i < n; i++) bm.has(vals[i]); }, RUNS2);
  const nsPV = (pv * 1e6 / n).toFixed(1);

  const batch = bench(() => {
    const q = RoaringBitmap32.from(vals);
    q.isSubsetOf(bm);
    q.free();
  }, RUNS2);
  const nsBatch = (batch * 1e6 / n).toFixed(1);

  const speedup = (pv / Math.max(batch, 1e-9)).toFixed(1);
  console.log(`${n.toString().padStart(9)} | ${nsPV.padStart(8)} ns | ${nsBatch.padStart(8)} ns | ${speedup.padStart(5)}×`);
}

bm.free();
console.log("\n✅ Benchmarks complete");
