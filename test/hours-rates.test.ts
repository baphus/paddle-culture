import { test } from "node:test";
import assert from "node:assert/strict";
import { recalculateTotal } from "../src/lib/booking/pricing.ts";
import { slotsForDate } from "../src/lib/booking/slots.ts";
import { isSlotOpen, type OpenRules } from "../src/lib/booking/hours.ts";
import { createHours, hoursCreateSchema } from "../src/lib/admin/config.ts";

// ADR-13: the operating_hours row owns the rate. No pricing_windows.
//
// 2026-10-12 is a Monday. slot index 0 = Monday 06:00, 6 = Mon 12:00,
// 12 = Mon 18:00, 18 = Tuesday 00:00.
const MON = slotsForDate("2026-10-12");
const at = (hourIndex: number) => MON[hourIndex]!.start;

// PostgREST-shaped operating_hours rows (snake_case, numeric → string).
function hourRow(
  id: string,
  courtId: string,
  day: number,
  open: string,
  close: string,
  amount: string | null,
) {
  return {
    id,
    court_id: courtId,
    day_of_week: day,
    open_time: open,
    close_time: close,
    amount,
  };
}

function fakeDb(hours: unknown[], rules: unknown[] = []): any {
  return {
    from(table: string) {
      assert.ok(table === "pricing_rules" || table === "operating_hours");
      const rows = table === "pricing_rules" ? rules : hours;
      return {
        select() {
          const result = Promise.resolve({ data: rows, error: null });
          const builder = {
            order: () => builder,
            then: result.then.bind(result),
            catch: result.catch.bind(result),
            finally: result.finally.bind(result),
          };
          return builder;
        },
      };
    },
  };
}

async function price(hours: unknown[], start: Date, rules: unknown[] = []) {
  return recalculateTotal(fakeDb(hours, rules), {
    slots: [{ courtId: "c1", start }],
    paddleQty: 0,
    paddleHours: null,
    ball: false,
  });
}

// ---------------------------------------------------------------- engine

test("the hours row covering the slot prices it; another court's row does not", async () => {
  const hours = [
    hourRow("c2h", "c2", 1, "06:00", "12:00", "120.00"),
    hourRow("c1h", "c1", 1, "06:00", "12:00", "90.00"),
  ];
  const six = await price(hours, at(0));
  assert.equal(six.total, "90.00");
  assert.match((six.lines[0] as { detail: string }).detail, /6:00 AM–12:00 PM @/);
});

test("touching rows split the rate; the boundary hour belongs to the later row", async () => {
  const hours = [
    hourRow("am", "c1", 1, "06:00", "12:00", "100.00"),
    hourRow("pm", "c1", 1, "12:00", "22:00", "150.00"),
  ];
  assert.equal((await price(hours, at(0))).total, "100.00");
  assert.equal((await price(hours, at(6))).total, "150.00");
});

test("a wrapping row prices its post-midnight hours (hour + 24)", async () => {
  // Tuesday 18:00 → 03:00. Index 18 is Tuesday 00:00 Manila.
  const hours = [hourRow("late", "c1", 2, "18:00", "03:00", "200.00")];
  const midnight = await price(hours, at(18));
  assert.equal(midnight.total, "200.00");
  assert.match((midnight.lines[0] as { detail: string }).detail, /6:00 PM–3:00 AM @/);
  assert.equal((await price(hours, at(19))).total, "200.00"); // Tue 01:00
});

test("a day with no hours row is closed: 503 PRICING_NOT_CONFIGURED", async () => {
  const hours = [hourRow("tue", "c1", 2, "06:00", "22:00", "100.00")];
  await assert.rejects(
    () => price(hours, at(0)), // Monday, no Monday row
    /No court rate for court c1 \(06:00\) — court is not open at this day\/time\./,
  );
});

test("no hours rows at all is a 503, not a zero", async () => {
  await assert.rejects(
    () => price([], at(0)),
    /PRICING_NOT_CONFIGURED|No court rate/,
  );
});

test("a NULL amount is a 503 naming the day and range", async () => {
  const hours = [hourRow("legacy", "c1", 1, "06:00", "12:00", null)];
  await assert.rejects(
    () => price(hours, at(0)),
    /No court rate configured yet for Mon 6:00 AM–12:00 PM\./,
  );
});

