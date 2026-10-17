import { test } from "node:test";
import assert from "node:assert/strict";
import { isOnSlotGrid, manilaWallClock, slotsForDate } from "../src/lib/booking/slots.ts";

// Regression: the slot grid is Manila wall clock. Building it with
// `new TZDate("<date>T06:00:00", "Asia/Manila")` parses the string in the
// process timezone, so a UTC server (Vercel) shifted the whole grid +8h.
// TZ=UTC is precisely the failing environment; Node re-reads TZ at runtime.

const savedTZ = process.env.TZ;

test("grid base is 06:00 Manila wall clock even when the process is UTC", () => {
  process.env.TZ = "UTC";
  try {
    const slots = slotsForDate("2026-10-19");
    assert.equal(slots.length, 21);
    assert.equal(slots[0]!.start.toISOString(), "2026-10-19T06:00:00.000+08:00");
    assert.equal(slots[0]!.start.getTime(), Date.UTC(2026, 9, 18, 22));
    // 20h later: 02:00 Manila on the 20th (the grid spills past midnight).
    assert.equal(slots[20]!.start.getTime(), Date.UTC(2026, 9, 19, 18));
    assert.equal(isOnSlotGrid(slots[0]!.start), true);

    // The same instants no matter the host timezone — that is the regression.
    process.env.TZ = "America/New_York";
    assert.deepEqual(slotsForDate("2026-10-19").map((s) => s.start.getTime()), slots.map((s) => s.start.getTime()));
    process.env.TZ = "Asia/Manila";
    assert.deepEqual(slotsForDate("2026-10-19").map((s) => s.start.getTime()), slots.map((s) => s.start.getTime()));
  } finally {
    process.env.TZ = savedTZ;
  }
});

test("manilaWallClock builds the requested wall time", () => {
  const z = manilaWallClock("2026-10-19", 6, 30);
  assert.equal(z.toISOString(), "2026-10-19T06:30:00.000+08:00");
  assert.equal(z.getHours(), 6);
  assert.equal(z.getMinutes(), 30);
  assert.equal(manilaWallClock("2026-10-19").getHours(), 0);
});
