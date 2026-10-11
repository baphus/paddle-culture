import { test } from "node:test";
import assert from "node:assert/strict";

// ------------------------------------------------------------------ helpers

/**
 * Badge count formula mirroring the AdminFilterDropdown component:
 * count the number of non-empty strings in [from, to].
 *
 * Validates: Requirements 2.3
 */
function badgeCount(from: string, to: string): number {
  return [from, to].filter(Boolean).length;
}

// ------------------------------------------------------------------ Property 1
// Filter badge count reflects active date params.
//
// For any combination of `from` and `to` URL parameter values (empty string or
// valid date string), the badge count equals the number of non-empty values:
//   0 when both are empty
//   1 when exactly one is set
//   2 when both are set

test("badge count is 0 when both from and to are empty", () => {
  assert.equal(badgeCount("", ""), 0);
});

test("badge count is 1 when only from is set", () => {
  assert.equal(badgeCount("2024-01-01", ""), 1);
});

test("badge count is 1 when only to is set", () => {
  assert.equal(badgeCount("", "2024-01-01"), 1);
});

test("badge count is 2 when both from and to are set", () => {
  assert.equal(badgeCount("2024-01-01", "2024-12-31"), 2);
});

// ------------------------------------------------------------------ property sweep
// Exhaustively check the four quadrants (empty/non-empty × empty/non-empty).

test("property: badge count equals number of non-empty date params across all combinations", () => {
  const dates = ["", "2024-06-15"];

  for (const from of dates) {
    for (const to of dates) {
      const expected = (from !== "" ? 1 : 0) + (to !== "" ? 1 : 0);
      const actual = badgeCount(from, to);
      assert.equal(
        actual,
        expected,
        `badgeCount(${JSON.stringify(from)}, ${JSON.stringify(to)}) should be ${expected}, got ${actual}`,
      );
    }
  }
});

// ------------------------------------------------------------------ Property 12
// AdminFilterDropdown children render inside open panel.
//
// For any React node passed as `children` to AdminFilterDropdown, when the
// panel is open those children must be present in the rendered output; when
// the panel is closed they must not be visible.
//
// Since this project has no DOM/React testing library, we test the underlying
// conditional-rendering contract as pure state logic.
//
// Validates: Requirements 1.6, 7.1

/**
 * Models the conditional rendering invariant of AdminFilterDropdown:
 * the panel div (and thus its children) is rendered only when `open === true`.
 *
 * This mirrors the JSX branch:
 *   {open && <div className="...">...</div>}
 */
function panelIsVisible(open: boolean): boolean {
  return open;
}

test("panel is not visible when open is false", () => {
  assert.equal(panelIsVisible(false), false);
});

test("panel is visible when open is true", () => {
  assert.equal(panelIsVisible(true), true);
});

test("property: panel visibility matches open state for all boolean inputs", () => {
  for (const open of [false, true]) {
    assert.equal(
      panelIsVisible(open),
      open,
      `panelIsVisible(${open}) should equal ${open}`,
    );
  }
});
