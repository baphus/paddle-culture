import { test } from "node:test";
import assert from "node:assert/strict";

// ------------------------------------------------------------------ helpers

/**
 * Replicated from src/components/admin/admin-pagination.tsx (unexported).
 *
 * Validates: Requirements 6.4
 */
type PageEntry = number | "gap";

function buildPageList(current: number, total: number): PageEntry[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const always = new Set([1, 2, total - 1, total]);
  const window = new Set(
    [current - 2, current - 1, current, current + 1, current + 2].filter(
      (p) => p >= 1 && p <= total,
    ),
  );
  const visible = Array.from(new Set([...always, ...window])).sort(
    (a, b) => a - b,
  );

  const result: PageEntry[] = [];
  let prev = 0;
  for (const p of visible) {
    if (p - prev > 1) result.push("gap");
    result.push(p);
    prev = p;
  }
  return result;
}

/** Extract only numeric entries from a page list. */
function nums(list: PageEntry[]): number[] {
  return list.filter((e): e is number => typeof e === "number");
}

// ------------------------------------------------------------------ Property 11
// buildPageList always includes boundary and window pages.
//
// For any current page c and total pages n where n > 7:
//   - All of {1, 2, n-1, n} appear in the numeric entries
//   - All pages in [max(1, c-2), min(n, c+2)] appear
//   - Gaps are inserted between non-consecutive numeric entries
//
// Validates: Requirements 6.4

// 1. total <= 7: returns exactly [1, 2, ..., total] with no gaps

test("total=1 returns [1]", () => {
  assert.deepEqual(buildPageList(1, 1), [1]);
});

test("total=7 returns [1,2,3,4,5,6,7] with no gaps", () => {
  const result = buildPageList(4, 7);
  assert.deepEqual(result, [1, 2, 3, 4, 5, 6, 7]);
});

test("total<=7 never contains a gap sentinel", () => {
  for (let n = 1; n <= 7; n++) {
    const result = buildPageList(Math.ceil(n / 2), n);
    assert.ok(
      !result.includes("gap"),
      `total=${n}: expected no gap, got ${JSON.stringify(result)}`,
    );
  }
});

test("total<=7 returns exactly pages 1..total in order", () => {
  for (let n = 1; n <= 7; n++) {
    const expected = Array.from({ length: n }, (_, i) => i + 1);
    assert.deepEqual(buildPageList(1, n), expected);
  }
});

// 2. n > 7: always includes 1, 2, n-1, n

test("n=8, c=1: boundary pages 1,2,7,8 are present", () => {
  const pages = nums(buildPageList(1, 8));
  assert.ok(pages.includes(1), "missing 1");
  assert.ok(pages.includes(2), "missing 2");
  assert.ok(pages.includes(7), "missing n-1");
  assert.ok(pages.includes(8), "missing n");
});

test("n=15, c=8: boundary pages 1,2,14,15 are present", () => {
  const pages = nums(buildPageList(8, 15));
  assert.ok(pages.includes(1), "missing 1");
  assert.ok(pages.includes(2), "missing 2");
  assert.ok(pages.includes(14), "missing n-1");
  assert.ok(pages.includes(15), "missing n");
});

// 3. n > 7: always includes window pages [max(1, c-2), min(n, c+2)]

test("n=20, c=10: window pages 8..12 are all present", () => {
  const pages = nums(buildPageList(10, 20));
  for (let p = 8; p <= 12; p++) {
    assert.ok(pages.includes(p), `missing window page ${p}`);
  }
});

test("n=10, c=1: window clamped to [1,3], pages 1..3 are present", () => {
  const pages = nums(buildPageList(1, 10));
  for (let p = 1; p <= 3; p++) {
    assert.ok(pages.includes(p), `missing window page ${p}`);
  }
});

test("n=10, c=10: window clamped to [8,10], pages 8..10 are present", () => {
  const pages = nums(buildPageList(10, 10));
  for (let p = 8; p <= 10; p++) {
    assert.ok(pages.includes(p), `missing window page ${p}`);
  }
});

// 4. Gaps appear between non-consecutive numeric entries

test("n=20, c=1: gap appears before the last-2 boundary cluster", () => {
  const result = buildPageList(1, 20);
  // Numeric entries: 1,2,3 then gap then 19,20 — verify gap placement
  const gapIdx = result.indexOf("gap");
  assert.ok(gapIdx !== -1, "expected at least one gap");
  // The entry before a gap must be a number, and the entry after must be a number
  assert.ok(typeof result[gapIdx - 1] === "number", "gap not preceded by a number");
  assert.ok(typeof result[gapIdx + 1] === "number", "gap not followed by a number");
});

test("n=20, c=10: gaps appear on both sides of the window", () => {
  const result = buildPageList(10, 20);
  const gapCount = result.filter((e) => e === "gap").length;
  assert.ok(gapCount >= 2, `expected >=2 gaps for c=10,n=20, got ${gapCount}`);
});

test("no two consecutive numeric entries differ by more than 1 without a gap between them", () => {
  // Spot-check several (c, n) combinations
  const cases: [number, number][] = [
    [1, 8],
    [4, 8],
    [8, 8],
    [5, 15],
    [1, 20],
    [20, 20],
  ];
  for (const [c, n] of cases) {
    const result = buildPageList(c, n);
    for (let i = 0; i < result.length - 1; i++) {
      const a = result[i];
      const b = result[i + 1];
      if (typeof a === "number" && typeof b === "number") {
        assert.ok(
          b - a === 1,
          `(c=${c},n=${n}): consecutive numbers ${a} and ${b} differ by ${b - a} — missing gap`,
        );
      }
    }
  }
});

// 5. Property sweep: for n ∈ [8, 10, 15, 20] and c ∈ [1, 2, 5, n/2, n-1, n]

test("property sweep: boundary + window + gap invariants hold for all (c,n) combinations", () => {
  const totals = [8, 10, 15, 20];

  for (const n of totals) {
    const currents = Array.from(
      new Set([1, 2, 5, Math.floor(n / 2), n - 1, n].filter((c) => c >= 1 && c <= n)),
    );

    for (const c of currents) {
      const result = buildPageList(c, n);
      const pages = nums(result);

      // Boundary pages must be present
      for (const boundary of [1, 2, n - 1, n]) {
        assert.ok(
          pages.includes(boundary),
          `(c=${c},n=${n}): missing boundary page ${boundary}`,
        );
      }

      // Window pages must be present
      const wLo = Math.max(1, c - 2);
      const wHi = Math.min(n, c + 2);
      for (let p = wLo; p <= wHi; p++) {
        assert.ok(
          pages.includes(p),
          `(c=${c},n=${n}): missing window page ${p}`,
        );
      }

      // No two adjacent numeric entries may be non-consecutive
      for (let i = 0; i < result.length - 1; i++) {
        const a = result[i];
        const b = result[i + 1];
        if (typeof a === "number" && typeof b === "number") {
          assert.equal(
            b - a,
            1,
            `(c=${c},n=${n}): consecutive numbers ${a} and ${b} without gap`,
          );
        }
      }

      // Gaps must not be adjacent to other gaps
      for (let i = 0; i < result.length - 1; i++) {
        assert.ok(
          !(result[i] === "gap" && result[i + 1] === "gap"),
          `(c=${c},n=${n}): two consecutive gaps at index ${i}`,
        );
      }
    }
  }
});
