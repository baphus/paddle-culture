import { test } from "node:test";
import assert from "node:assert/strict";
import {
  googleCalendarUrl,
  googleCalendarUrlForRange,
} from "../src/lib/booking/calendar.ts";

// Google Calendar wants UTC basic-format stamps: 20261018T220000Z.
function datesOf(url: string): string {
  const parsed = new URL(url);
  return parsed.searchParams.get("dates") ?? "";
}

// ------------------------------------------------------------------ range

test("googleCalendarUrlForRange: converts a Manila slot to UTC stamps", () => {
  // 19:00–21:00 Asia/Manila (UTC+8) is 11:00–13:00 UTC the same day.
  const url = googleCalendarUrlForRange({
    title: "CK Grounds — Court A",
    startIso: "2026-10-06T19:00:00+08:00",
    endIso: "2026-10-06T21:00:00+08:00",
    details: "Booking ref: #ABC12345",
    location: "RVF9+6XW, Poblacion, Tabuelan, Cebu, Philippines",
  });

  assert.ok(url.startsWith("https://calendar.google.com/calendar/render?"));
  assert.equal(datesOf(url), "20261006T110000Z/20261006T130000Z");
});

test("googleCalendarUrlForRange: keeps a range that crosses midnight", () => {
  // 23:00 on Oct 6 → 01:00 on Oct 7 Manila = 15:00 Oct 6 → 17:00 Oct 6 UTC.
  const url = googleCalendarUrlForRange({
    title: "CK Grounds — Court B",
    startIso: "2026-10-06T23:00:00+08:00",
    endIso: "2026-10-07T01:00:00+08:00",
  });
  assert.equal(datesOf(url), "20261006T150000Z/20261006T170000Z");
});

test("googleCalendarUrlForRange: honours the caller's end, not a fixed hour", () => {
  const url = googleCalendarUrlForRange({
    title: "CK Grounds — Court A",
    startIso: "2026-10-06T07:00:00+08:00",
    endIso: "2026-10-06T10:00:00+08:00",
  });
  assert.equal(datesOf(url), "20261005T230000Z/20261006T020000Z");
});

test("googleCalendarUrlForRange: omits details/location when not supplied", () => {
  const url = googleCalendarUrlForRange({
    title: "CK Grounds — Court A",
    startIso: "2026-10-06T07:00:00+08:00",
    endIso: "2026-10-06T08:00:00+08:00",
  });
  const params = new URL(url).searchParams;
  assert.equal(params.get("details"), null);
  assert.equal(params.get("location"), null);
  assert.equal(params.get("action"), "TEMPLATE");
});

test("googleCalendarUrlForRange: escapes details into the query string", () => {
  const url = googleCalendarUrlForRange({
    title: "CK Grounds — Court A",
    startIso: "2026-10-06T07:00:00+08:00",
    endIso: "2026-10-06T08:00:00+08:00",
    details: "Booking ref: #ABC12345\nView: https://ckgrounds.vercel.app/track/xyz?b=2",
  });
  // Newlines and the nested URL must survive a round-trip, not break the link.
  assert.equal(
    new URL(url).searchParams.get("details"),
    "Booking ref: #ABC12345\nView: https://ckgrounds.vercel.app/track/xyz?b=2",
  );
  // The nested `?`/`&` must be percent-encoded, not start new top-level params.
  assert.equal(url.split("?").length, 2);
});

test("googleCalendarUrlForRange: returns empty on unparseable input", () => {
  assert.equal(
    googleCalendarUrlForRange({ title: "x", startIso: "not-a-date", endIso: "2026-10-06T08:00:00+08:00" }),
    "",
  );
  assert.equal(
    googleCalendarUrlForRange({ title: "x", startIso: "2026-10-06T07:00:00+08:00", endIso: "" }),
    "",
  );
});

test("googleCalendarUrlForRange: rejects a non-positive range", () => {
  const same = { title: "x", startIso: "2026-10-06T07:00:00+08:00", endIso: "2026-10-06T07:00:00+08:00" };
  assert.equal(googleCalendarUrlForRange(same), "");

  const backwards = { title: "x", startIso: "2026-10-06T08:00:00+08:00", endIso: "2026-10-06T07:00:00+08:00" };
  assert.equal(googleCalendarUrlForRange(backwards), "");
});

// ------------------------------------------------- multi-session bookings

test("per-session links stay separate for courts on different days", () => {
  // Two sessions a week apart — the merged link would span the whole gap.
  const a = googleCalendarUrlForRange({
    title: "CK Grounds — Court A",
    startIso: "2026-10-06T07:00:00+08:00",
    endIso: "2026-10-06T09:00:00+08:00",
  });
  const b = googleCalendarUrlForRange({
    title: "CK Grounds — Court B",
    startIso: "2026-10-13T07:00:00+08:00",
    endIso: "2026-10-13T08:00:00+08:00",
  });

  assert.notEqual(a, b);
  assert.equal(datesOf(a), "20261005T230000Z/20261006T010000Z");
  assert.equal(datesOf(b), "20261012T230000Z/20261013T000000Z");
});

test("merged googleCalendarUrl still spans everything (web receipt behaviour)", () => {
  // Regression guard: the receipt keeps its single merged event.
  const url = googleCalendarUrl({
    title: "CK Grounds — Court A, Court B",
    slotStarts: ["2026-10-06T07:00:00+08:00", "2026-10-06T08:00:00+08:00"],
  });
  assert.equal(datesOf(url), "20261005T230000Z/20261006T010000Z");
});
