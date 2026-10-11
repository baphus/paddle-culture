import { test } from "node:test";
import assert from "node:assert/strict";

// ------------------------------------------------------------------ helpers

/**
 * Mirrors `buildHref` in `src/app/admin/bookings/bookings-filter-dropdown.tsx`
 * and `src/app/admin/bookings/page.tsx`.
 *
 * Builds an absolute-path URL for /admin/bookings from an arbitrary set of
 * optional params.  Undefined / empty-string values are omitted from the
 * query string.
 */
function buildHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const str = sp.toString();
  return `/admin/bookings${str ? `?${str}` : ""}`;
}

/**
 * Mirrors the `handleApply` logic inside `BookingsFilterDropdown`:
 * navigates to a new URL with updated from/to while preserving q and status.
 *
 * Validates: Requirements 3.2
 */
function applyUrl(
  q: string,
  status: string,
  from: string,
  to: string,
): string {
  return buildHref({
    q: q || undefined,
    status: status !== "all" ? status : undefined,
    from: from || undefined,
    to: to || undefined,
  });
}

/**
 * Mirrors the `handleReset` logic inside `BookingsFilterDropdown`:
 * navigates to a new URL with from/to removed, preserving q and status.
 *
 * Validates: Requirements 3.3
 */
function resetUrl(q: string, status: string): string {
  return buildHref({
    q: q || undefined,
    status: status !== "all" ? status : undefined,
    // from and to intentionally omitted
  });
}

// ================================================================== Property 2
// Apply URL preserves search and status, resets page.
//
// WHEN the user clicks Apply with from/to values, the resulting URL MUST:
//   - Include `q` when the search term is non-empty
//   - Include `status` when status is not "all"
//   - Include the supplied `from` when non-empty
//   - Include the supplied `to` when non-empty
//   - NOT include a `page` parameter
//
// Validates: Requirements 3.2

test("Apply URL includes q when non-empty", () => {
  const url = applyUrl("smith", "all", "2024-01-01", "2024-01-31");
  assert.ok(url.includes("q=smith"), `expected q=smith in "${url}"`);
});

test("Apply URL omits q when empty", () => {
  const url = applyUrl("", "all", "2024-01-01", "2024-01-31");
  assert.ok(!url.includes("q="), `expected no q= in "${url}"`);
});

test("Apply URL includes status when not 'all'", () => {
  const url = applyUrl("", "Pending", "2024-01-01", "2024-01-31");
  assert.ok(url.includes("status=Pending"), `expected status=Pending in "${url}"`);
});

test("Apply URL omits status when 'all'", () => {
  const url = applyUrl("", "all", "2024-01-01", "2024-01-31");
  assert.ok(!url.includes("status="), `expected no status= in "${url}"`);
});

test("Apply URL includes from when non-empty", () => {
  const url = applyUrl("", "all", "2024-01-01", "");
  assert.ok(url.includes("from=2024-01-01"), `expected from=2024-01-01 in "${url}"`);
});

test("Apply URL includes to when non-empty", () => {
  const url = applyUrl("", "all", "", "2024-01-31");
  assert.ok(url.includes("to=2024-01-31"), `expected to=2024-01-31 in "${url}"`);
});

test("Apply URL does not include page param", () => {
  const url = applyUrl("smith", "Approved", "2024-01-01", "2024-01-31");
  assert.ok(!url.includes("page="), `expected no page= in "${url}"`);
});

test("property: Apply URL preserves q and status and new dates across combinations", () => {
  const queries = ["", "jones"];
  const statuses = ["all", "Rejected"];
  const froms = ["", "2024-03-01"];
  const tos = ["", "2024-03-31"];

  for (const q of queries) {
    for (const status of statuses) {
      for (const from of froms) {
        for (const to of tos) {
          const url = applyUrl(q, status, from, to);

          // q present iff non-empty
          if (q) {
            assert.ok(url.includes(`q=${q}`), `expected q=${q} in "${url}"`);
          } else {
            assert.ok(!url.includes("q="), `expected no q= in "${url}"`);
          }

          // status present iff not "all"
          if (status !== "all") {
            assert.ok(
              url.includes(`status=${status}`),
              `expected status=${status} in "${url}"`,
            );
          } else {
            assert.ok(!url.includes("status="), `expected no status= in "${url}"`);
          }

          // from present iff non-empty
          if (from) {
            assert.ok(url.includes(`from=${from}`), `expected from=${from} in "${url}"`);
          } else {
            assert.ok(!url.includes("from="), `expected no from= in "${url}"`);
          }

          // to present iff non-empty
          if (to) {
            assert.ok(url.includes(`to=${to}`), `expected to=${to} in "${url}"`);
          } else {
            assert.ok(!url.includes("to="), `expected no to= in "${url}"`);
          }

          // page must never appear
          assert.ok(!url.includes("page="), `expected no page= in "${url}"`);
        }
      }
    }
  }
});

// ================================================================== Property 3
// Reset URL preserves search and status, removes dates.
//
// WHEN the user clicks Reset inside the filter panel, the resulting URL MUST:
//   - NOT contain `from=` under any circumstances
//   - NOT contain `to=` under any circumstances
//   - Contain `q` when the search term is non-empty
//   - Contain `status` when status is not "all"
//   - NOT contain `status` when status is "all"
//
// Validates: Requirements 3.3

test("Reset URL never contains from=", () => {
  // even when current URL had a from value, reset must strip it
  const url = resetUrl("", "all");
  assert.ok(!url.includes("from="), `expected no from= in "${url}"`);
});

test("Reset URL never contains to=", () => {
  const url = resetUrl("", "all");
  assert.ok(!url.includes("to="), `expected no to= in "${url}"`);
});

test("Reset URL contains q when non-empty", () => {
  const url = resetUrl("smith", "all");
  assert.ok(url.includes("q=smith"), `expected q=smith in "${url}"`);
});

test("Reset URL omits q when empty", () => {
  const url = resetUrl("", "all");
  assert.ok(!url.includes("q="), `expected no q= in "${url}"`);
});

test("Reset URL contains status when not 'all'", () => {
  const url = resetUrl("", "Rejected");
  assert.ok(url.includes("status=Rejected"), `expected status=Rejected in "${url}"`);
});

test("Reset URL omits status when 'all'", () => {
  const url = resetUrl("", "all");
  assert.ok(!url.includes("status="), `expected no status= in "${url}"`);
});

test("property: Reset URL strips from and to in all combinations of q and status", () => {
  const queries = ["", "jones"];
  const statuses = ["all", "Rejected"];

  for (const q of queries) {
    for (const status of statuses) {
      const url = resetUrl(q, status);

      // from and to must NEVER appear
      assert.ok(
        !url.includes("from="),
        `expected no from= in "${url}" (q=${JSON.stringify(q)}, status=${JSON.stringify(status)})`,
      );
      assert.ok(
        !url.includes("to="),
        `expected no to= in "${url}" (q=${JSON.stringify(q)}, status=${JSON.stringify(status)})`,
      );

      // q preserved when non-empty
      if (q) {
        assert.ok(
          url.includes(`q=${q}`),
          `expected q=${q} in "${url}"`,
        );
      } else {
        assert.ok(!url.includes("q="), `expected no q= in "${url}"`);
      }

      // status preserved when not "all"
      if (status !== "all") {
        assert.ok(
          url.includes(`status=${status}`),
          `expected status=${status} in "${url}"`,
        );
      } else {
        assert.ok(!url.includes("status="), `expected no status= in "${url}"`);
      }
    }
  }
});
