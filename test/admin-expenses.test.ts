import { test } from "node:test";
import assert from "node:assert/strict";
import { expenseInputSchema, EXPENSE_CATEGORIES } from "../src/lib/admin/expenses.ts";
import { manilaDateStr } from "../src/lib/booking/slots.ts";

const valid = {
  title: "Court lights",
  category: "Utilities",
  amountCentavos: 125050,
  paidDate: "2026-10-20",
};

test("expense input accepts a titled, positive centavo expense in a supported category", () => {
  const result = expenseInputSchema.safeParse(valid);
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.title, "Court lights");
});

test("expense input rejects blank titles, unsupported categories, and non-positive amounts", () => {
  assert.equal(expenseInputSchema.safeParse({ ...valid, title: "  " }).success, false);
  assert.equal(expenseInputSchema.safeParse({ ...valid, category: "Travel" }).success, false);
  assert.equal(expenseInputSchema.safeParse({ ...valid, amountCentavos: 0 }).success, false);
  assert.equal(expenseInputSchema.safeParse({ ...valid, amountCentavos: 12.5 }).success, false);
  assert.ok(EXPENSE_CATEGORIES.includes("Other"));
});

test("expense input validates calendar dates and rejects future Manila paid dates", () => {
  assert.equal(expenseInputSchema.safeParse({ ...valid, paidDate: "2026-02-30" }).success, false);
  assert.equal(expenseInputSchema.safeParse({ ...valid, paidDate: "not-a-date" }).success, false);
  const tomorrow = new Date(`${manilaDateStr(new Date())}T00:00:00+08:00`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const nextDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(tomorrow);
  assert.equal(expenseInputSchema.safeParse({ ...valid, paidDate: nextDate }).success, false);
});
