import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dayDiff,
  fmtDay,
  groupRuns,
  manilaDay,
  relativeDay,
  toDateStr,
  wholeDayRange,
} from "../src/lib/admin/hours-format.ts";

// ------------------------------------------------------------------ manilaDay

test("manilaDay: shifts a late-UTC instant to the next Manila date", () => {
  // 2026-10-23T16:30Z is 2026-10-24 00:30 in Manila (UTC+8).
  assert.equal(manilaDay("2026-10-23T16:30:00.000Z"), "2026-10-24");
});

test("manilaDay: keeps the same date mid-day", () => {
  assert.equal(manilaDay("2026-10-24T04:00:00.000Z"), "2026-10-24");
});

// ------------------------------------------------------------------ dayDiff

test("dayDiff: counts whole days between Manila dates", () => {
  assert.equal(dayDiff("2026-10-24", "2026-10-21"), 3);
  assert.equal(dayDiff("2026-10-21", "2026-10-24"), -3);
  assert.equal(dayDiff("2026-10-24", "2026-10-24"), 0);
});

// ------------------------------------------------------------------ relativeDay

test("relativeDay: labels today, tomorrow, future and past", () => {
  const today = "2026-10-24";
  assert.equal(relativeDay("2026-10-24", today), "Today");
  assert.equal(relativeDay("2026-10-25", today), "Tomorrow");
  assert.equal(relativeDay("2026-10-23", today), "Yesterday");
  assert.equal(relativeDay("2026-10-29", today), "in 5 days");
  assert.equal(relativeDay("2026-10-20", today), "4 days ago");
});

// ------------------------------------------------------------------ fmtDay

test("fmtDay: formats a Manila date with weekday", () => {
  const label = fmtDay("2026-10-24"); // a Saturday
  assert.ok(label.startsWith("Sat"), `expected Sat prefix, got ${label}`);
  assert.ok(label.includes("Oct 24"), `expected Oct 24, got ${label}`);
});

// ------------------------------------------------------------------ wholeDayRange

test("wholeDayRange: one day is Manila midnight to next midnight", () => {
  const { startAt, endAt } = wholeDayRange("2026-10-24", "2026-10-24");
  assert.equal(startAt, "2026-10-23T16:00:00.000Z"); // 2026-10-24 00:00 +08:00
  assert.equal(endAt, "2026-10-24T16:00:00.000Z"); // 2026-10-25 00:00 +08:00
});

test("wholeDayRange: multi-day range ends after the last day", () => {
  const { startAt, endAt } = wholeDayRange("2026-10-24", "2026-10-26");
  assert.equal(startAt, "2026-10-23T16:00:00.000Z");
  assert.equal(endAt, "2026-10-26T16:00:00.000Z"); // 2026-10-27 00:00 +08:00
});

// ------------------------------------------------------------------ toDateStr

test("toDateStr: reads back the picked calendar day", () => {
  assert.equal(toDateStr(new Date(2026, 9, 24)), "2026-10-24");
  assert.equal(toDateStr(new Date(2026, 0, 5)), "2026-01-05");
});

// ------------------------------------------------------------------ groupRuns

test("groupRuns: consecutive picked dates collapse into one run", () => {
  assert.deepEqual(groupRuns(["2026-10-24", "2026-10-25", "2026-10-26"]), [
    { from: "2026-10-24", to: "2026-10-26" },
  ]);
});

test("groupRuns: non-consecutive dates stay separate, sorted, de-duped", () => {
  assert.deepEqual(
    groupRuns(["2026-12-31", "2026-12-24", "2026-12-25", "2026-12-24"]),
    [
      { from: "2026-12-24", to: "2026-12-25" },
      { from: "2026-12-31", to: "2026-12-31" },
    ],
  );
});

test("groupRuns: empty selection yields no closures", () => {
  assert.deepEqual(groupRuns([]), []);
});