test("paddle still uses the band chain alongside the hours rate", async () => {
  const rules = [
    { id: "p1", court_id: null, day_type: "all", time_band: "all", item_type: "paddle", unit: "hour", amount: "25.00" },
  ];
  const hours = [hourRow("h", "c1", 1, "06:00", "03:00", "100.00")];
  const { total } = await recalculateTotal(fakeDb(hours, rules), {
    slots: [{ courtId: "c1", start: at(0) }],
    paddleQty: 1,
    paddleHours: 1,
    ball: false,
  });
  assert.equal(total, "125.00");
});

// ------------------------------------------------------------- availability

const MON_9AM = new Date("2026-10-12T01:00:00.000Z"); // Mon 09:00 Manila

function rules(hours: OpenRules["hours"]): OpenRules {
  return { hours, closures: [] };
}

test("no hours rows for the court on that day means closed (ADR-13)", () => {
  assert.equal(isSlotOpen(rules([]), "c1", MON_9AM), false);
});

test("hours on another court do not open this one (no global fallback)", () => {
  const other = rules([
    { courtId: "c2", dayOfWeek: 1, openTime: "06:00", closeTime: "22:00" },
  ]);
  assert.equal(isSlotOpen(other, "c1", MON_9AM), false);
});

test("the court's own row opens the slot", () => {
  const own = rules([
    { courtId: "c1", dayOfWeek: 1, openTime: "06:00", closeTime: "22:00" },
  ]);
  assert.equal(isSlotOpen(own, "c1", MON_9AM), true);
});

test("a wrapping row spills into the next day", () => {
  const overnight = rules([
    { courtId: "c1", dayOfWeek: 0, openTime: "20:00", closeTime: "02:00" },
  ]);
  // Monday 01:00–02:00 Manila falls inside Sunday's overnight row.
  assert.equal(isSlotOpen(overnight, "c1", new Date("2026-10-11T17:00:00.000Z")), true);
});

// ------------------------------------------------------------------ admin

test("hoursCreateSchema requires a court and an amount", () => {
  const base = {
    courtId: "11111111-1111-4111-8111-111111111111",
    dayOfWeek: 1,
    openTime: "06:00",
    closeTime: "12:00",
    amount: "150",
  };
  assert.equal(hoursCreateSchema.safeParse(base).success, true);
  assert.equal(hoursCreateSchema.safeParse({ ...base, courtId: null }).success, false);
  assert.equal(hoursCreateSchema.safeParse({ ...base, amount: undefined }).success, false);
  assert.equal(hoursCreateSchema.safeParse({ ...base, amount: "0" }).success, false);
  assert.equal(hoursCreateSchema.safeParse({ ...base, openTime: "12:00" }).success, false);
  assert.equal(hoursCreateSchema.safeParse({ ...base, openTime: "12:00", closeTime: "12:00" }).success, false);
});

// Minimal fake DB for createHours' pre-insert overlap report.
function configDb(siblings: Array<{ day_of_week: number; open_time: string; close_time: string }>): any {
  return {
    from(table: string) {
      if (table === "courts") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: "c1" }, error: null }) }),
          }),
        };
      }
      assert.equal(table, "operating_hours");
      return {
        select() {
          return {
            eq() {
              return {
                eq: () => Promise.resolve({ data: siblings, error: null }),
              };
            },
          };
        },
      };
    },
  };
}

test("overlap report names the conflicting day and range", async () => {
  const db = configDb([{ day_of_week: 1, open_time: "06:00:00", close_time: "13:00:00" }]);
  await assert.rejects(
    () =>
      createHours(db, { email: "owner@example.com" } as any, {
        courtId: "11111111-1111-4111-8111-111111111111",
        dayOfWeek: 1,
        openTime: "12:00",
        closeTime: "22:00",
        amount: "150",
      }),
    /This overlaps Mon 6:00–13:00 — pick a different time\./,
  );
});

test("touching rows are not reported as an overlap", async () => {
  const db = configDb([{ day_of_week: 1, open_time: "06:00:00", close_time: "12:00:00" }]);
  // The conflict scan finds nothing, so the flow proceeds to the insert; the
  // fake has no insert path, so any error other than HOURS_OVERLAP is fine.
  await assert.rejects(
    () =>
      createHours(db, { email: "owner@example.com" } as any, {
        courtId: "11111111-1111-4111-8111-111111111111",
        dayOfWeek: 1,
        openTime: "12:00",
        closeTime: "22:00",
        amount: "150",
      }),
    (e: any) => e.code !== "HOURS_OVERLAP",
  );
});
