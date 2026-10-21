import { test } from "node:test";
import assert from "node:assert/strict";
import { slotSelectionDateStr, slotsForDate } from "../src/lib/booking/slots.ts";
import { formatSummaryDateRange, formatManilaLong } from "../src/lib/courts.ts";

// Regression for the production report: a customer booked Sun Oct 19, 2026
// (6:00–2:00 PM, 3:00–6:00 PM, 10:00–11:00 PM) and the admin showed Oct 19
// while their tracking page showed Oct 18. Cause: the tracking page rendered
// BookingInvoice without `dateStr`, and its fallback was
// `firstSlot.slice(0, 10)` — a slice of the *UTC* ISO string. The 06:00 slot
// of Oct 19 is 2026-10-18T22:00:00Z, so the slice produced Oct 18. Every
// booking starting before 08:00Z (4:00 PM Manila) had the same off-by-one.

const savedTZ = process.env.TZ;

function withTZ<T>(tz: string, fn: () => T): T {
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = savedTZ;
  }
}

/** The reported booking's hours, as the DB stores them (Manila Oct 19). */
const REPORTED_SLOTS = [
  "2026-10-19T10:00:00.000Z", // 6:00 PM
  "2026-10-19T11:00:00.000Z", // 7:00 PM
  "2026-10-19T12:00:00.000Z", // 8:00 PM
  "2026-10-19T13:00:00.000Z", // 9:00 PM
  "2026-10-18T22:00:00.000Z", // 6:00 AM
];

test("6:00 AM slots are the previous business day's tail; all-later slots stay Oct 19", () => {
  for (const tz of ["UTC", "Asia/Manila", "America/New_York"]) {
    withTZ(tz, () => {
      // The earliest slot is 6:00 AM Manila Oct 19 — under the 7:00 AM anchor
      // that is the overnight tail of Oct 18's business day.
      const day = slotSelectionDateStr(REPORTED_SLOTS);
      assert.equal(day, "2026-10-18", tz);
      assert.equal(formatManilaLong(day!), "Sun, Oct 18, 2026", tz);
    });
  }
});

// The historic regression behind this file: the tracking page sliced the UTC
// ISO string, so slots starting before 08:00Z (4:00 PM Manila) showed one day
// early. selectionDateStr must derive the day from Manila wall clock.
const WITHOUT_TAIL = REPORTED_SLOTS.filter((s) => new Date(s).getTime() >= Date.UTC(2026, 9, 19));

test("an all-evening booking is unaffected (first slot after 08:00Z)", () => {
  // This is why only some bookings showed the wrong date.
  const evening = ["2026-10-19T10:00:00.000Z", "2026-10-19T11:00:00.000Z"];
  assert.equal(evening[0]!.slice(0, 10), "2026-10-19");
  assert.equal(slotSelectionDateStr(evening), "2026-10-19");
});

test("every slot of a date yields that date as the play date", () => {
  for (const date of ["2026-10-19", "2026-10-31", "2026-12-31", "2027-01-01"]) {
    for (const slot of slotsForDate(date)) {
      assert.equal(
        slotSelectionDateStr([slot.start.toISOString()]),
        date,
        `${date} idx ${slot.index}`,
      );
    }
  }
});

test("early morning slots belong to the previous business day", () => {
  // 00:00 and 01:00 Manila on Oct 20 are the overnight tail of Oct 19's
  // business day — a booking made for Oct 19 that runs past midnight keeps
  // Oct 19 as its Play Date.
  const tail = ["2026-10-19T16:00:00.000Z", "2026-10-19T17:00:00.000Z"];
  assert.equal(slotSelectionDateStr(tail), "2026-10-19");
  assert.equal(formatManilaLong(slotSelectionDateStr(tail)!), "Mon, Oct 19, 2026");
});

test("a Sunday play date renders with the right weekday", () => {
  // Oct 18, 2026 is a Sunday; Oct 19 is a Monday. Guards against the helper
  // ever drifting a day in the other direction too.
  assert.equal(formatManilaLong("2026-10-18"), "Sun, Oct 18, 2026");
  const sundaySlots = slotsForDate("2026-10-18").map((s) => s.start.toISOString());
  assert.equal(slotSelectionDateStr(sundaySlots), "2026-10-18");
  assert.equal(formatManilaLong(slotSelectionDateStr(sundaySlots)!), "Sun, Oct 18, 2026");
});

test("slotSelectionDateStr handles unsorted and Date input", () => {
  assert.equal(slotSelectionDateStr([...WITHOUT_TAIL].reverse()), "2026-10-19");
  assert.equal(slotSelectionDateStr([new Date("2026-10-18T22:00:00.000Z")]), "2026-10-18");
});

test("slotSelectionDateStr returns null with no usable slots", () => {
  assert.equal(slotSelectionDateStr([]), null);
  assert.equal(slotSelectionDateStr(["not-a-date"]), null);
});

test("formatSummaryDateRange shows both dates when a selection crosses midnight", () => {
  assert.equal(formatSummaryDateRange(null, []), "—");
  assert.equal(formatSummaryDateRange("2026-10-28", []), "Wed, Oct 28, 2026");
  // 3 PM Oct 28 + 12–3 AM Manila Oct 29 slots, picker date Oct 28.
  const overnight = [
    "2026-10-28T07:00:00.000Z",
    "2026-10-28T16:00:00.000Z",
    "2026-10-28T17:00:00.000Z",
    "2026-10-28T18:00:00.000Z",
    "2026-10-28T19:00:00.000Z",
  ];
  assert.equal(
    formatSummaryDateRange("2026-10-28", overnight),
    "Wed, Oct 28, 2026 – Thu, Oct 29, 2026",
  );
  // Overnight-only selection still names both the picker date and the slot date.
  assert.equal(
    formatSummaryDateRange("2026-10-28", overnight.slice(1)),
    "Wed, Oct 28, 2026 – Thu, Oct 29, 2026",
  );
});
