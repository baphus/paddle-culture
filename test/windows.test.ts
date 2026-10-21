import { test } from "node:test";
import assert from "node:assert/strict";
import { hourInWindow, windowOverlaps } from "../src/lib/booking/windows.ts";

// The grid is 24 hourly starts on a Manila calendar day; operating_hours rows
// decide which are open. Equal open/close means a full 24-hour day.
test("equal endpoints cover every hour", () => {
  const allDay = { start: 6, end: 6 };
  for (let h = 0; h < 24; h++) {
    assert.equal(hourInWindow(h, allDay), true, `hour ${h}`);
  }
  assert.equal(windowOverlaps(allDay, { start: 0, end: 1 }), true);
  assert.equal(windowOverlaps({ start: 6, end: 12 }, allDay), true);
});

test("wrapped window covers the overnight hours only", () => {
  const evening = { start: 18, end: 3 };
  assert.equal(hourInWindow(23, evening), true);
  assert.equal(hourInWindow(2, evening), true);
  assert.equal(hourInWindow(12, evening), false);
});

test("touching windows do not overlap", () => {
  assert.equal(windowOverlaps({ start: 6, end: 12 }, { start: 12, end: 18 }), false);
  assert.equal(windowOverlaps({ start: 6, end: 12 }, { start: 11, end: 18 }), true);
});
