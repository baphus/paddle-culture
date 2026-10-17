import { test } from "node:test";
import assert from "node:assert/strict";
import { maskEmail, maskPhone } from "../src/lib/booking/redact.ts";

// These values render on /track/<token>, which needs no email or code to open,
// so the mask must never fall back to the raw value.

test("maskEmail keeps one letter and the domain", () => {
  assert.equal(maskEmail("juan@gmail.com"), "j•••@gmail.com");
  assert.equal(maskEmail(""), "•••");
  assert.equal(maskEmail("no-at-sign"), "•••");
});

test("maskPhone keeps only the last 3 digits", () => {
  assert.equal(maskPhone("09171234567"), "••••••••567");
  assert.equal(maskPhone("+63 917 123 4567"), "•••••••••567");
  assert.equal(maskPhone("12"), "•••");
});
