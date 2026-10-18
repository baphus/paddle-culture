import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDaysManilaStr,
  manilaEarliestBookableStr,
  manilaTodayStr,
} from "../src/lib/courts.ts";
import { isFutureSlot, maxBookableDateStr, slotsForDate } from "../src/lib/booking/slots.ts";

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

test("today's grid still offers later hours for same-day booking", () => {
  const now = new Date("2026-03-10T09:00:00Z"); // 5 PM Manila
  const future = slotsForDate("2026-03-10").filter((s) => isFutureSlot(s.start, now));
  assert.ok(future.length > 0, "expected bookable slots later today");
  // Every surviving slot is in the future; nothing past leaks through.
  for (const s of future) assert.ok(s.start.getTime() > now.getTime());
  // And the spent hours of today are excluded.
  const past = slotsForDate("2026-03-10").filter((s) => !isFutureSlot(s.start, now));
  assert.ok(past.length > 0, "expected some of today's hours to have passed");
});

test("same-day stays inside the 12-month horizon", () => {
  const now = new Date("2026-03-10T01:00:00Z");
  assert.equal(manilaEarliestBookableStr(now) <= maxBookableDateStr(now), true);
});
