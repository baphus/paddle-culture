import { test } from "node:test";
import assert from "node:assert/strict";
import {
  datesInMonth,
  groupByDate,
  type CourtAvailability,
} from "../src/lib/booking/availability.ts";
import { slotsForDate } from "../src/lib/booking/slots.ts";

// ------------------------------------------------------------------ fixtures

const COURT_A = "11111111-1111-4111-8111-111111111111";
const COURT_B = "22222222-2222-4222-8222-222222222222";

/** Free availability for the named courts across a whole month. */
function availabilityFor(month: string, courtIds: string[]): CourtAvailability[] {
  const instants = datesInMonth(month).flatMap((d) => slotsForDate(d));
  return courtIds.map((courtId) => ({
    courtId,
    slots: instants.map(({ index, start }) => ({
      index,
      start: start.toISOString(),
      state: "free" as const,
      bookable: true,
    })),
  }));
}

// --------------------------------------------------------------------- dates

test("datesInMonth: February 2026 has 28 days", () => {
  assert.equal(datesInMonth("2026-02").length, 28);
});

test("datesInMonth: February 2028 (leap year) has 29 days", () => {
  assert.equal(datesInMonth("2028-02").length, 29);
});

test("datesInMonth: 31-day month ends on -31", () => {
  const days = datesInMonth("2026-10");
  assert.equal(days.length, 31);
  assert.equal(days[0], "2026-10-01");
  assert.equal(days[30], "2026-10-31");
});

test("datesInMonth: December rolls correctly (no month 00)", () => {
  const days = datesInMonth("2026-12");
  assert.equal(days.length, 31);
  assert.ok(days.every((d) => d.startsWith("2026-12-")));
});

// ------------------------------------------------------------------ grouping

test("groupByDate: every date gets exactly the 21-slot grid", () => {
  const month = "2026-10";
  const days = groupByDate(month, [COURT_A], availabilityFor(month, [COURT_A]));
  assert.equal(Object.keys(days).length, 31);
  for (const date of datesInMonth(month)) {
    assert.equal(days[date]![COURT_A]!.length, 21, `${date} should have 21 slots`);
  }
});

test("groupByDate: each court gets its own bucket", () => {
  const month = "2026-10";
  const days = groupByDate(
    month,
    [COURT_A, COURT_B],
    availabilityFor(month, [COURT_A, COURT_B]),
  );
  // 21 per court, never 42 pooled together.
  assert.equal(days["2026-10-15"]![COURT_A]!.length, 21);
  assert.equal(days["2026-10-15"]![COURT_B]!.length, 21);
});

test("groupByDate: no slot is dropped or double-counted across the month", () => {
  const month = "2026-10";
  const days = groupByDate(month, [COURT_A], availabilityFor(month, [COURT_A]));
  const all = Object.values(days).flatMap((d) => d[COURT_A]!.map((s) => s.start));
  assert.equal(all.length, 31 * 21);
  assert.equal(new Set(all).size, 31 * 21, "no instant appears on two days");
});

test("groupByDate: overnight slots stay on their selection date", () => {
  const month = "2026-10";
  const days = groupByDate(month, [COURT_A], availabilityFor(month, [COURT_A]));
  // The 2026-10-15 grid runs 06:00 on the 15th through 02:00 on the 16th.
  // The 02:00 instant is wall-clock on the 16th but belongs to the 15th's grid.
  const forFifteenth = days["2026-10-15"]![COURT_A]!;
  const last = forFifteenth[forFifteenth.length - 1]!;
  const manilaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(last.start));
  assert.equal(manilaDate, "2026-10-16", "last slot is 02:00 on the 16th");
  // …and it is NOT in the 16th's bucket.
  const startsOnSixteenth = new Set(days["2026-10-16"]![COURT_A]!.map((s) => s.start));
  assert.equal(startsOnSixteenth.has(last.start), false);
});

test("groupByDate: a court with no rows still gets empty buckets", () => {
  const month = "2026-10";
  const days = groupByDate(month, [COURT_A, COURT_B], availabilityFor(month, [COURT_A]));
  assert.deepEqual(days["2026-10-01"]![COURT_B], []);
});
