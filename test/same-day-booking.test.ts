import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDaysManilaStr,
  manilaEarliestBookableStr,
  manilaTodayStr,
} from "../src/lib/courts.ts";
import { isBookableSlot, maxBookableDateStr, slotsForDate } from "../src/lib/booking/slots.ts";

// Regression: same-day booking. The calendar's floor used to be *tomorrow*
// (today was walk-in only), which disabled the whole current day even though
// POST /api/holds and /api/submit have always accepted any future on-grid
// slot. The floor must stay at today; only past *hours* are shut out.

test("earliest bookable date is today in Manila, not tomorrow", () => {
  // 09:00 Manila = 01:00Z — still the same Manila day.
  const now = new Date("2026-03-10T01:00:00Z");
  assert.equal(manilaTodayStr(now), "2026-03-10");
  assert.equal(manilaEarliestBookableStr(now), "2026-03-10");
  assert.notEqual(manilaEarliestBookableStr(now), addDaysManilaStr("2026-03-10", 1));
});

test("earliest bookable date follows the Manila day across the UTC boundary", () => {
  // 23:30 Manila on Mar 10 is 15:30Z — same Manila day…
  assert.equal(manilaEarliestBookableStr(new Date("2026-03-10T15:30:00Z")), "2026-03-10");
  // …while 00:30 Manila on Mar 11 (16:30Z Mar 10) has already rolled over.
  assert.equal(manilaEarliestBookableStr(new Date("2026-03-10T16:30:00Z")), "2026-03-11");
});

test("today's grid offers the current hour and later hours", () => {
  const now = new Date("2026-03-10T09:00:00Z"); // 5 PM Manila
  const bookable = slotsForDate("2026-03-10").filter((s) => isBookableSlot(s.start, now));
  assert.ok(bookable.length > 0, "expected bookable slots later today");
  // The 5 PM hour itself is bookable even though it has just begun.
  assert.ok(bookable.some((s) => s.start.getTime() === now.getTime()));
  // A slot survives while its hour is running; nothing fully elapsed leaks through.
  for (const s of bookable) assert.ok(s.start.getTime() + 3_600_000 > now.getTime());
  // And the hours that already ended are excluded.
  const ended = slotsForDate("2026-03-10").filter((s) => !isBookableSlot(s.start, now));
  assert.ok(ended.length > 0, "expected some of today's hours to have ended");
  for (const s of ended) assert.ok(s.start.getTime() + 3_600_000 <= now.getTime());
});

test("the current hour stays bookable mid-hour, then closes when it ends", () => {
  const start = new Date("2026-03-10T06:00:00Z"); // 2 PM Manila
  assert.equal(isBookableSlot(start, new Date("2026-03-10T06:30:00Z")), true); // 2:30 PM
  assert.equal(isBookableSlot(start, new Date("2026-03-10T06:59:59Z")), true); // 2:59:59 PM
  assert.equal(isBookableSlot(start, new Date("2026-03-10T07:00:00Z")), false); // 3 PM
});

test("same-day stays inside the 12-month horizon", () => {
  const now = new Date("2026-03-10T01:00:00Z");
  assert.equal(manilaEarliestBookableStr(now) <= maxBookableDateStr(now), true);
});
