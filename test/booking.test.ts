import { test } from "node:test";
import assert from "node:assert/strict";
import { recalculateTotal } from "../src/lib/booking/pricing.ts";
import { isSlotOpen, type OpenRules } from "../src/lib/booking/hours.ts";

// ------------------------------------------------------------------ fixtures

// PostgREST-shaped rows: snake_case, numeric amounts come back as strings.
const RULES = [
  { id: "r1", court_id: null, day_type: "all", time_band: "all", item_type: "court", unit: "hour", amount: "250.00" },
  { id: "r2", court_id: null, day_type: "weekend", time_band: "all", item_type: "court", unit: "hour", amount: "300.00" },
  { id: "r3", court_id: null, day_type: "all", time_band: "all", item_type: "paddle", unit: "paddle-hour", amount: "40.00" },
  { id: "r4", court_id: null, day_type: "all", time_band: "all", item_type: "ball", unit: "flat", amount: "60.00" },
];

function fakeDb(rules: unknown[]): any {
  return {
    from(table: string) {
      assert.equal(table, "pricing_rules");
      return {
        select() {
          return Promise.resolve({ data: rules, error: null });
        },
      };
    },
  };
}

// Manila: 2026-10-12 is a Monday, 2026-10-17 is a Saturday. Times are UTC+8.
const MON_9AM = new Date("2026-10-12T01:00:00.000Z"); // Mon 09:00
const SAT_9AM = new Date("2026-10-17T01:00:00.000Z"); // Sat 09:00
const MON_8PM = new Date("2026-10-12T12:00:00.000Z"); // Mon 20:00

// ------------------------------------------------------------------- pricing

test("one weekday slot uses the weekday rule", async () => {
  const { total, lines } = await recalculateTotal(fakeDb(RULES), {
    slots: [{ courtId: "c1", start: MON_9AM }],
    paddleQty: 0,
    paddleHours: null,
    ball: false,
  });
  assert.equal(total, "250.00");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, "court");
});

test("weekend slot beats the all/all court rule", async () => {
  const { total } = await recalculateTotal(fakeDb(RULES), {
    slots: [{ courtId: "c1", start: SAT_9AM }],
    paddleQty: 0,
    paddleHours: null,
    ball: false,
  });
  assert.equal(total, "300.00");
});

test("paddle hours default to the booked slot count", async () => {
  const { total, lines } = await recalculateTotal(fakeDb(RULES), {
    slots: [
      { courtId: "c1", start: MON_9AM },
      { courtId: "c1", start: new Date("2026-10-12T02:00:00.000Z") },
    ],
    paddleQty: 2,
    paddleHours: null,
    ball: false,
  });
  // 2 slots × 250 + 2 paddles × 2 h × 40
  assert.equal(total, "660.00");
  assert.equal(lines.length, 3); // 2 court lines + 1 paddle line
  assert.equal(lines[2].qty, 4);
});

test("paddle hours above the booked slot count are rejected", async () => {
  await assert.rejects(
    () =>
      recalculateTotal(fakeDb(RULES), {
        slots: [{ courtId: "c1", start: MON_9AM }],
        paddleQty: 1,
        paddleHours: 2,
        ball: false,
      }),
    /cannot exceed booked hours/,
  );
});

test("ball fee is counted once, not per slot", async () => {
  const { total } = await recalculateTotal(fakeDb(RULES), {
    slots: [
      { courtId: "c1", start: MON_9AM },
      { courtId: "c1", start: new Date("2026-10-12T02:00:00.000Z") },
      { courtId: "c1", start: new Date("2026-10-12T03:00:00.000Z") },
    ],
    paddleQty: 0,
    paddleHours: null,
    ball: true,
  });
  assert.equal(total, "810.00"); // 3 × 250 + 60
});

test("evening band falls back to the flat rule", async () => {
  const { total } = await recalculateTotal(fakeDb(RULES), {
    slots: [{ courtId: "c1", start: MON_8PM }],
    paddleQty: 0,
    paddleHours: null,
    ball: false,
  });
  assert.equal(total, "250.00");
});

test("a missing court rate is a hard error, not a zero", async () => {
  await assert.rejects(
    () =>
      recalculateTotal(fakeDb([]), {
        slots: [{ courtId: "c1", start: MON_9AM }],
        paddleQty: 0,
        paddleHours: null,
        ball: false,
      }),
    /PRICING_NOT_CONFIGURED|No court rate/,
  );
});

// ---------------------------------------------------------------------- hours

const OPEN_9_TO_21: OpenRules = {
  hours: [{ courtId: null, dayOfWeek: 1, openTime: "09:00", closeTime: "21:00" }],
  closures: [],
};

test("a slot inside weekday hours is open", () => {
  assert.equal(isSlotOpen(OPEN_9_TO_21, "c1", MON_9AM), true);
});

test("a slot before opening is closed", () => {
  assert.equal(isSlotOpen(OPEN_9_TO_21, "c1", new Date("2026-10-12T00:00:00.000Z")), false);
});

test("a slot at closing time is closed (the hour past 21:00 is not sold)", () => {
  assert.equal(
    isSlotOpen(OPEN_9_TO_21, "c1", new Date("2026-10-12T13:00:00.000Z")),
    false,
  );
});

test("a closure overlapping the slot closes it", () => {
  const rules: OpenRules = {
    hours: OPEN_9_TO_21.hours,
    closures: [
      {
        scope: "global",
        courtId: null,
        startAt: new Date("2026-10-12T00:30:00.000Z"),
        endAt: new Date("2026-10-12T02:30:00.000Z"),
      },
    ],
  };
  // 09:00–10:00 Manila overlaps 08:30–10:30 Manila.
  assert.equal(isSlotOpen(rules, "c1", MON_9AM), false);
});

test("a closure on another court does not close this one", () => {
  const rules: OpenRules = {
    hours: OPEN_9_TO_21.hours,
    closures: [
      {
        scope: "court",
        courtId: "other",
        startAt: new Date("2026-10-12T00:30:00.000Z"),
        endAt: new Date("2026-10-12T02:30:00.000Z"),
      },
    ],
  };
  assert.equal(isSlotOpen(rules, "c1", MON_9AM), true);
});

test("no hours rules at all means closed, not open (fail closed)", () => {
  const rules: OpenRules = { hours: [], closures: [] };
  assert.equal(isSlotOpen(rules, "c1", MON_9AM), false);
});

test("hours for a different day do not open this one", () => {
  const rules: OpenRules = {
    hours: [{ courtId: null, dayOfWeek: 0, openTime: "09:00", closeTime: "21:00" }],
    closures: [],
  };
  assert.equal(isSlotOpen(rules, "c1", MON_9AM), false);
});

test("overnight hours spill into the next day", () => {
  // Sunday 20:00 → Monday 02:00.
  const rules: OpenRules = {
    hours: [{ courtId: null, dayOfWeek: 0, openTime: "20:00", closeTime: "02:00" }],
    closures: [],
  };
  // Monday 01:00–02:00 falls inside Sunday's overnight window.
  assert.equal(isSlotOpen(rules, "c1", new Date("2026-10-11T17:00:00.000Z")), true);
});
