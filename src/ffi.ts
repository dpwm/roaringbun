/**
 * Low-level Bun FFI bindings to CRoaring (libroaring).
 *
 * Maps each C function in the CRoaring public API to a JS-callable
 * function via `bun:ffi`'s `dlopen`.
 */

import { dlopen, FFIType, ptr, read, toArrayBuffer, suffix } from "bun:ffi";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

// ---- helpers -----------------------------------------------------------

/**
 * Resolve the path to libroaring shared library.
 *
 * Resolution order:
 *   1. `prebuilt/<platform>-<arch>/libroaring.so` — prebuilt binary
 *      shipped with the npm package
 *   2. `CRoaring/build/libroaring.so` — local development build
 */
function libraryPath(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(dir, "..");

  // Prebuilt binary for the current platform
  const plat = process.platform;
  const arch = process.arch;
  const prebuiltDir = path.join(root, "prebuilt", `${plat}-${arch}`);
  const prebuiltPath = path.join(prebuiltDir, `libroaring.${suffix}`);

  // Prebuilt binary shipped with npm package
  if (existsSync(prebuiltPath)) {
    return prebuiltPath;
  }

  // Fallback: local development build
  const buildDir = path.resolve(root, "CRoaring", "build");
  return path.join(buildDir, `libroaring.${suffix}`);
}

// ---- type shorthand ----------------------------------------------------

const { ptr, u8, u16, u32, u64, i64, f64, bool, cstring, usize, void: void_ } = FFIType;

// ---- symbol table ------------------------------------------------------

