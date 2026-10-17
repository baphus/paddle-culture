import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCourtSlotGroups } from "../src/lib/courts.ts";

// Manila is UTC+8, so 07:00Z = 3:00PM the same day.

test("formatCourtSlotGroups: single court keeps the collapsed range label", () => {
  assert.deepEqual(
    formatCourtSlotGroups([
      { courtName: "Court 1", slotStarts: ["2026-10-19T07:00:00Z", "2026-10-19T08:00:00Z"] },
    ]),
    [],
  );
});

test("formatCourtSlotGroups: same hours on every court keep the collapsed range label", () => {
  assert.deepEqual(
    formatCourtSlotGroups([
      { courtName: "Court 1", slotStarts: ["2026-10-19T07:00:00Z", "2026-10-19T08:00:00Z"] },
      { courtName: "Court 2", slotStarts: ["2026-10-19T08:00:00Z", "2026-10-19T07:00:00Z"] },
    ]),
    [],
  );
});

test("formatCourtSlotGroups: different hours per court render one line each", () => {
  assert.deepEqual(
    formatCourtSlotGroups([
      { courtName: "Court 1", slotStarts: ["2026-10-19T07:00:00Z"] },
      { courtName: "Court 2", slotStarts: ["2026-10-19T08:00:00Z"] },
    ]),
    ["Court 1 · 3:00 – 4:00 PM", "Court 2 · 4:00 – 5:00 PM"],
  );
});

test("formatCourtSlotGroups: courts with no slots are ignored", () => {
  assert.deepEqual(
    formatCourtSlotGroups([
      { courtName: "Court 1", slotStarts: ["2026-10-19T07:00:00Z"] },
      { courtName: "Court 2", slotStarts: [] },
    ]),
    [],
  );
});
