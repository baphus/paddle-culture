import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Structural guard for the class of bug behind the "booked Oct 19, tracking
// says Oct 18" report.
//
// The defect was not one bad expression: a slot instant is the only truth
// stored, so every surface re-derived a calendar date, and one of them did it
// with `iso.slice(0, 10)` on a UTC string. That is a *civil date* read off an
// *instant*, and it is silently wrong for every instant whose UTC day differs
// from its Manila day (06:00 Manila = 22:00Z the day before). It type-checks,
// passes review, and only breaks for part of the traffic — so it needs a test
// that fails on re-introduction, not a reviewer who remembers.
//
// Sanctioned ways to get a date from an instant:
//   - manilaDateStr / selectionDateStr / slotSelectionDateStr (booking/slots.ts)
//   - Intl.DateTimeFormat with timeZone: "Asia/Manila"
//   - an explicit `+08:00` offset shift (hours-format.ts manilaDay)
// and the Play Date itself now comes from `bookings.play_date`, not deduction.

const SRC = join(import.meta.dirname, "..", "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Files allowed to slice a date string, with the reason. */
const ALLOWED: Record<string, string> = {
  // manilaDay() shifts by the fixed +08:00 offset *first*, so the slice is
  // already a Manila date. Correct today, but it is the only place that earns
  // the exemption.
  "lib/admin/hours-format.ts":
    "shifts by MANILA_OFFSET_MS before slicing, so the value is already Manila",
};

/** A slice of the first ten characters of something string-like. */
const DATE_SLICE = /\.slice\(\s*0\s*,\s*10\s*\)/;

/** Lines whose ten-char prefix is already a civil date, not an instant. */
const SAFE: RegExp[] = [
  // Documentation: comments describing the bug must not trip the guard.
  /^\s*(\/\/|\*|\/\*)/,
  // A date picked in a <input type="date"> / "datetime-local" is a zone-less
  // wall-clock string like "2026-10-19T14:30"; there is no instant to convert.
  // These values are always read from local form state, hence the names.
  /\bc(Start|End)\s*\.slice\(/,
  // An explicit "YYYY-MM-DD" string (never an instant) being trimmed/extended.
  /\b(dateStr|playDate|fromStr|toStr|from|to|monthKey|viewKey|todayStr|localeDate)\s*\.slice\(/,
  // A URL search param, e.g. first(sp.from).slice(0, 10): a query string can
  // only carry a civil date, there is no instant to misinterpret.
  /\bfirst\(\s*sp\.\w+\s*\)\s*\.slice\(/,
];

test("no ISO instant is sliced into a calendar date", () => {
  const offences: string[] = [];

  for (const file of walk(SRC)) {
    const rel = relative(SRC, file).replaceAll("\\", "/");
    if (ALLOWED[rel]) continue;

    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!DATE_SLICE.test(line)) return;
      if (SAFE.some((re) => re.test(line))) return;
      offences.push(`${rel}:${i + 1}  ${line.trim()}`);
    });
  }

  assert.deepEqual(
    offences,
    [],
    "An instant is being sliced into a calendar date. An ISO \"YYYY-MM-DDTHH:MM\" " +
      "string is the UTC day, which is the day before in Manila for any time " +
      "before 08:00Z — that is exactly the tracking-page Play Date bug. Use " +
      "manilaDateStr()/selectionDateStr() from @/lib/booking/slots, read " +
      "bookings.play_date, or format through Intl with timeZone Asia/Manila.",
  );
});

test("the guard actually detects the pattern it forbids", () => {
  // A guard test that cannot fail is worse than none: pin the matcher itself.
  assert.ok(DATE_SLICE.test("const d = firstSlot.slice(0, 10);"));
  assert.ok(DATE_SLICE.test("formatManilaLong(firstSlot.slice( 0 , 10 ))"));
  // ...and that it does not fire on the innocent forms.
  assert.ok(!DATE_SLICE.test("const d = obj.slice(0, 11);"));
  assert.ok(!DATE_SLICE.test("dateStr.slice(0, 7)"));
});
