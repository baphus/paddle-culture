import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCourtSlotGroup,
  formatSlotRanges,
  formatSlotRangesWithDates,
  slotDateShort,
} from "../src/lib/courts.ts";

// Manila is UTC+8. A 2026-10-21 business-day grid runs from
// 2026-10-20T23:00Z (7:00 AM Oct 21) to 2026-10-21T22:00Z (6:00 AM Oct 22).

// 9:00 PM – 11:00 PM on Oct 21, then the overnight tail on Oct 22.
const EVENING = ["2026-10-21T13:00:00Z", "2026-10-21T14:00:00Z"];
const TAIL = ["2026-10-21T16:00:00Z", "2026-10-21T17:00:00Z"];

test("slotDateShort shows the slot's own Manila calendar date", () => {
  // 2026-10-21T16:00:00Z = 12:00 AM Oct 22 Manila.
  assert.equal(slotDateShort("2026-10-21T16:00:00Z"), "Oct 22, 2026");
  assert.equal(slotDateShort("2026-10-21T13:00:00Z"), "Oct 21, 2026");
});

test("formatSlotRangesWithDates: same-day booking renders like formatSlotRanges", () => {
  assert.equal(
    formatSlotRangesWithDates(EVENING),
    formatSlotRanges(EVENING),
  );
});

test("formatSlotRangesWithDates: overnight tail gets an explicit next-day date", () => {
  assert.equal(
    formatSlotRangesWithDates([...EVENING, ...TAIL].reverse()),
    "9:00 – 11:00 PM, Oct 22, 2026 · 12:00 – 2:00 AM",
  );
});

test("formatSlotRangesWithDates: all-tail booking prefixes every run", () => {
  // Only slots on the next calendar day — each run still shows its exact date.
  assert.equal(
    formatSlotRangesWithDates(TAIL),
    "Oct 22, 2026 · 12:00 – 2:00 AM",
  );
});

test("formatSlotRangesWithDates: date-split runs never merge across midnight", () => {
  // 11 PM Oct 21 → 1 AM Oct 22 is contiguous hour-wise but two dates.
  assert.equal(
    formatSlotRangesWithDates(["2026-10-21T15:00:00Z", "2026-10-21T16:00:00Z"]),
    "11:00 PM – 12:00 AM, Oct 22, 2026 · 12:00 – 1:00 AM",
  );
});

test("formatCourtSlotGroup: admin label splits and dates the overnight portion", () => {
  assert.equal(
    formatCourtSlotGroup("Court 1", ["2026-10-21T15:00:00Z", "2026-10-21T16:00:00Z"]),
    "11:00 PM – 12:00, Oct 22, 2026 · 12:00 – 1:00 AM (Court 1)",
  );
});
