/**
 * roaringbun — Bun FFI bindings to CRoaring (Roaring Bitmaps).
 *
 * @example
 * ```ts
 * import { RoaringBitmap32 } from "roaringbun";
 *
 * const bm = new RoaringBitmap32();
 * bm.add(42);
 * bm.add(100);
 * console.log(bm.has(42)); // true
 * console.log(bm.cardinality); // 2n
 * console.log(bm.toArray()); // Uint32Array [42, 100]
 * bm.free();
 * ```
 */

// Re-export the raw FFI symbols for advanced use.
export * from "./ffi.ts";

// High-level wrapper classes.
export { RoaringBitmap32, RoaringBitmap32Iterator } from "./roaring32.ts";
export type { RoaringStatistics } from "./roaring32.ts";

export { RoaringBitmap64, RoaringBitmap64Iterator } from "./roaring64.ts";
export type { Roaring64Statistics } from "./roaring64.ts";
