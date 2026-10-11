import { test } from "node:test";
import assert from "node:assert/strict";

// ------------------------------------------------------------------ helpers

/**
 * Mirrors `pageHref` in `src/app/admin/bookings/page.tsx`.
 *
 * Builds a pagination href for /admin/bookings that merges all active filter
 * params from `base` with the target page number.
 *
 * Validates: Requirements 6.2
 */
function pageHref(base: Record<string, string>, page: number): string {
  const sp = new URLSearchParams({ ...base, page: String(page) });
  return `/admin/bookings?${sp.toString()}`;
}

/**
 * Mirrors `buildBase` in `src/app/admin/bookings/page.tsx`.
 *
 * Constructs the base params object from active filter values, omitting
 * empty strings and the "all" status sentinel.
 */
function buildBase(
  q: string,
  status: string,
  from: string,
  to: string,
): Record<string, string> {
  const base: Record<string, string> = {};
  if (q) base.q = q;
  if (status !== "all") base.status = status;
  if (from) base.from = from;
  if (to) base.to = to;
  return base;
}

// ================================================================== Property 10
// Pagination hrefFor includes all active filter params.
//
// For any combination of non-empty filter params (q, status, from, to) and any
// target page number p ≥ 1, the href produced by pageHref(base, p) MUST:
//   - Include `page=p` for whatever p was requested
//   - Include `q` when the search term is non-empty
//   - Include `status` when status is not "all"
//   - Include `from` when from is non-empty
//   - Include `to` when to is non-empty
//
// Validates: Requirements 6.2

test("pageHref always includes page=p", () => {
  const href = pageHref({}, 3);
  assert.ok(href.includes("page=3"), `expected page=3 in "${href}"`);
});

test("pageHref includes q when q is non-empty", () => {
  const base = buildBase("smith", "all", "", "");
  const href = pageHref(base, 1);
  assert.ok(href.includes("q=smith"), `expected q=smith in "${href}"`);
});

test("pageHref omits q when q is empty", () => {
  const base = buildBase("", "all", "", "");
  const href = pageHref(base, 1);
  assert.ok(!href.includes("q="), `expected no q= in "${href}"`);
});

test("pageHref includes status when status is not 'all'", () => {
  const base = buildBase("", "Pending", "", "");
  const href = pageHref(base, 1);
  assert.ok(href.includes("status=Pending"), `expected status=Pending in "${href}"`);
});

test("pageHref omits status when status is 'all'", () => {
  const base = buildBase("", "all", "", "");
  const href = pageHref(base, 1);
  assert.ok(!href.includes("status="), `expected no status= in "${href}"`);
});

test("pageHref includes from when from is non-empty", () => {
  const base = buildBase("", "all", "2024-03-01", "");
  const href = pageHref(base, 1);
  assert.ok(href.includes("from=2024-03-01"), `expected from=2024-03-01 in "${href}"`);
});

test("pageHref includes to when to is non-empty", () => {
  const base = buildBase("", "all", "", "2024-03-31");
  const href = pageHref(base, 1);
  assert.ok(href.includes("to=2024-03-31"), `expected to=2024-03-31 in "${href}"`);
});

test("pageHref with empty base and page 5 produces /admin/bookings?page=5", () => {
  const href = pageHref({}, 5);
  assert.equal(href, "/admin/bookings?page=5");
});

test("pageHref page param reflects the exact page number passed", () => {
  for (const p of [1, 2, 10]) {
    const href = pageHref({}, p);
    assert.ok(
      href.includes(`page=${p}`),
      `expected page=${p} in "${href}"`,
    );
    // Also confirm only this page value appears (no stale page from base).
    const sp = new URLSearchParams(href.split("?")[1]);
    assert.equal(sp.get("page"), String(p), `page param should be "${p}"`);
  }
});

test("property: pageHref includes all non-empty base params and correct page across combinations", () => {
  const queries = ["", "jones"];
  const statuses = ["all", "Pending"];
  const froms = ["", "2024-03-01"];
  const tos = ["", "2024-03-31"];
  const pages = [1, 2, 10];

  for (const q of queries) {
    for (const status of statuses) {
      for (const from of froms) {
        for (const to of tos) {
          const base = buildBase(q, status, from, to);
          for (const p of pages) {
            const href = pageHref(base, p);

            // page=p must always be present and exact
            const sp = new URLSearchParams(href.split("?")[1]);
            assert.equal(
              sp.get("page"),
              String(p),
              `page should be "${p}" in "${href}"`,
            );

            // q present iff non-empty
            if (q) {
              assert.ok(
                href.includes(`q=${q}`),
                `expected q=${q} in "${href}"`,
              );
            } else {
              assert.ok(!href.includes("q="), `expected no q= in "${href}"`);
            }

            // status present iff not "all"
            if (status !== "all") {
              assert.ok(
                href.includes(`status=${status}`),
                `expected status=${status} in "${href}"`,
              );
            } else {
              assert.ok(
                !href.includes("status="),
                `expected no status= in "${href}"`,
              );
            }

            // from present iff non-empty
            if (from) {
              assert.ok(
                href.includes(`from=${from}`),
                `expected from=${from} in "${href}"`,
              );
            } else {
              assert.ok(
                !href.includes("from="),
                `expected no from= in "${href}"`,
              );
            }

            // to present iff non-empty
            if (to) {
              assert.ok(
                href.includes(`to=${to}`),
                `expected to=${to} in "${href}"`,
              );
            } else {
              assert.ok(
                !href.includes("to="),
                `expected no to= in "${href}"`,
              );
            }
          }
        }
      }
    }
  }
});