const LIB = dlopen(libraryPath(), {
  // --- lifecycle ---
  roaring_bitmap_create:                { args: [],                                          returns: ptr },
  roaring_bitmap_create_with_capacity:  { args: [u32],                                       returns: ptr },
  roaring_bitmap_free:                  { args: [ptr],                                       returns: void_ },
  roaring_bitmap_copy:                  { args: [ptr],                                       returns: ptr },
  roaring_bitmap_overwrite:             { args: [ptr, ptr],                                  returns: bool },

  // --- add / remove / contains ---
  roaring_bitmap_add:                   { args: [ptr, u32],                                  returns: void_ },
  roaring_bitmap_add_checked:           { args: [ptr, u32],                                  returns: bool },
  roaring_bitmap_add_many:              { args: [ptr, usize, ptr],                           returns: void_ },
  roaring_bitmap_add_bulk:              { args: [ptr, ptr, u32],                             returns: void_ },
  roaring_bitmap_add_range:             { args: [ptr, u64, u64],                             returns: void_ },
  roaring_bitmap_add_range_closed:      { args: [ptr, u32, u32],                             returns: void_ },
  roaring_bitmap_remove:                { args: [ptr, u32],                                  returns: void_ },
  roaring_bitmap_remove_checked:        { args: [ptr, u32],                                  returns: bool },
  roaring_bitmap_remove_many:           { args: [ptr, usize, ptr],                           returns: void_ },
  roaring_bitmap_remove_range:          { args: [ptr, u64, u64],                             returns: void_ },
  roaring_bitmap_remove_range_closed:   { args: [ptr, u32, u32],                             returns: void_ },
  roaring_bitmap_contains:              { args: [ptr, u32],                                  returns: bool },
  roaring_bitmap_contains_bulk:         { args: [ptr, ptr, u32],                             returns: bool },
  roaring_bitmap_contains_range:        { args: [ptr, u64, u64],                             returns: bool },
  roaring_bitmap_contains_range_closed: { args: [ptr, u32, u32],                             returns: bool },
  roaring_bitmap_clear:                 { args: [ptr],                                       returns: void_ },

  // --- cardinality / query ---
  roaring_bitmap_get_cardinality:       { args: [ptr],                                       returns: u64 },
  roaring_bitmap_range_cardinality:     { args: [ptr, u64, u64],                             returns: u64 },
  roaring_bitmap_is_empty:              { args: [ptr],                                       returns: bool },
  roaring_bitmap_minimum:               { args: [ptr],                                       returns: u32 },
  roaring_bitmap_maximum:               { args: [ptr],                                       returns: u32 },
  roaring_bitmap_select:                { args: [ptr, u32, ptr],                             returns: bool },
  roaring_bitmap_rank:                  { args: [ptr, u32],                                  returns: u64 },
  roaring_bitmap_get_index:             { args: [ptr, u32],                                  returns: i64 },

  // --- set operations (returning new bitmap) ---
  roaring_bitmap_and:                   { args: [ptr, ptr],                                  returns: ptr },
  roaring_bitmap_or:                    { args: [ptr, ptr],                                  returns: ptr },
  roaring_bitmap_xor:                   { args: [ptr, ptr],                                  returns: ptr },
  roaring_bitmap_andnot:                { args: [ptr, ptr],                                  returns: ptr },
  roaring_bitmap_and_cardinality:       { args: [ptr, ptr],                                  returns: u64 },
  roaring_bitmap_or_cardinality:        { args: [ptr, ptr],                                  returns: u64 },
  roaring_bitmap_xor_cardinality:       { args: [ptr, ptr],                                  returns: u64 },
  roaring_bitmap_andnot_cardinality:    { args: [ptr, ptr],                                  returns: u64 },
  roaring_bitmap_intersect:             { args: [ptr, ptr],                                  returns: bool },
  roaring_bitmap_intersect_with_range:  { args: [ptr, u64, u64],                             returns: bool },
  roaring_bitmap_jaccard_index:         { args: [ptr, ptr],                                  returns: f64 },
  roaring_bitmap_equals:                { args: [ptr, ptr],                                  returns: bool },
  roaring_bitmap_is_subset:             { args: [ptr, ptr],                                  returns: bool },
  roaring_bitmap_is_strict_subset:      { args: [ptr, ptr],                                  returns: bool },

  // --- in-place set operations ---
  roaring_bitmap_and_inplace:           { args: [ptr, ptr],                                  returns: void_ },
  roaring_bitmap_or_inplace:            { args: [ptr, ptr],                                  returns: void_ },
  roaring_bitmap_xor_inplace:           { args: [ptr, ptr],                                  returns: void_ },
  roaring_bitmap_andnot_inplace:        { args: [ptr, ptr],                                  returns: void_ },

  // --- lazy operations ---
  roaring_bitmap_lazy_or:               { args: [ptr, ptr, bool],                            returns: ptr },
  roaring_bitmap_lazy_or_inplace:       { args: [ptr, ptr, bool],                            returns: void_ },
  roaring_bitmap_lazy_xor:              { args: [ptr, ptr],                                  returns: ptr },
  roaring_bitmap_lazy_xor_inplace:      { args: [ptr, ptr],                                  returns: void_ },
  roaring_bitmap_repair_after_lazy:     { args: [ptr],                                       returns: void_ },

  // --- flip / offset ---
  roaring_bitmap_flip:                  { args: [ptr, u64, u64],                             returns: ptr },
  roaring_bitmap_flip_closed:           { args: [ptr, u32, u32],                             returns: ptr },
  roaring_bitmap_flip_inplace:          { args: [ptr, u64, u64],                             returns: void_ },
  roaring_bitmap_flip_inplace_closed:   { args: [ptr, u32, u32],                             returns: void_ },
  roaring_bitmap_add_offset:            { args: [ptr, i64],                                  returns: ptr },

  // --- from values ---
  roaring_bitmap_from_range:            { args: [u64, u64, u32],                             returns: ptr },
  roaring_bitmap_of_ptr:                { args: [usize, ptr],                                returns: ptr },
  roaring_bitmap_or_many:               { args: [usize, ptr],                                returns: ptr },
  roaring_bitmap_or_many_heap:          { args: [u32, ptr],                                  returns: ptr },
  roaring_bitmap_xor_many:              { args: [usize, ptr],                                returns: ptr },

  // --- convert to array ---
  roaring_bitmap_to_uint32_array:       { args: [ptr, ptr],                                  returns: void_ },
  roaring_bitmap_range_uint32_array:    { args: [ptr, usize, usize, ptr],                    returns: bool },

  // --- serialization (native format) ---
  roaring_bitmap_size_in_bytes:         { args: [ptr],                                       returns: usize },
  roaring_bitmap_serialize:             { args: [ptr, ptr],                               returns: usize },
  roaring_bitmap_deserialize:           { args: [ptr],                                       returns: ptr },
  roaring_bitmap_deserialize_safe:      { args: [ptr, usize],                                returns: ptr },

  // --- serialization (portable / cross-language) ---
  roaring_bitmap_portable_size_in_bytes: { args: [ptr],                                      returns: usize },
  roaring_bitmap_portable_serialize:     { args: [ptr, ptr],                              returns: usize },
  roaring_bitmap_portable_deserialize:   { args: [cstring],                                  returns: ptr },
  roaring_bitmap_portable_deserialize_safe: { args: [cstring, usize],                        returns: ptr },
  roaring_bitmap_portable_deserialize_size: { args: [cstring, usize],                        returns: usize },

  // --- frozen serialization ---
  roaring_bitmap_frozen_size_in_bytes:  { args: [ptr],                                       returns: usize },
  roaring_bitmap_frozen_serialize:      { args: [ptr, ptr],                               returns: void_ },
  roaring_bitmap_frozen_view:           { args: [ptr, usize],                             returns: ptr },

  // --- optimization ---
  roaring_bitmap_run_optimize:          { args: [ptr],                                       returns: bool },
  roaring_bitmap_remove_run_compression: { args: [ptr],                                      returns: bool },
  roaring_bitmap_shrink_to_fit:         { args: [ptr],                                       returns: usize },

  // --- copy-on-write ---
  roaring_bitmap_get_copy_on_write:     { args: [ptr],                                       returns: bool },
  roaring_bitmap_set_copy_on_write:     { args: [ptr, bool],                                 returns: void_ },
  roaring_contains_shared:              { args: [ptr],                                       returns: bool },
  roaring_unshare_all:                  { args: [ptr],                                       returns: bool },

  // --- statistics / debug ---
  roaring_bitmap_statistics:            { args: [ptr, ptr],                                  returns: void_ },
  roaring_bitmap_printf:                { args: [ptr],                                       returns: void_ },
  roaring_bitmap_printf_describe:       { args: [ptr],                                       returns: void_ },
  roaring_bitmap_internal_validate:     { args: [ptr, ptr],                                  returns: bool },

  // --- iterator ---
  roaring_iterator_create:             { args: [ptr],                                        returns: ptr },
  roaring_iterator_init:               { args: [ptr, ptr],                                  returns: void_ },
  roaring_iterator_init_last:          { args: [ptr, ptr],                                  returns: void_ },
  roaring_uint32_iterator_free:        { args: [ptr],                                        returns: void_ },
  roaring_uint32_iterator_copy:        { args: [ptr],                                        returns: ptr },
  roaring_uint32_iterator_advance:     { args: [ptr],                                        returns: bool },
  roaring_uint32_iterator_previous:    { args: [ptr],                                        returns: bool },
  roaring_uint32_iterator_move_equalorlarger: { args: [ptr, u32],                           returns: bool },
  roaring_uint32_iterator_read:        { args: [ptr, ptr, u32],                              returns: u32 },
  roaring_uint32_iterator_read_backward: { args: [ptr, ptr, u32],                            returns: u32 },
  roaring_uint32_iterator_read_ranges: { args: [ptr, ptr, usize],                           returns: usize },
  roaring_uint32_iterator_read_prev_ranges: { args: [ptr, ptr, usize],                      returns: usize },
  roaring_uint32_iterator_skip:        { args: [ptr, u32],                                   returns: u32 },
  roaring_uint32_iterator_skip_backward: { args: [ptr, u32],                                 returns: u32 },
  roaring_iterate:                     { args: [ptr, ptr, ptr],                              returns: bool },
  roaring_iterate64:                   { args: [ptr, ptr, u64, ptr],                         returns: bool },

  // =====================================================================
  // 64-bit API
  // =====================================================================

  // --- lifecycle ---
  roaring64_bitmap_create:             { args: [],                                           returns: ptr },
  roaring64_bitmap_free:               { args: [ptr],                                        returns: void_ },
  roaring64_bitmap_copy:               { args: [ptr],                                        returns: ptr },
  roaring64_bitmap_overwrite:          { args: [ptr, ptr],                                   returns: void_ },
  roaring64_bitmap_move_from_roaring32: { args: [ptr],                                       returns: ptr },

  // --- add / remove / contains ---
  roaring64_bitmap_add:                { args: [ptr, u64],                                   returns: void_ },
  roaring64_bitmap_add_checked:        { args: [ptr, u64],                                   returns: bool },
  roaring64_bitmap_add_many:           { args: [ptr, usize, ptr],                            returns: void_ },
  roaring64_bitmap_add_bulk:           { args: [ptr, ptr, u64],                              returns: void_ },
  roaring64_bitmap_add_range:          { args: [ptr, u64, u64],                              returns: void_ },
  roaring64_bitmap_add_range_closed:   { args: [ptr, u64, u64],                              returns: void_ },
  roaring64_bitmap_remove:             { args: [ptr, u64],                                   returns: void_ },
  roaring64_bitmap_remove_checked:     { args: [ptr, u64],                                   returns: bool },
  roaring64_bitmap_remove_many:        { args: [ptr, usize, ptr],                            returns: void_ },
  roaring64_bitmap_remove_bulk:        { args: [ptr, ptr, u64],                              returns: void_ },
  roaring64_bitmap_remove_range:       { args: [ptr, u64, u64],                              returns: void_ },
  roaring64_bitmap_remove_range_closed: { args: [ptr, u64, u64],                             returns: void_ },
  roaring64_bitmap_contains:           { args: [ptr, u64],                                   returns: bool },
  roaring64_bitmap_contains_bulk:      { args: [ptr, ptr, u64],                              returns: bool },
  roaring64_bitmap_contains_range:     { args: [ptr, u64, u64],                              returns: bool },
  roaring64_bitmap_contains_range_closed: { args: [ptr, u64, u64],                           returns: bool },
  roaring64_bitmap_clear:              { args: [ptr],                                        returns: void_ },

  // --- cardinality / query ---
  roaring64_bitmap_get_cardinality:    { args: [ptr],                                        returns: u64 },
  roaring64_bitmap_range_cardinality:  { args: [ptr, u64, u64],                              returns: u64 },
  roaring64_bitmap_is_empty:           { args: [ptr],                                        returns: bool },
  roaring64_bitmap_minimum:            { args: [ptr],                                        returns: u64 },
  roaring64_bitmap_maximum:            { args: [ptr],                                        returns: u64 },
  roaring64_bitmap_select:             { args: [ptr, u64, ptr],                              returns: bool },
  roaring64_bitmap_rank:               { args: [ptr, u64],                                   returns: u64 },
  roaring64_bitmap_get_index:          { args: [ptr, u64, ptr],                              returns: bool },

  // --- set operations ---
  roaring64_bitmap_and:                { args: [ptr, ptr],                                   returns: ptr },
  roaring64_bitmap_and_cardinality:    { args: [ptr, ptr],                                   returns: u64 },
  roaring64_bitmap_and_inplace:        { args: [ptr, ptr],                                   returns: void_ },
  roaring64_bitmap_or:                 { args: [ptr, ptr],                                   returns: ptr },
  roaring64_bitmap_or_cardinality:     { args: [ptr, ptr],                                   returns: u64 },
  roaring64_bitmap_or_inplace:         { args: [ptr, ptr],                                   returns: void_ },
  roaring64_bitmap_xor:                { args: [ptr, ptr],                                   returns: ptr },
  roaring64_bitmap_xor_cardinality:    { args: [ptr, ptr],                                   returns: u64 },
  roaring64_bitmap_xor_inplace:        { args: [ptr, ptr],                                   returns: void_ },
  roaring64_bitmap_andnot:             { args: [ptr, ptr],                                   returns: ptr },
  roaring64_bitmap_andnot_cardinality: { args: [ptr, ptr],                                   returns: u64 },
  roaring64_bitmap_andnot_inplace:     { args: [ptr, ptr],                                   returns: void_ },
  roaring64_bitmap_intersect:          { args: [ptr, ptr],                                   returns: bool },
  roaring64_bitmap_intersect_with_range: { args: [ptr, u64, u64],                            returns: bool },
  roaring64_bitmap_jaccard_index:      { args: [ptr, ptr],                                   returns: f64 },
  roaring64_bitmap_equals:             { args: [ptr, ptr],                                   returns: bool },
  roaring64_bitmap_is_subset:          { args: [ptr, ptr],                                   returns: bool },
  roaring64_bitmap_is_strict_subset:   { args: [ptr, ptr],                                   returns: bool },

  // --- flip / offset ---
  roaring64_bitmap_flip:               { args: [ptr, u64, u64],                              returns: ptr },
  roaring64_bitmap_flip_closed:        { args: [ptr, u64, u64],                              returns: ptr },
  roaring64_bitmap_flip_inplace:       { args: [ptr, u64, u64],                              returns: void_ },
  roaring64_bitmap_flip_closed_inplace: { args: [ptr, u64, u64],                             returns: void_ },
  roaring64_bitmap_add_offset_signed:  { args: [ptr, bool, u64],                             returns: ptr },

  // --- from values ---
  roaring64_bitmap_of_ptr:             { args: [usize, ptr],                                 returns: ptr },
  roaring64_bitmap_from_range:         { args: [u64, u64, u64],                              returns: ptr },

  // --- convert to array ---
  roaring64_bitmap_to_uint64_array:    { args: [ptr, ptr],                                   returns: void_ },

  // --- serialization (portable) ---
  roaring64_bitmap_portable_size_in_bytes: { args: [ptr],                                    returns: usize },
  roaring64_bitmap_portable_serialize:     { args: [ptr, ptr],                            returns: usize },
  roaring64_bitmap_portable_deserialize_safe: { args: [cstring, usize],                      returns: ptr },
  roaring64_bitmap_portable_deserialize_size: { args: [cstring, usize],                      returns: usize },

  // --- frozen serialization ---
  roaring64_bitmap_frozen_size_in_bytes: { args: [ptr],                                      returns: usize },
  roaring64_bitmap_frozen_serialize:     { args: [ptr, ptr],                              returns: usize },
  roaring64_bitmap_frozen_view:          { args: [ptr, usize],                            returns: ptr },

  // --- optimization ---
  roaring64_bitmap_run_optimize:         { args: [ptr],                                      returns: bool },
  roaring64_bitmap_remove_run_compression: { args: [ptr],                                    returns: bool },
  roaring64_bitmap_shrink_to_fit:        { args: [ptr],                                      returns: usize },

  // --- statistics ---
  roaring64_bitmap_statistics:           { args: [ptr, ptr],                                 returns: void_ },
  roaring64_bitmap_internal_validate:    { args: [ptr, ptr],                                 returns: bool },

  // --- iterator ---
  roaring64_iterator_create:             { args: [ptr],                                      returns: ptr },
  roaring64_iterator_create_last:        { args: [ptr],                                      returns: ptr },
  roaring64_iterator_free:               { args: [ptr],                                      returns: void_ },
  roaring64_iterator_copy:               { args: [ptr],                                      returns: ptr },
  roaring64_iterator_has_value:          { args: [ptr],                                      returns: bool },
  roaring64_iterator_value:              { args: [ptr],                                      returns: u64 },
  roaring64_iterator_advance:            { args: [ptr],                                      returns: bool },
  roaring64_iterator_previous:           { args: [ptr],                                      returns: bool },
  roaring64_iterator_move_equalorlarger: { args: [ptr, u64],                                 returns: bool },
  roaring64_iterator_read:               { args: [ptr, ptr, u64],                            returns: u64 },
  roaring64_iterator_read_backward:      { args: [ptr, ptr, u64],                            returns: u64 },
  roaring64_iterator_read_ranges:        { args: [ptr, ptr, usize],                          returns: usize },
  roaring64_iterator_read_prev_ranges:   { args: [ptr, ptr, usize],                          returns: usize },
  roaring64_iterator_reinit:             { args: [ptr, ptr],                                 returns: void_ },
  roaring64_iterator_reinit_last:        { args: [ptr, ptr],                                 returns: void_ },
  roaring64_bitmap_iterate:              { args: [ptr, ptr, ptr],                            returns: bool },
});

