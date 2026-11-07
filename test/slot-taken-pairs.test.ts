import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { matchingSlotRows } from "@/lib/booking/availability";

test("submit and admin-create preflights both filter fetched candidates by exact pair", async () => {
  for (const file of ["../src/app/api/submit/route.ts", "../src/app/api/admin/bookings/route.ts"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /matchingSlotRows\(/);
  }
});

test("slot clash matching ignores court/time cross-products and normalizes timestamp offsets", () => {
  const selected = [
    { courtId: "A", start: "2026-11-07T01:00:00.000Z" },
    { courtId: "B", start: "2026-11-07T02:00:00.000Z" },
  ];
  const crossPair = [{ court_id: "A", slot_start: "2026-11-07T02:00:00+00:00", state: "approved" }];
  assert.deepEqual(matchingSlotRows(selected, crossPair), []);

  const adminSelected = [
    ...[12, 13, 14].map((hour) => ({ courtId: "406612d3-0356-4d0e-b97d-d73711efeb0e", start: `2026-11-08T${hour.toString().padStart(2, "0")}:00:00.000Z` })),
    ...[11, 15].map((hour) => ({ courtId: "7e4894bd-a86d-448c-a4d4-a3d2960ddb01", start: `2026-11-08T${hour.toString().padStart(2, "0")}:00:00.000Z` })),
  ];
  const adminCrossPairs = [12, 13, 14].map((hour) => ({
    court_id: "7e4894bd-a86d-448c-a4d4-a3d2960ddb01",
    slot_start: `2026-11-08T${hour.toString().padStart(2, "0")}:00:00+00:00`,
    state: "approved",
  }));
  assert.deepEqual(matchingSlotRows(adminSelected, adminCrossPairs), []);
  assert.deepEqual(
    matchingSlotRows(selected, [
      { court_id: "A", slot_start: "2026-11-07T09:00:00+08:00", state: "approved" },
    ]),
    [{ court_id: "A", slot_start: "2026-11-07T09:00:00+08:00", state: "approved" }],
  );
  const adminActualMatch = [{
    court_id: "7e4894bd-a86d-448c-a4d4-a3d2960ddb01",
    slot_start: "2026-11-08T11:00:00+00:00",
    state: "approved",
  }];
  assert.deepEqual(matchingSlotRows(adminSelected, adminActualMatch), adminActualMatch);
});
