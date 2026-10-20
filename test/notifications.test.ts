import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterUnviewed,
  formatNotifDate,
  formatNotifDescription,
  formatNotifTotal,
  formatRelativeTime,
  mergeViewed,
  newArrivals,
  VIEWED_IDS_CAP,
  type NotifRow,
} from "../src/lib/admin/notifications.ts";

// ------------------------------------------------------------------ fixtures

/** A NotifRow with overridable fields; createdAt is a fixed, sortable ISO. */
function row(overrides: Partial<NotifRow> = {}): NotifRow {
  return {
    id: overrides.id ?? "b1",
    fullName: overrides.fullName ?? "Juan Dela Cruz",
    date: overrides.date ?? "2026-10-20",
    total: overrides.total ?? "1500.00",
    slotCount: overrides.slotCount ?? 2,
    createdAt: overrides.createdAt ?? "2026-10-20T08:00:00.000Z",
  };
}

// ------------------------------------------------------------------ filterUnviewed

test("filterUnviewed: returns all rows when nothing is viewed", () => {
  const rows = [row({ id: "a" }), row({ id: "b" })];
  assert.deepEqual(filterUnviewed(rows, new Set()), rows);
});

test("filterUnviewed: returns [] when every row is viewed", () => {
  const rows = [row({ id: "a" }), row({ id: "b" })];
  assert.deepEqual(filterUnviewed(rows, new Set(["a", "b"])), []);
});

test("filterUnviewed: keeps only rows whose id is not in the viewed set", () => {
  const a = row({ id: "a" });
  const b = row({ id: "b" });
  const c = row({ id: "c" });
  assert.deepEqual(filterUnviewed([a, b, c], new Set(["b"])), [a, c]);
});

test("filterUnviewed: preserves the input order (newest-first from the route)", () => {
  const rows = [
    row({ id: "new", createdAt: "2026-10-20T09:00:00.000Z" }),
    row({ id: "mid", createdAt: "2026-10-20T08:00:00.000Z" }),
    row({ id: "old", createdAt: "2026-10-20T07:00:00.000Z" }),
  ];
  assert.deepEqual(
    filterUnviewed(rows, new Set(["mid"])),
    [rows[0], rows[2]],
  );
});

test("filterUnviewed: empty rows returns []", () => {
  assert.deepEqual(filterUnviewed([], new Set(["a"])), []);
});

// ------------------------------------------------------------------ mergeViewed

test("mergeViewed: appends new ids to an empty set", () => {
  assert.deepEqual(mergeViewed([], ["a", "b"], 100), ["a", "b"]);
});

test("mergeViewed: de-duplicates ids already present", () => {
  assert.deepEqual(mergeViewed(["a", "b"], ["b", "c"], 100), ["a", "b", "c"]);
});

test("mergeViewed: additions with repeats collapse to one", () => {
  assert.deepEqual(mergeViewed([], ["a", "a", "b"], 100), ["a", "b"]);
});

test("mergeViewed: drops the oldest entries when exceeding cap (FIFO)", () => {
  // existing is full; adding one should drop the front ("a").
  assert.deepEqual(
    mergeViewed(["a", "b", "c"], ["d"], 3),
    ["b", "c", "d"],
  );
});

test("mergeViewed: never exceeds the cap", () => {
  const big = Array.from({ length: VIEWED_IDS_CAP }, (_, i) => `id${i}`);
  const out = mergeViewed(big, ["new"], VIEWED_IDS_CAP);
  assert.equal(out.length, VIEWED_IDS_CAP);
  assert.equal(out[out.length - 1], "new");
  // oldest ("id0") was dropped
  assert.equal(out[0], "id1");
});

test("mergeViewed: no additions returns the existing array unchanged", () => {
  assert.deepEqual(mergeViewed(["a", "b"], [], 100), ["a", "b"]);
});

// ------------------------------------------------------------------ newArrivals

test("newArrivals: returns [] when prevMaxMs is -Infinity (first load)", () => {
  const rows = [
    row({ createdAt: "2026-10-20T08:00:00.000Z" }),
    row({ createdAt: "2026-10-20T09:00:00.000Z" }),
  ];
  assert.deepEqual(newArrivals(rows, Number.NEGATIVE_INFINITY), []);
});

test("newArrivals: returns [] when prevMaxMs is NaN", () => {
  assert.deepEqual(newArrivals([row()], Number.NaN), []);
});

test("newArrivals: returns only rows newer than prevMaxMs, oldest-first", () => {
  const rows = [
    row({ id: "old", createdAt: "2026-10-20T07:00:00.000Z" }),
    row({ id: "new1", createdAt: "2026-10-20T09:00:00.000Z" }),
    row({ id: "new2", createdAt: "2026-10-20T08:30:00.000Z" }),
  ];
  const prevMax = Date.parse("2026-10-20T07:30:00.000Z");
  const out = newArrivals(rows, prevMax);
  assert.equal(out.length, 2);
  // oldest-first: 08:30 before 09:00
  assert.equal(out[0]!.id, "new2");
  assert.equal(out[1]!.id, "new1");
});