// ---- typed exports -----------------------------------------------------

/** Convenience re-export of helpers from `bun:ffi`. */
export { read, toArrayBuffer, ptr, FFIType } from "bun:ffi";

/** Dictionary of every raw FFI function. */
export const symbols = LIB.symbols;

// ---- individual symbol exports (convenience) ---------------------------
// 32-bit lifecycle
export const roaring_bitmap_create                 = symbols.roaring_bitmap_create;
export const roaring_bitmap_create_with_capacity   = symbols.roaring_bitmap_create_with_capacity;
export const roaring_bitmap_free                   = symbols.roaring_bitmap_free;
export const roaring_bitmap_copy                   = symbols.roaring_bitmap_copy;
export const roaring_bitmap_overwrite              = symbols.roaring_bitmap_overwrite;

// 32-bit add / remove / contains
export const roaring_bitmap_add                    = symbols.roaring_bitmap_add;
export const roaring_bitmap_add_checked            = symbols.roaring_bitmap_add_checked;
export const roaring_bitmap_add_many               = symbols.roaring_bitmap_add_many;
export const roaring_bitmap_add_range              = symbols.roaring_bitmap_add_range;
export const roaring_bitmap_add_range_closed       = symbols.roaring_bitmap_add_range_closed;
export const roaring_bitmap_remove                 = symbols.roaring_bitmap_remove;
export const roaring_bitmap_remove_checked         = symbols.roaring_bitmap_remove_checked;
export const roaring_bitmap_remove_many            = symbols.roaring_bitmap_remove_many;
export const roaring_bitmap_remove_range           = symbols.roaring_bitmap_remove_range;
export const roaring_bitmap_contains               = symbols.roaring_bitmap_contains;
export const roaring_bitmap_contains_range         = symbols.roaring_bitmap_contains_range;
export const roaring_bitmap_clear                  = symbols.roaring_bitmap_clear;

