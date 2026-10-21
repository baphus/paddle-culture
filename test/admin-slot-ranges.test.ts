import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatBookingDate,
  formatBookingDateRange,
  formatSlotRanges,
} from "../src/lib/admin/bookings.ts";

// Manila is UTC+8, so 05:00Z = 1:00PM the same day.

test("formatSlotRanges: empty input yields no ranges", () => {
  assert.deepEqual(formatSlotRanges([]), []);
});

test("formatSlotRanges: consecutive hours collapse into one range", () => {
  assert.deepEqual(
    formatSlotRanges([
      "2026-10-19T05:00:00Z",
      "2026-10-19T06:00:00Z",
      "2026-10-19T07:00:00Z",
      "2026-10-19T08:00:00Z",
    ]),
    ["1:00PM–5:00PM"],
  );
});

test("formatSlotRanges: a gap splits into separate ranges", () => {
  assert.deepEqual(
    formatSlotRanges(["2026-10-19T05:00:00Z", "2026-10-19T09:00:00Z"]),
    ["1:00PM–2:00PM", "5:00PM–6:00PM"],
  );
});

test("formatSlotRanges: duplicate starts (two courts, same hour) appear once", () => {
  assert.deepEqual(
    formatSlotRanges(["2026-10-19T05:00:00Z", "2026-10-19T05:00:00Z"]),
    ["1:00PM–2:00PM"],
  );
});

test("formatSlotRanges: unsorted input is sorted", () => {
  assert.deepEqual(
    formatSlotRanges(["2026-10-19T06:00:00Z", "2026-10-19T05:00:00Z"]),
    ["1:00PM–3:00PM"],
  );
});

test("formatSlotRanges: midnight Manila renders as 12:00AM", () => {
  assert.deepEqual(formatSlotRanges(["2026-10-19T16:00:00Z"]), [
    "12:00AM–1:00AM",
  ]);
});

test("formatBookingDate: ISO date renders human-readable", () => {
  assert.equal(formatBookingDate("2026-10-19"), "October 19, 2026");
});

test("formatBookingDate: non-ISO input (e.g. the em-dash placeholder) passes through", () => {
  assert.equal(formatBookingDate("—"), "—");
});

test("formatBookingDateRange includes later Manila slot date", () => {
  assert.equal(
    formatBookingDateRange("2026-10-28", ["2026-10-28T16:00:00Z", "2026-10-28T17:00:00Z"]),
    "October 28, 2026 – October 29, 2026",
  );
  assert.equal(
    formatBookingDateRange("2026-10-28", ["2026-10-28T07:00:00Z"]),
    "October 28, 2026",
  );
});
