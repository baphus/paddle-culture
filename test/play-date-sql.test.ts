import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { slotSelectionDateStr } from "../src/lib/booking/slots.ts";

// `bookings.play_date` is written by SQL (rpc_submit_booking and
// rpc_admin_create_booking), while the TS fallback path uses
// slotSelectionDateStr(). Two implementations of one rule means they can drift,
// and a drift shows up as admin and the tracking page disagreeing about the
// day — the very symptom of the original report. These tests re-implement the
// SQL rule exactly as written in the migration/RPC and assert it against the
// TS helper over every slot of several dates.

const root = join(import.meta.dirname, "..");

/** The current RPC expression: the Manila business day — the calendar date,
 *  minus one when the slot starts before 07:00 Manila (overnight tail). Manila
 *  is a fixed UTC+8 with no DST. */
function sqlPlayDate(earliestSlotIso: string): string {
  const MANILA_MS = 8 * 3_600_000;
  const local = new Date(new Date(earliestSlotIso).getTime() + MANILA_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  if (local.getUTCHours() >= 7) return date;
  const prev = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 86_400_000);
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
}

const CASES: Array<{ date: string; first: string }> = [
  // 07:00 anchor: the first slot of a grid day starts 7:00 AM Manila.
  { date: "2026-10-19", first: "2026-10-18T23:00:00.000Z" },
  { date: "2026-10-21", first: "2026-10-20T23:00:00.000Z" },
  { date: "2026-12-31", first: "2026-12-30T23:00:00.000Z" },
  { date: "2027-01-01", first: "2026-12-31T23:00:00.000Z" },
];

test("the SQL play_date expression agrees with slotSelectionDateStr", () => {
  for (const { date, first } of CASES) {
    assert.equal(sqlPlayDate(first), date, `SQL rule for ${date}`);
    assert.equal(slotSelectionDateStr([first]), date, `TS helper for ${date}`);
    assert.equal(
      sqlPlayDate(first),
      slotSelectionDateStr([first]),
      `${date}: SQL and TS disagree — admin and tracking would show different days`,
    );
  }
});

test("both implementations use the slot's Manila business day", () => {
  // 00:00 and 02:00 Manila on the 20th are the overnight tail of Oct 19's
  // business day — that is the point of the 07:00 anchor.
  for (const tail of ["2026-10-19T16:00:00.000Z", "2026-10-19T18:00:00.000Z"]) {
    assert.equal(sqlPlayDate(tail), "2026-10-19", tail);
    assert.equal(slotSelectionDateStr([tail]), "2026-10-19", tail);
  }
  assert.equal(sqlPlayDate("2026-10-19T21:00:00.000Z"), "2026-10-19");
});

test("the migration and both RPCs actually write play_date", () => {
  // Guards against the column being added but never populated: a NULL/NULLed
  // play_date silently pushes every reader onto the derived fallback.
  const migration = readFileSync(join(root, "drizzle", "0004_play_date.sql"), "utf8");
  assert.match(migration, /ADD COLUMN "play_date" date/);
  assert.match(migration, /AT TIME ZONE 'Asia\/Manila'/);
  assert.match(migration, /INTERVAL '1 day'/);
  assert.match(migration, /SET NOT NULL/);

  const rpc = readFileSync(join(root, "supabase", "rpc-functions.sql"), "utf8");
  const inserts = rpc.match(/INSERT INTO bookings \([^)]*\)/g) ?? [];
  assert.equal(inserts.length, 2, "expected exactly two booking insert paths");
  for (const insert of inserts) {
    assert.match(insert, /play_date/, `booking insert without play_date: ${insert}`);
  }
});