// 32-bit cardinality / query
export const roaring_bitmap_get_cardinality        = symbols.roaring_bitmap_get_cardinality;
export const roaring_bitmap_is_empty               = symbols.roaring_bitmap_is_empty;
export const roaring_bitmap_minimum                = symbols.roaring_bitmap_minimum;
export const roaring_bitmap_maximum                = symbols.roaring_bitmap_maximum;
export const roaring_bitmap_select                 = symbols.roaring_bitmap_select;
export const roaring_bitmap_rank                   = symbols.roaring_bitmap_rank;

// 32-bit set operations
export const roaring_bitmap_and                    = symbols.roaring_bitmap_and;
export const roaring_bitmap_or                     = symbols.roaring_bitmap_or;
export const roaring_bitmap_xor                    = symbols.roaring_bitmap_xor;
export const roaring_bitmap_andnot                 = symbols.roaring_bitmap_andnot;
export const roaring_bitmap_and_cardinality        = symbols.roaring_bitmap_and_cardinality;
export const roaring_bitmap_or_cardinality         = symbols.roaring_bitmap_or_cardinality;
export const roaring_bitmap_xor_cardinality        = symbols.roaring_bitmap_xor_cardinality;
export const roaring_bitmap_andnot_cardinality     = symbols.roaring_bitmap_andnot_cardinality;
export const roaring_bitmap_intersect              = symbols.roaring_bitmap_intersect;
export const roaring_bitmap_equals                 = symbols.roaring_bitmap_equals;
export const roaring_bitmap_is_subset              = symbols.roaring_bitmap_is_subset;

