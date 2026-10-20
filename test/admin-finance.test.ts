import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateFinanceRows, bucketFinanceDays, normalizeFinanceRange } from "../src/lib/admin/finance.ts";
import { buildFinanceCsv } from "../src/lib/admin/finance-export.ts";

test("finance allocates a multi-date booking exactly across its slot dates", () => {
  const booking = {
    id: "booking-1",
    total: "10.01",
    booking_slots: [
      { slot_start: "2026-10-20T22:00:00.000Z" }, // Oct 21, 06:00 Manila
      { slot_start: "2026-10-20T23:00:00.000Z" }, // Oct 21, 07:00 Manila
      { slot_start: "2026-10-21T22:00:00.000Z" }, // Oct 22, 06:00 Manila
    ],
  };
  const report = aggregateFinanceRows("2026-10-21", "2026-10-22", [booking], []);
  assert.equal(report.revenueCents, 1001);
  assert.equal(report.bookings, 1);
  assert.deepEqual(report.days.map(({ date, revenueCents, bookings }) => ({ date, revenueCents, bookings })), [
    { date: "2026-10-21", revenueCents: 668, bookings: 1 },
    { date: "2026-10-22", revenueCents: 333, bookings: 1 },
  ]);
});

test("finance applies the range to slot dates and paid dates", () => {
  const report = aggregateFinanceRows(
    "2026-10-21",
    "2026-10-21",
    [{ total: "20.00", booking_slots: [
      { slot_start: "2026-10-20T22:00:00.000Z" },
      { slot_start: "2026-10-21T22:00:00.000Z" },
    ] }],
    [
      { paid_date: "2026-10-21", amount_centavos: 1250 },
      { paid_date: "2026-10-22", amount_centavos: 999 },
    ],
  );
  assert.equal(report.revenueCents, 1000);
  assert.equal(report.expenseCents, 1250);
  assert.equal(report.profitCents, -250);
  assert.equal(report.profitMargin, -25);
  assert.equal(report.averageRevenueCents, 1000);
});

test("finance fills empty dates and marks zero-denominator ratios unavailable", () => {
  const report = aggregateFinanceRows("2026-10-21", "2026-10-23", [], []);
  assert.deepEqual(report.days.map((day) => day.date), ["2026-10-21", "2026-10-22", "2026-10-23"]);
  assert.equal(report.revenueCents, 0);
  assert.equal(report.expenseCents, 0);
  assert.equal(report.profitCents, 0);
  assert.equal(report.bookings, 0);
  assert.equal(report.profitMargin, null);
  assert.equal(report.averageRevenueCents, null);
});

test("finance chart buckets adapt to range size and preserve revenue/profit totals", () => {
  const daily = Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-${String(19 + index).padStart(2, "0")}`, revenueCents: 100 + index, expenseCents: 25, profitCents: 75 + index, bookings: 1 }));
  const rowsFor = (length: number) => Array.from({ length }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1));
    const dateString = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    return { ...daily[index % daily.length]!, date: dateString };
  });
  const weeklyRows = rowsFor(60);
  const monthlyRows = rowsFor(365);
  const weekly = bucketFinanceDays(weeklyRows);
  const monthly = bucketFinanceDays(monthlyRows);
  assert.equal(bucketFinanceDays(daily).granularity, "daily");
  assert.equal(weekly.granularity, "weekly");
  assert.equal(monthly.granularity, "monthly");
  for (const [result, source] of [[weekly, weeklyRows], [monthly, monthlyRows]] as const) {
    assert.equal(result.buckets.reduce((sum, row) => sum + row.revenueCents, 0), source.reduce((sum, row) => sum + row.revenueCents, 0));
    assert.equal(result.buckets.reduce((sum, row) => sum + row.profitCents, 0), source.reduce((sum, row) => sum + row.profitCents, 0));
  }
});

test("finance range normalization defaults, validates calendar dates, and orders reversed dates", () => {
  assert.deepEqual(normalizeFinanceRange(undefined, undefined, "2026-10-21"), { from: "2026-09-22", to: "2026-10-21" });
  assert.deepEqual(normalizeFinanceRange("2026-02-30", "2026-10-21", "2026-10-21"), { from: "2026-09-22", to: "2026-10-21" });
  assert.deepEqual(normalizeFinanceRange("2026-10-21", "2026-10-01", "2026-10-21"), { from: "2026-10-01", to: "2026-10-21" });
});

test("finance CSV includes revenue, filtered expenses, daily profit, and safely quoted titles", () => {
  const csv = buildFinanceCsv(
    [{ date: "2026-10-21", revenueCents: 5000, expenseCents: 1234, profitCents: 3766, bookings: 2 }],
    [{ paidDate: "2026-10-21", title: 'Lights, "Court A"', category: "Utilities", amountCentavos: 1234 }],
  );
  assert.ok(csv.startsWith("\uFEFFRecord type,Date,Title,Category,Bookings,Revenue (PHP),Expense (PHP),Profit (PHP)"));
  assert.match(csv, /Booking revenue,2026-10-21,,,2,50\.00,,/);
  assert.match(csv, /Expense,2026-10-21,"Lights, ""Court A""",Utilities,,,12\.34,/);
  assert.match(csv, /Daily profit summary,2026-10-21,,,,,,37\.66/);
});