test("newArrivals: returns [] when nothing is newer than prevMaxMs", () => {
  const rows = [row({ createdAt: "2026-10-20T08:00:00.000Z" })];
  const prevMax = Date.parse("2026-10-20T09:00:00.000Z");
  assert.deepEqual(newArrivals(rows, prevMax), []);
});

// ------------------------------------------------------------------ formatNotifDate

test("formatNotifDate: formats a YYYY-MM-DD as 'Month D, YYYY' (UTC-pinned)", () => {
  assert.equal(formatNotifDate("2026-10-20"), "October 20, 2026");
  assert.equal(formatNotifDate("2026-01-09"), "January 9, 2026");
  assert.equal(formatNotifDate("2026-12-31"), "December 31, 2026");
});

test("formatNotifDate: returns the input unchanged when not a YYYY-MM-DD", () => {
  assert.equal(formatNotifDate("not-a-date"), "not-a-date");
  assert.equal(formatNotifDate("2026/10/20"), "2026/10/20");
  assert.equal(formatNotifDate(""), "");
});

// ------------------------------------------------------------------ formatNotifTotal

test("formatNotifTotal: integer string formats as ₱ with two decimals", () => {
  assert.equal(formatNotifTotal("1500"), "₱1,500.00");
});

test("formatNotifTotal: decimal string keeps two decimals (en-PH grouping)", () => {
  assert.equal(formatNotifTotal("1500.5"), "₱1,500.50");
  assert.equal(formatNotifTotal("1234567.89"), "₱1,234,567.89");
});

test("formatNotifTotal: zero formats as ₱0.00", () => {
  assert.equal(formatNotifTotal("0"), "₱0.00");
  assert.equal(formatNotifTotal("0.00"), "₱0.00");
});

// ------------------------------------------------------------------ formatRelativeTime

/** Anchor "now" at a fixed instant so the thresholds are deterministic. */
const NOW = Date.parse("2026-10-20T12:00:00.000Z");

test("formatRelativeTime: under 60s is 'just now'", () => {
  assert.equal(
    formatRelativeTime("2026-10-20T11:59:45.000Z", NOW),
    "just now",
  );
});

test("formatRelativeTime: future timestamp collapses to 'just now'", () => {
  assert.equal(
    formatRelativeTime("2026-10-20T12:00:30.000Z", NOW),
    "just now",
  );
});

test("formatRelativeTime: minutes bucket", () => {
  assert.equal(
    formatRelativeTime("2026-10-20T11:55:00.000Z", NOW),
    "5m ago",
  );
});

test("formatRelativeTime: hours bucket", () => {
  assert.equal(
    formatRelativeTime("2026-10-20T09:00:00.000Z", NOW),
    "3h ago",
  );
});

test("formatRelativeTime: days bucket", () => {
  assert.equal(
    formatRelativeTime("2026-10-18T12:00:00.000Z", NOW),
    "2d ago",
  );
});

test("formatRelativeTime: weeks bucket at and beyond 7d", () => {
  assert.equal(
    formatRelativeTime("2026-10-13T12:00:00.000Z", NOW),
    "1w ago",
  );
  assert.equal(
    formatRelativeTime("2026-10-06T12:00:00.000Z", NOW),
    "2w ago",
  );
});

test("formatRelativeTime: unparseable input returns empty string", () => {
  assert.equal(formatRelativeTime("not-a-date", NOW), "");
});

// ------------------------------------------------------------------ formatNotifDescription

test("formatNotifDescription: singular 'slot' when slotCount is 1", () => {
  const r = row({
    fullName: "Maria Santos",
    date: "2026-10-20",
    total: "900.00",
    slotCount: 1,
  });
  assert.equal(
    formatNotifDescription(r),
    "Maria Santos — October 20, 2026 · ₱900.00 · 1 slot",
  );
});

test("formatNotifDescription: plural 'slots' when slotCount is 2", () => {
  const r = row({
    fullName: "Maria Santos",
    date: "2026-10-20",
    total: "1500.00",
    slotCount: 2,
  });
  assert.equal(
    formatNotifDescription(r),
    "Maria Santos — October 20, 2026 · ₱1,500.00 · 2 slots",
  );
});

test("formatNotifDescription: zero slots still reads '0 slots'", () => {
  const r = row({ slotCount: 0, total: "0.00" });
  assert.equal(
    formatNotifDescription(r),
    "Juan Dela Cruz — October 20, 2026 · ₱0.00 · 0 slots",
  );
});
