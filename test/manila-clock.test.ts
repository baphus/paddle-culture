import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOnSlotGrid,
  manilaWallClock,
  selectionDateStr,
  slotsForDate,
} from "../src/lib/booking/slots.ts";

// Regression: the slot grid is Manila wall clock. Building it with
// `new TZDate("<date>T06:00:00", "Asia/Manila")` parses the string in the
// process timezone, so a UTC server (Vercel) shifted the whole grid +8h.
// TZ=UTC is precisely the failing environment; Node re-reads TZ at runtime.

const savedTZ = process.env.TZ;

/** Run `fn` with the process in a given zone, restoring it afterwards. */
function withTZ<T>(tz: string, fn: () => T): T {
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = savedTZ;
  }
}

/**
 * Dates that stress every boundary: the date from the production OFF_GRID
 * report, both sides of a month end, and both sides of a year end.
 */
const DATES = ["2026-10-19", "2026-10-21", "2026-10-31", "2026-12-31", "2027-01-01"];

test("grid base is 06:00 Manila wall clock even when the process is UTC", () => {
  withTZ("UTC", () => {
    const slots = slotsForDate("2026-10-19");
    assert.equal(slots.length, 21);
    // Plain-Date ISO is always UTC; TZDate would print "+08:00" here and leak
    // into PostgREST filters and JSON bodies.
    assert.equal(slots[0]!.start.toISOString(), "2026-10-18T22:00:00.000Z");
    assert.equal(slots[0]!.start.getTime(), Date.UTC(2026, 9, 18, 22));
    // 20h later: 02:00 Manila on the 20th (the grid spills past midnight).
    assert.equal(slots[20]!.start.getTime(), Date.UTC(2026, 9, 19, 18));
    assert.equal(isOnSlotGrid(slots[0]!.start), true);

    // The same instants no matter the host timezone — that is the regression.
    process.env.TZ = "America/New_York";
    assert.deepEqual(
      slotsForDate("2026-10-19").map((s) => s.start.getTime()),
      slots.map((s) => s.start.getTime()),
    );
    process.env.TZ = "Asia/Manila";
    assert.deepEqual(
      slotsForDate("2026-10-19").map((s) => s.start.getTime()),
      slots.map((s) => s.start.getTime()),
    );
  });
});

test("every generated slot survives the ISO round-trip under any host TZ", () => {
  // The production bug: on a UTC server selectionDateStr used setDate, which
  // @date-fns/tz does not override, so it walked back two Manila days and the
  // overnight fallback in isOnSlotGrid rejected 00:00/01:00/02:00 of every date.
  for (const tz of ["UTC", "Asia/Manila", "America/New_York", "Pacific/Kiritimati"]) {
    withTZ(tz, () => {
      for (const date of DATES) {
        for (const slot of slotsForDate(date)) {
          const wire = slot.start.toISOString();
          assert.ok(wire.endsWith("Z"), `${tz} ${date} idx ${slot.index}: not UTC (${wire})`);
          assert.equal(
            isOnSlotGrid(new Date(wire)),
            true,
            `${tz} ${date} idx ${slot.index} (${wire}) is not on the grid`,
          );
        }
      }
    });
  }
});

test("selectionDateStr maps 00:00-02:00 to the previous selection date", () => {
  withTZ("UTC", () => {
    const slots = slotsForDate("2026-10-21");
    // The whole grid is the Oct 21 selection day, including its 00:00-02:00
    // tail which happens on the Oct 22 wall clock.
    for (const slot of slots) {
      assert.equal(selectionDateStr(slot.start), "2026-10-21", `idx ${slot.index}`);
    }
    // Wall clock says Oct 22 for the tail, which is why the plain Manila date
    // alone is not enough — the fallback in isOnSlotGrid needs the day before.
    assert.equal(new Date(slots[18]!.start.getTime()).toISOString(), "2026-10-21T16:00:00.000Z");
    // The whole grid of a date belongs to that date's selection day.
    for (const date of DATES) {
      for (const slot of slotsForDate(date)) {
        assert.equal(
          selectionDateStr(new Date(slot.start.getTime())),
          date,
          `${date} idx ${slot.index}`,
        );
      }
    }
  });
});

test("isOnSlotGrid rejects off-grid instants", () => {
  withTZ("UTC", () => {
    // 05:00 Manila sits before the 06:00 day start and after the previous
    // day's 02:00 tail, so it is off-grid despite being a whole hour.
    assert.equal(isOnSlotGrid(new Date("2026-10-20T21:00:00.000Z")), false);
    // 03:00 Manila is past the last slot's start.
    assert.equal(isOnSlotGrid(new Date("2026-10-21T19:00:00.000Z")), false);
    // Any minute offset is off-grid.
    assert.equal(isOnSlotGrid(new Date("2026-10-21T10:30:00.000Z")), false);
  });
});

test("manilaWallClock builds the requested wall time", () => {
  withTZ("UTC", () => {
    const z = manilaWallClock("2026-10-19", 6, 30);
    assert.equal(new Date(z.getTime()).toISOString(), "2026-10-18T22:30:00.000Z");
    assert.equal(z.getHours(), 6);
    assert.equal(z.getMinutes(), 30);
    assert.equal(manilaWallClock("2026-10-19").getHours(), 0);
  });
});