// 32-bit in-place
export const roaring_bitmap_and_inplace            = symbols.roaring_bitmap_and_inplace;
export const roaring_bitmap_or_inplace             = symbols.roaring_bitmap_or_inplace;
export const roaring_bitmap_xor_inplace            = symbols.roaring_bitmap_xor_inplace;
export const roaring_bitmap_andnot_inplace         = symbols.roaring_bitmap_andnot_inplace;

// 32-bit serialization
export const roaring_bitmap_size_in_bytes          = symbols.roaring_bitmap_size_in_bytes;
export const roaring_bitmap_serialize              = symbols.roaring_bitmap_serialize;
export const roaring_bitmap_deserialize            = symbols.roaring_bitmap_deserialize;
export const roaring_bitmap_portable_size_in_bytes = symbols.roaring_bitmap_portable_size_in_bytes;
export const roaring_bitmap_portable_serialize     = symbols.roaring_bitmap_portable_serialize;
export const roaring_bitmap_portable_deserialize   = symbols.roaring_bitmap_portable_deserialize;

// 32-bit optimization
export const roaring_bitmap_run_optimize           = symbols.roaring_bitmap_run_optimize;
export const roaring_bitmap_shrink_to_fit          = symbols.roaring_bitmap_shrink_to_fit;
export const roaring_bitmap_statistics            = symbols.roaring_bitmap_statistics;
export const roaring_bitmap_internal_validate     = symbols.roaring_bitmap_internal_validate;

