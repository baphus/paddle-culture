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

test("grid base is 7:00 AM Manila wall clock even when the process is UTC", () => {
  withTZ("UTC", () => {
    const slots = slotsForDate("2026-10-19");
    assert.equal(slots.length, 24);
    // Plain-Date ISO is always UTC; TZDate would print "+08:00" here and leak
    // into PostgREST filters and JSON bodies.
    // 7:00 AM Manila on Oct 19 = 23:00Z on Oct 18.
    assert.equal(slots[0]!.start.toISOString(), "2026-10-18T23:00:00.000Z");
    assert.equal(slots[0]!.start.getTime(), Date.UTC(2026, 9, 18, 23));
    // The final start is 6:00 AM Manila on the NEXT calendar date — the
    // overnight tail that belongs to the selected day.
    assert.equal(slots[23]!.start.getTime(), Date.UTC(2026, 9, 19, 22));
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

test("selectionDateStr maps every slot of a date to that business day", () => {
  withTZ("UTC", () => {
    const slots = slotsForDate("2026-10-21");
    // The whole Oct 21 grid — 7:00 AM Oct 21 through 6:00 AM on the Oct 22
    // wall clock — belongs to the Oct 21 business day.
    for (const slot of slots) {
      assert.equal(selectionDateStr(slot.start), "2026-10-21", `idx ${slot.index}`);
    }
    assert.equal(new Date(slots[0]!.start.getTime()).toISOString(), "2026-10-20T23:00:00.000Z");
    // The whole grid of a date belongs to that business day.
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

test("isOnSlotGrid accepts every whole Manila hour", () => {
  withTZ("UTC", () => {
    assert.equal(isOnSlotGrid(new Date("2026-10-20T21:00:00.000Z")), true); // 05:00
    assert.equal(isOnSlotGrid(new Date("2026-10-21T19:00:00.000Z")), true); // 03:00
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
