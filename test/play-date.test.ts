import { test } from "node:test";
import assert from "node:assert/strict";
import { slotSelectionDateStr, slotsForDate } from "../src/lib/booking/slots.ts";
import { formatManilaLong } from "../src/lib/courts.ts";

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

test("play date is Oct 19 for a booking whose first slot is 18T22:00Z", () => {
  for (const tz of ["UTC", "Asia/Manila", "America/New_York"]) {
    withTZ(tz, () => {
      const day = slotSelectionDateStr(REPORTED_SLOTS);
      assert.equal(day, "2026-10-19", tz);
      assert.equal(formatManilaLong(day!), "Mon, Oct 19, 2026", tz);
    });
  }
});

test("the old UTC slice is what produced the wrong day", () => {
  const sorted = [...REPORTED_SLOTS].sort();
  // Documents the defect, so nobody "simplifies" the helper back to a slice.
  assert.notEqual(sorted[0]!.slice(0, 10), "2026-10-19");
  assert.equal(sorted[0]!.slice(0, 10), "2026-10-18");
});

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

test("an overnight tail (00:00–02:00 wall clock) belongs to the picked day", () => {
  // Oct 19's grid runs past midnight: its last three slots are on the Oct 20
  // wall clock but still the Oct 19 selection day, so admin and the customer
  // must not disagree about the date.
  const tail = ["2026-10-19T16:00:00.000Z", "2026-10-19T17:00:00.000Z"];
  assert.equal(new Date(tail[0]!).toISOString().slice(0, 10), "2026-10-19");
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
  assert.equal(slotSelectionDateStr([...REPORTED_SLOTS].reverse()), "2026-10-19");
  assert.equal(slotSelectionDateStr([new Date("2026-10-18T22:00:00.000Z")]), "2026-10-19");
});

test("slotSelectionDateStr returns null with no usable slots", () => {
  assert.equal(slotSelectionDateStr([]), null);
  assert.equal(slotSelectionDateStr(["not-a-date"]), null);
});
