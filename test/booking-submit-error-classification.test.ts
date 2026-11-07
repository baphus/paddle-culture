import assert from "node:assert/strict";
import test from "node:test";
import {
  isBookingSlotOverlapViolation,
  isProofPathViolation,
  isTrackingCodeViolation,
} from "@/lib/booking/tracking";

test("classifies submit unique violations by their named constraint", () => {
  assert.equal(
    isBookingSlotOverlapViolation({ code: "23505", constraint: "booking_slots_no_overlap_idx" }),
    true,
  );
  assert.equal(
    isBookingSlotOverlapViolation({ code: "23505", constraint: "unrelated_unique_idx" }),
    false,
  );
  assert.equal(
    isBookingSlotOverlapViolation({ code: "23505", message: "duplicate booking_slots_no_overlap_idx" }),
    true,
  );
  assert.equal(
    isBookingSlotOverlapViolation({ code: "23505", constraint: "payment_proofs_path_uniq" }),
    false,
  );
  assert.equal(
    isTrackingCodeViolation({ code: "23505", constraint: "bookings_tracking_code_key" }),
    true,
  );
  assert.equal(
    isProofPathViolation({ code: "23505", constraint: "payment_proofs_path_uniq" }),
    true,
  );
});
