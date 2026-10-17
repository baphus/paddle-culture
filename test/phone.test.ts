import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "../src/lib/booking/phone.ts";

// ---------------------------------------------------------------- normalizePhone

test("normalizePhone: strips the country code", () => {
  assert.equal(normalizePhone("+639123456789"), "09123456789");
  assert.equal(normalizePhone("639123456789"), "09123456789");
  assert.equal(normalizePhone("+63 961 633 3337"), "09616333337");
});

test("normalizePhone: adds the leading zero to a bare mobile", () => {
  assert.equal(normalizePhone("9123456789"), "09123456789");
  assert.equal(normalizePhone("912 345 6789"), "09123456789");
});

test("normalizePhone: leaves a local number alone", () => {
  assert.equal(normalizePhone("09123456789"), "09123456789");
  assert.equal(normalizePhone("0917-123-4567"), "09171234567");
  assert.equal(normalizePhone(" 09123456789 "), "09123456789");
});

test("normalizePhone: keeps a landline as-is (no 63/9 prefix)", () => {
  assert.equal(normalizePhone("0281234567"), "0281234567");
});

test("normalizePhone: input with no digits becomes empty, so the schema rejects it", () => {
  assert.equal(normalizePhone("n/a"), "");
});