// 32-bit extra (query/lazy/flip/construct/frozen)
export const roaring_bitmap_frozen_size_in_bytes  = symbols.roaring_bitmap_frozen_size_in_bytes;
export const roaring_bitmap_frozen_serialize      = symbols.roaring_bitmap_frozen_serialize;
export const roaring_bitmap_frozen_view           = symbols.roaring_bitmap_frozen_view;
export const roaring_bitmap_get_index              = symbols.roaring_bitmap_get_index;
export const roaring_bitmap_intersect_with_range   = symbols.roaring_bitmap_intersect_with_range;
export const roaring_bitmap_jaccard_index          = symbols.roaring_bitmap_jaccard_index;
export const roaring_bitmap_is_strict_subset       = symbols.roaring_bitmap_is_strict_subset;
export const roaring_bitmap_flip                   = symbols.roaring_bitmap_flip;
export const roaring_bitmap_flip_inplace           = symbols.roaring_bitmap_flip_inplace;
export const roaring_bitmap_add_offset             = symbols.roaring_bitmap_add_offset;
export const roaring_bitmap_to_uint32_array         = symbols.roaring_bitmap_to_uint32_array;
export const roaring_bitmap_range_uint32_array      = symbols.roaring_bitmap_range_uint32_array;
export const roaring_bitmap_remove_run_compression  = symbols.roaring_bitmap_remove_run_compression;
export const roaring_bitmap_of_ptr                  = symbols.roaring_bitmap_of_ptr;
export const roaring_bitmap_from_range              = symbols.roaring_bitmap_from_range;
export const roaring_bitmap_or_many                 = symbols.roaring_bitmap_or_many;
export const roaring_bitmap_portable_deserialize_safe = symbols.roaring_bitmap_portable_deserialize_safe;
export const roaring_bitmap_deserialize_safe        = symbols.roaring_bitmap_deserialize_safe;
export const roaring_bitmap_get_copy_on_write       = symbols.roaring_bitmap_get_copy_on_write;
export const roaring_bitmap_set_copy_on_write       = symbols.roaring_bitmap_set_copy_on_write;
export const roaring_contains_shared                = symbols.roaring_contains_shared;
export const roaring_unshare_all                    = symbols.roaring_unshare_all;
export const roaring_bitmap_lazy_or                 = symbols.roaring_bitmap_lazy_or;
export const roaring_bitmap_lazy_or_inplace         = symbols.roaring_bitmap_lazy_or_inplace;
export const roaring_bitmap_lazy_xor                = symbols.roaring_bitmap_lazy_xor;
export const roaring_bitmap_lazy_xor_inplace        = symbols.roaring_bitmap_lazy_xor_inplace;
export const roaring_bitmap_repair_after_lazy       = symbols.roaring_bitmap_repair_after_lazy;

