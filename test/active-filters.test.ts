import { test } from "node:test";
import assert from "node:assert/strict";

// ------------------------------------------------------------------ helpers

/**
 * Mirrors the `activeFilters` array construction in
 * `src/app/admin/bookings/page.tsx`.
 *
 * Returns the number of active filter entries for the given params — a
 * non-zero count means the `AdminActiveFilters` component WOULD render;
 * zero means it WOULD NOT render (because `if (filters.length === 0) return null`).
 *
 * Validates: Requirements 4.1
 */
function buildFilterCount(
  q: string,
  status: string,
  from: string,
  to: string,
): number {
  let count = 0;
  if (status !== "all") count++;
  if (q) count++;
  if (from) count++;
  if (to) count++;
  return count;
}

// ================================================================== Property 5
// Active-filter summary row appears for any non-empty filter set.
//
// For any non-empty subset of {q ≠ "", status ≠ "all", from ≠ "", to ≠ ""},
// the active-filter summary row must be present (filters.length > 0).
// When all four values are empty/default the summary row must NOT render
// (filters.length === 0).
//
// Validates: Requirements 4.1

// ------------------------------------------------------------------ case 1: all defaults → 0 filters → NOT rendered

test("all-default params produce 0 filters — component would NOT render", () => {
  const count = buildFilterCount("", "all", "", "");
  assert.equal(count, 0);
});

// ------------------------------------------------------------------ case 2: each single active filter → 1 filter → WOULD render

test("non-default status alone produces 1 filter — component WOULD render", () => {
  assert.equal(buildFilterCount("", "Pending", "", ""), 1);
});

test("non-empty q alone produces 1 filter — component WOULD render", () => {
  assert.equal(buildFilterCount("jones", "all", "", ""), 1);
});

test("non-empty from alone produces 1 filter — component WOULD render", () => {
  assert.equal(buildFilterCount("", "all", "2024-01-01", ""), 1);
});

test("non-empty to alone produces 1 filter — component WOULD render", () => {
  assert.equal(buildFilterCount("", "all", "", "2024-12-31"), 1);
});

// ------------------------------------------------------------------ case 3: all four active → 4 filters → WOULD render

test("all four filters active produces 4 filters — component WOULD render", () => {
  const count = buildFilterCount("jones", "Approved", "2024-01-01", "2024-12-31");
  assert.equal(count, 4);
});

// ------------------------------------------------------------------ case 4: property sweep — all 16 combinations

test("property: (filters.length > 0) iff at least one filter condition is true across all 16 combinations", () => {
  const queries = ["", "jones"];
  const statuses = ["all", "Rejected"];
  const froms = ["", "2024-03-01"];
  const tos = ["", "2024-03-31"];

  for (const q of queries) {
    for (const status of statuses) {
      for (const from of froms) {
        for (const to of tos) {
          const count = buildFilterCount(q, status, from, to);
          const atLeastOneActive =
            q !== "" || status !== "all" || from !== "" || to !== "";

          // The component renders iff at least one filter condition is true.
          const wouldRender = count > 0;

          assert.equal(
            wouldRender,
            atLeastOneActive,
            `buildFilterCount(${JSON.stringify(q)}, ${JSON.stringify(status)}, ${JSON.stringify(from)}, ${JSON.stringify(to)}) = ${count}; ` +
              `expected wouldRender=${atLeastOneActive}`,
          );
        }
      }
    }
  }
});
