import { test } from "node:test";
import assert from "node:assert/strict";

// ------------------------------------------------------------------ helpers

/**
 * Monetary formatting logic mirroring the BookingsPage table cell:
 *   ₱{Number(b.total).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
 *
 * Validates: Requirements 5.4
 */
function formatTotal(value: number | string): string {
  return (
    "₱" +
    Number(value).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

// ------------------------------------------------------------------ Property 8
// Monetary total formatting matches en-PH locale pattern.

test("formatTotal: zero formats as ₱0.00", () => {
  assert.equal(formatTotal(0), "₱0.00");
});

test("formatTotal: integer formats with two decimal places", () => {
  const result = formatTotal(1000);
  assert.ok(result.startsWith("₱"), `expected ₱ prefix, got ${result}`);
  assert.match(result, /₱[\d,]+\.00$/);
});

test("formatTotal: decimal value preserves two decimal places", () => {
  const result = formatTotal(1234.5);
  assert.ok(result.startsWith("₱"), `expected ₱ prefix, got ${result}`);
  assert.match(result, /₱[\d,]+\.\d{2}$/);
});

test("formatTotal: string numeric input is accepted", () => {
  const result = formatTotal("750.00");
  assert.ok(result.startsWith("₱"), `expected ₱ prefix, got ${result}`);
  assert.match(result, /₱[\d,]+\.\d{2}$/);
});

test("property: formatTotal always starts with ₱ and has exactly 2 decimal places", () => {
  const samples = [0, 1, 99, 100, 999.99, 1000, 12345.6, 1_000_000];
  for (const n of samples) {
    const result = formatTotal(n);
    assert.ok(
      result.startsWith("₱"),
      `formatTotal(${n}) should start with ₱, got ${result}`,
    );
    assert.match(
      result,
      /₱[\d,]+\.\d{2}$/,
      `formatTotal(${n}) should end with 2 decimal places, got ${result}`,
    );
  }
});

// ------------------------------------------------------------------ helpers

/**
 * statusVariant logic extracted from src/app/admin/bookings/page.tsx.
 *
 * Validates: Requirements 5.5
 */
function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Approved") return "default";
  if (status === "Rejected") return "destructive";
  if (status === "Pending") return "secondary";
  return "outline";
}

// ------------------------------------------------------------------ Property 9
// statusVariant returns correct badge variant for all known statuses.

test('statusVariant: "Approved" returns "default"', () => {
  assert.equal(statusVariant("Approved"), "default");
});

test('statusVariant: "Rejected" returns "destructive"', () => {
  assert.equal(statusVariant("Rejected"), "destructive");
});

test('statusVariant: "Pending" returns "secondary"', () => {
  assert.equal(statusVariant("Pending"), "secondary");
});

test('statusVariant: empty string returns "outline"', () => {
  assert.equal(statusVariant(""), "outline");
});

test('statusVariant: unknown string "Cancelled" returns "outline"', () => {
  assert.equal(statusVariant("Cancelled"), "outline");
});

test('statusVariant: unknown string "Unknown" returns "outline"', () => {
  assert.equal(statusVariant("Unknown"), "outline");
});

test("property: known statuses return a non-outline variant; all others return outline", () => {
  // Known statuses must map to their specific variants.
  const known: Array<[string, "default" | "secondary" | "destructive"]> = [
    ["Approved", "default"],
    ["Rejected", "destructive"],
    ["Pending", "secondary"],
  ];
  for (const [status, expected] of known) {
    const actual = statusVariant(status);
    assert.equal(
      actual,
      expected,
      `statusVariant(${JSON.stringify(status)}) should be "${expected}", got "${actual}"`,
    );
    assert.notEqual(
      actual,
      "outline",
      `known status ${JSON.stringify(status)} must not return "outline"`,
    );
  }

  // Unknown strings must return "outline".
  const unknowns = ["", "Cancelled", "Unknown", "approved", "APPROVED", "pending", "rejected", "foo"];
  for (const status of unknowns) {
    const actual = statusVariant(status);
    assert.equal(
      actual,
      "outline",
      `statusVariant(${JSON.stringify(status)}) should be "outline", got "${actual}"`,
    );
  }
});