// 32-bit iterator
export const roaring_iterator_create                = symbols.roaring_iterator_create;
export const roaring_iterator_init                  = symbols.roaring_iterator_init;
export const roaring_iterator_init_last             = symbols.roaring_iterator_init_last;
export const roaring_uint32_iterator_free           = symbols.roaring_uint32_iterator_free;
export const roaring_uint32_iterator_advance        = symbols.roaring_uint32_iterator_advance;
export const roaring_uint32_iterator_previous       = symbols.roaring_uint32_iterator_previous;
export const roaring_uint32_iterator_move_equalorlarger = symbols.roaring_uint32_iterator_move_equalorlarger;
export const roaring_uint32_iterator_read           = symbols.roaring_uint32_iterator_read;
export const roaring_uint32_iterator_skip           = symbols.roaring_uint32_iterator_skip;
export const roaring_uint32_iterator_copy           = symbols.roaring_uint32_iterator_copy;
export const roaring_iterate                        = symbols.roaring_iterate;

// 64-bit lifecycle
export const roaring64_bitmap_create              = symbols.roaring64_bitmap_create;
export const roaring64_bitmap_free                = symbols.roaring64_bitmap_free;
export const roaring64_bitmap_copy                = symbols.roaring64_bitmap_copy;
export const roaring64_bitmap_overwrite           = symbols.roaring64_bitmap_overwrite;

// 64-bit add / remove / contains
export const roaring64_bitmap_add                 = symbols.roaring64_bitmap_add;
export const roaring64_bitmap_add_checked         = symbols.roaring64_bitmap_add_checked;
export const roaring64_bitmap_add_many            = symbols.roaring64_bitmap_add_many;
export const roaring64_bitmap_remove              = symbols.roaring64_bitmap_remove;
export const roaring64_bitmap_remove_checked      = symbols.roaring64_bitmap_remove_checked;
export const roaring64_bitmap_remove_many         = symbols.roaring64_bitmap_remove_many;
export const roaring64_bitmap_contains            = symbols.roaring64_bitmap_contains;
export const roaring64_bitmap_contains_range      = symbols.roaring64_bitmap_contains_range;
export const roaring64_bitmap_clear               = symbols.roaring64_bitmap_clear;

// 64-bit cardinality / query
export const roaring64_bitmap_get_cardinality     = symbols.roaring64_bitmap_get_cardinality;
export const roaring64_bitmap_is_empty            = symbols.roaring64_bitmap_is_empty;
export const roaring64_bitmap_minimum             = symbols.roaring64_bitmap_minimum;
export const roaring64_bitmap_maximum             = symbols.roaring64_bitmap_maximum;
export const roaring64_bitmap_select              = symbols.roaring64_bitmap_select;
export const roaring64_bitmap_rank                = symbols.roaring64_bitmap_rank;

// 64-bit set operations
export const roaring64_bitmap_and                 = symbols.roaring64_bitmap_and;
export const roaring64_bitmap_or                  = symbols.roaring64_bitmap_or;
export const roaring64_bitmap_xor                 = symbols.roaring64_bitmap_xor;
export const roaring64_bitmap_andnot              = symbols.roaring64_bitmap_andnot;
export const roaring64_bitmap_and_cardinality     = symbols.roaring64_bitmap_and_cardinality;
export const roaring64_bitmap_or_cardinality      = symbols.roaring64_bitmap_or_cardinality;
export const roaring64_bitmap_xor_cardinality     = symbols.roaring64_bitmap_xor_cardinality;
export const roaring64_bitmap_andnot_cardinality  = symbols.roaring64_bitmap_andnot_cardinality;
export const roaring64_bitmap_intersect           = symbols.roaring64_bitmap_intersect;
export const roaring64_bitmap_equals              = symbols.roaring64_bitmap_equals;
export const roaring64_bitmap_is_subset           = symbols.roaring64_bitmap_is_subset;

