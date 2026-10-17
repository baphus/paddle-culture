import { test } from "node:test";
import assert from "node:assert/strict";
import { googleCalendarUrl } from "../src/lib/booking/calendar.ts";

// Manila slots are UTC+8, so a 06:00 slot is 22:00 UTC the previous day.
// The link must carry UTC instants or Google shows the event 8h off.

test("spans first slot start to 1h after the last, in UTC", () => {
  const url = googleCalendarUrl({
    title: "CK Grounds — Court 1",
    slotStarts: ["2026-10-19T06:00:00+08:00", "2026-10-19T07:00:00+08:00"],
    location: "RVF9+6XW, Poblacion, Tabuelan, Cebu, Philippines",
    details: "Booking ref: #ABCD1234",
  });
  const p = new URL(url).searchParams;
  assert.equal(p.get("action"), "TEMPLATE");
  assert.equal(p.get("text"), "CK Grounds — Court 1");
  assert.equal(p.get("dates"), "20261018T220000Z/20261019T000000Z");
  assert.equal(p.get("location"), "RVF9+6XW, Poblacion, Tabuelan, Cebu, Philippines");
  assert.equal(p.get("details"), "Booking ref: #ABCD1234");
});

test("empty slot list yields no link", () => {
  assert.equal(googleCalendarUrl({ title: "x", slotStarts: [] }), "");
  assert.equal(googleCalendarUrl({ title: "x", slotStarts: ["not-a-date"] }), "");
});
