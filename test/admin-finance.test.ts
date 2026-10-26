import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateFinanceRows, bucketFinanceDays, normalizeFinanceRange } from "../src/lib/admin/finance.ts";
import { buildFinanceSheet } from "../src/lib/admin/finance-export.ts";

test("finance counts a booking on its approval date, not its future play date", () => {
  // Booked and paid/approved Oct 26 for a Nov 1 slot: cash-basis revenue
  // belongs to October, not November.
  const booking = {
    total: "10.01",
    approved_at: "2026-10-26T02:00:00.000Z", // Oct 26, 10:00 Manila
  };
  const report = aggregateFinanceRows("2026-10-26", "2026-10-26", [booking], []);
  assert.equal(report.revenueCents, 1001);
  assert.equal(report.bookings, 1);
  assert.deepEqual(report.days.map(({ date, revenueCents, bookings }) => ({ date, revenueCents, bookings })), [
    { date: "2026-10-26", revenueCents: 1001, bookings: 1 },
  ]);
});

test("finance counts a multi-slot booking once, in full, on the approval date", () => {
  const booking = { total: "10.01", approved_at: "2026-10-20T22:00:00.000Z" }; // Oct 21, 06:00 Manila
  const report = aggregateFinanceRows("2026-10-21", "2026-10-21", [booking], []);
  assert.equal(report.revenueCents, 1001);
  assert.equal(report.bookings, 1);
  assert.deepEqual(report.days.map(({ date, revenueCents, bookings }) => ({ date, revenueCents, bookings })), [
    { date: "2026-10-21", revenueCents: 1001, bookings: 1 },
  ]);
});

test("admin cash booking with no payment proof still counts in finance and charts", () => {
  // Admin walk-ins are born Approved (rpc_admin_create_booking stamps
  // approved_at = now()) and have no payment_proofs row.
  const cashBooking = { total: "500.00", approved_at: "2026-10-21T02:00:00.000Z" };
  const report = aggregateFinanceRows("2026-10-21", "2026-10-21", [cashBooking], []);
  assert.equal(report.revenueCents, 50000);
  assert.equal(report.bookings, 1);
  assert.deepEqual(report.days.map(({ date, revenueCents, bookings }) => ({ date, revenueCents, bookings })), [
    { date: "2026-10-21", revenueCents: 50000, bookings: 1 },
  ]);
  const chart = bucketFinanceDays(report.days);
  assert.equal(chart.buckets.reduce((sum, bucket) => sum + bucket.revenueCents, 0), 50000);
});

test("finance applies the range to approval dates and paid dates", () => {
  const report = aggregateFinanceRows(
    "2026-10-21",
    "2026-10-21",
    [
      { total: "20.00", approved_at: "2026-10-20T23:00:00.000Z" }, // Oct 21, 07:00 Manila — in
      { total: "99.00", approved_at: "2026-10-22T02:00:00.000Z" }, // Oct 22 Manila — out
    ],
    [
      { paid_date: "2026-10-21", amount_centavos: 1250 },
      { paid_date: "2026-10-22", amount_centavos: 999 },
    ],
  );
  assert.equal(report.revenueCents, 2000);
  assert.equal(report.expenseCents, 1250);
  assert.equal(report.profitCents, 750);
  assert.equal(report.profitMargin, 37.5);
  assert.equal(report.averageRevenueCents, 2000);
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

test("finance sheet reports the period, one row per booking, filtered expenses, and a matching summary", () => {
  const { rows, columns } = buildFinanceSheet({
    period: "October 1, 2026 – October 21, 2026",
    generated: "October 21, 2026",
    bookings: [
      { approved: "October 21, 2026", customer: "Ana Cruz", email: "ana@example.com", courts: "Court A", slots: "1:00PM–3:00PM", playDate: "November 1, 2026", courtCents: 4000, rentalCents: 1000, totalCents: 5000 },
      { approved: "October 21, 2026", customer: "Ben Tan", email: "ben@example.com", courts: "Court B", slots: "2:00PM–3:00PM", playDate: "October 25, 2026", courtCents: 2000, rentalCents: 0, totalCents: 2000 },
    ],
    expenses: [{ paidDate: "2026-10-21", title: 'Lights, "Court A"', category: "Utilities", amountCentavos: 1234 }],
  });
  const text = (cell: unknown) => (cell && typeof cell === "object" && "value" in cell ? (cell as { value: unknown }).value : cell);
  const row = (label: string) => rows.find((candidate) => text(candidate[0]) === label) ?? [];
  assert.equal(text(rows[0]?.[0]), "Finance Report");
  assert.deepEqual(row("Report period").map(text), ["Report period", "October 1, 2026 – October 21, 2026"]);
  assert.deepEqual(row("Generated").map(text), ["Generated", "October 21, 2026"]);
  const bookingRows = rows.filter((candidate) => typeof text(candidate[0]) === "number").map((candidate) => candidate.map(text));
  assert.deepEqual(bookingRows, [
    [1, "October 21, 2026", "Ana Cruz", "ana@example.com", "Court A", "1:00PM–3:00PM", "November 1, 2026", 40, 10, 50],
    [2, "October 21, 2026", "Ben Tan", "ben@example.com", "Court B", "2:00PM–3:00PM", "October 25, 2026", 20, 0, 20],
  ]);
  assert.deepEqual(row("Lights, \"Court A\"").map(text), ["Lights, \"Court A\"", "Utilities", "2026-10-21", 12.34]);
  assert.deepEqual(row("Bookings total").map(text), ["Bookings total", "", "", "", "", "", "", 60, 10, 70]);
  assert.deepEqual(row("Expenses total").map(text), ["Expenses total", "", "", 12.34]);
  assert.deepEqual(row("Booking Revenue (PHP)").map(text), ["Booking Revenue (PHP)", 70]);
  assert.deepEqual(row("Bookings Count").map(text), ["Bookings Count", 2]);
  assert.deepEqual(row("Expenses (PHP)").map(text), ["Expenses (PHP)", 12.34]);
  assert.deepEqual(row("Net Profit (PHP)").map(text), ["Net Profit (PHP)", 57.66]);
  assert.equal(columns.length, 10);
  assert.ok(columns.every((column) => (column.width ?? 0) >= 16));
});