// 64-bit serialization
export const roaring64_bitmap_portable_size_in_bytes  = symbols.roaring64_bitmap_portable_size_in_bytes;
export const roaring64_bitmap_portable_serialize      = symbols.roaring64_bitmap_portable_serialize;
export const roaring64_bitmap_portable_deserialize_safe = symbols.roaring64_bitmap_portable_deserialize_safe;

// 64-bit optimization
export const roaring64_bitmap_run_optimize        = symbols.roaring64_bitmap_run_optimize;
export const roaring64_bitmap_shrink_to_fit       = symbols.roaring64_bitmap_shrink_to_fit;
export const roaring64_bitmap_statistics         = symbols.roaring64_bitmap_statistics;
export const roaring64_bitmap_internal_validate  = symbols.roaring64_bitmap_internal_validate;
export const roaring64_bitmap_remove_run_compression = symbols.roaring64_bitmap_remove_run_compression;

// 64-bit extra (query/construct/flip/offset)
export const roaring64_bitmap_add_range           = symbols.roaring64_bitmap_add_range;
export const roaring64_bitmap_remove_range        = symbols.roaring64_bitmap_remove_range;
export const roaring64_bitmap_get_index           = symbols.roaring64_bitmap_get_index;
export const roaring64_bitmap_intersect_with_range = symbols.roaring64_bitmap_intersect_with_range;
export const roaring64_bitmap_jaccard_index       = symbols.roaring64_bitmap_jaccard_index;
export const roaring64_bitmap_is_strict_subset    = symbols.roaring64_bitmap_is_strict_subset;
export const roaring64_bitmap_and_inplace         = symbols.roaring64_bitmap_and_inplace;
export const roaring64_bitmap_or_inplace          = symbols.roaring64_bitmap_or_inplace;
export const roaring64_bitmap_xor_inplace         = symbols.roaring64_bitmap_xor_inplace;
export const roaring64_bitmap_andnot_inplace      = symbols.roaring64_bitmap_andnot_inplace;
export const roaring64_bitmap_flip                = symbols.roaring64_bitmap_flip;
export const roaring64_bitmap_flip_inplace        = symbols.roaring64_bitmap_flip_inplace;
export const roaring64_bitmap_add_offset_signed   = symbols.roaring64_bitmap_add_offset_signed;
export const roaring64_bitmap_to_uint64_array     = symbols.roaring64_bitmap_to_uint64_array;
export const roaring64_bitmap_of_ptr              = symbols.roaring64_bitmap_of_ptr;
export const roaring64_bitmap_from_range          = symbols.roaring64_bitmap_from_range;
export const roaring64_bitmap_move_from_roaring32 = symbols.roaring64_bitmap_move_from_roaring32;
export const roaring64_bitmap_frozen_size_in_bytes = symbols.roaring64_bitmap_frozen_size_in_bytes;
export const roaring64_bitmap_frozen_serialize     = symbols.roaring64_bitmap_frozen_serialize;
export const roaring64_bitmap_frozen_view          = symbols.roaring64_bitmap_frozen_view;

// 64-bit iterator
export const roaring64_iterator_create              = symbols.roaring64_iterator_create;
export const roaring64_iterator_create_last         = symbols.roaring64_iterator_create_last;
export const roaring64_iterator_free                = symbols.roaring64_iterator_free;
export const roaring64_iterator_has_value           = symbols.roaring64_iterator_has_value;
export const roaring64_iterator_value               = symbols.roaring64_iterator_value;
export const roaring64_iterator_advance             = symbols.roaring64_iterator_advance;
export const roaring64_iterator_previous            = symbols.roaring64_iterator_previous;
export const roaring64_iterator_move_equalorlarger  = symbols.roaring64_iterator_move_equalorlarger;
export const roaring64_iterator_read                = symbols.roaring64_iterator_read;
export const roaring64_iterator_copy                = symbols.roaring64_iterator_copy;
export const roaring64_iterator_reinit              = symbols.roaring64_iterator_reinit;
export const roaring64_iterator_reinit_last         = symbols.roaring64_iterator_reinit_last;
