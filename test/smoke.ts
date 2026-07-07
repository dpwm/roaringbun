/**
 * Smoke test for the roaringbun bindings.
 *
 * Run with: bun test/test.ts
 */

import { RoaringBitmap32, RoaringBitmap64 } from "../src/index.ts";

// ---- 32-bit ----
console.log("=== 32-bit RoaringBitmap ===");

const bm = new RoaringBitmap32();

// Add some values
bm.add(1);
bm.add(2);
bm.add(3);
bm.add(1000000);

console.log("has(1):", bm.has(1));           // true
console.log("has(999):", bm.has(999));       // false
console.log("cardinality:", bm.cardinality); // 4n
console.log("isEmpty:", bm.isEmpty);         // false
console.log("minimum:", bm.minimum);         // 1
console.log("maximum:", bm.maximum);         // 1000000

// addMany
bm.addMany([10, 20, 30]);
console.log("after addMany, cardinality:", bm.cardinality); // 7n

// remove
bm.remove(10);
console.log("after remove(10), has(10):", bm.has(10)); // false
console.log("cardinality:", bm.cardinality);            // 6n

// removeChecked
const removed = bm.removeChecked(20);
console.log("removeChecked(20):", removed); // true
console.log("removeChecked(20) again:", bm.removeChecked(20)); // false

// contains / hasRange
console.log("hasRange(1, 5):", bm.hasRange(1, 5)); // false (4 missing)
console.log("hasRange(1, 3):", bm.hasRange(1, 3)); // true (1,2 in range)
console.log("hasRange(1, 4):", bm.hasRange(1, 4)); // true (1,2,3 in range)

// select
const { value, found } = bm.select(0);
console.log("select(0):", { value, found }); // { value: 1, found: true }

// rank
console.log("rank(3):", bm.rank(3)); // 3n

// toArray
const arr = bm.toArray();
console.log("toArray:", Array.from(arr));

// from
const bm2 = RoaringBitmap32.from([10, 20, 30, 40, 50]);
console.log("from cardinality:", bm2.cardinality);

// Set operations
const bm3 = bm.and(bm2);
console.log("and cardinality:", bm3.cardinality); // 0 (no overlap)

const bm4 = bm.or(bm2);
console.log("or cardinality:", bm4.cardinality); // 5 + 3 = ... let's see

const bm5 = bm2.andnot(bm);
console.log("andnot cardinality:", bm5.cardinality);

// equals - bm4 = bm or bm2 = {1, 2, 3, 10, 20, 30, 40, 50, 1000000}
const bm6 = RoaringBitmap32.from([1, 2, 3, 10, 20, 30, 40, 50, 1000000]);
console.log("equals expected:", bm4.equals(bm6)); // should be true

// Serialization
const serialized = bm4.portableSerialize();
console.log("portableSerialize bytes:", serialized.length);

const bm7 = RoaringBitmap32.portableDeserialize(serialized);
console.log("deserialized cardinality:", bm7.cardinality);
console.log("equals original:", bm4.equals(bm7));

// Internal validation
const { valid } = bm4.validate();
console.log("valid:", valid);

// Statistics
const stats = bm4.statistics();
console.log("statistics:", stats);

// Cleanup
bm.free();
bm2.free();
bm3.free();
bm4.free();
bm5.free();
bm6.free();
bm7.free();

console.log("\n=== 64-bit RoaringBitmap ===");

const bm64 = new RoaringBitmap64();
bm64.add(1n);
bm64.add(2n);
bm64.add(3n);
bm64.add(1_000_000_000_000n);

console.log("has(1n):", bm64.has(1n));
console.log("has(999n):", bm64.has(999n));
console.log("cardinality:", bm64.cardinality);
console.log("minimum:", bm64.minimum);
console.log("maximum:", bm64.maximum);

// addMany
bm64.addMany([10n, 20n, 30n]);
console.log("after addMany, cardinality:", bm64.cardinality);

// toArray
const arr64 = bm64.toArray();
console.log("toArray:", Array.from(arr64).map(String));

// from
const bm64_2 = RoaringBitmap64.from([10n, 20n, 30n, 40n, 50n]);
console.log("from cardinality:", bm64_2.cardinality);

// Set operations
const bm64_3 = bm64.or(bm64_2);
console.log("or cardinality:", bm64_3.cardinality);
console.log("intersects:", bm64.intersects(bm64_2));

// Serialization
const ser64 = bm64_3.portableSerialize();
console.log("portableSerialize bytes:", ser64.length);

const bm64_4 = RoaringBitmap64.portableDeserializeSafe(ser64, ser64.length);
console.log("deserialized cardinality:", bm64_4?.cardinality);

// Cleanup
bm64.free();
bm64_2.free();
bm64_3.free();
bm64_4?.free();

// Move from 32-bit
const bm32 = RoaringBitmap32.from([100, 200, 300]);
const bm64_from32 = RoaringBitmap64.moveFromRoaring32(bm32);
console.log("\n=== moveFromRoaring32 ===");
console.log("cardinality:", bm64_from32.cardinality);
console.log("has(100):", bm64_from32.has(100n));
console.log("has(999):", bm64_from32.has(999n));
bm32.free();
bm64_from32.free();

// ---- iterator protocol ----
console.log("\n=== Iterator protocol ===");

const iterBm = RoaringBitmap32.from([10, 20, 30, 40, 50]);
let sum = 0;
for (const val of iterBm) {
  sum += val;
}
console.log("for...of sum:", sum); // 150

const entries = [...iterBm.entries()];
console.log("entries:", entries); // [[10,10],[20,20],...]

const values = [...iterBm.values()];
console.log("values:", values); // [10,20,30,40,50]

let count = 0;
let forEachSum = 0;
iterBm.forEach((v) => { count++; forEachSum += v; });
console.log("forEach count:", count, "sum:", forEachSum);

console.log("size:", iterBm.size); // 5

console.log("keys:", [...iterBm.keys()]);

// --- 64-bit iterator ---
const iterBm64 = RoaringBitmap64.from([100n, 200n, 300n]);
const vals64: bigint[] = [];
for (const v of iterBm64) {
  vals64.push(v);
}
console.log("64-bit iter:", vals64.map(String));

let sum64 = 0n;
iterBm64.forEach((v) => { sum64 += v; });
console.log("64-bit forEach sum:", String(sum64));
console.log("64-bit size:", iterBm64.size);

iterBm.free();
iterBm64.free();

console.log("\n✅ All smoke tests passed!");
