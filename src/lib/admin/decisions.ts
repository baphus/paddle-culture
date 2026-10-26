import { getDb, type Db } from "@/db/client";
import { LaneError } from "@/lib/booking/errors";
import type { AdminSession } from "./session";

// All Drizzle ORM/transaction logic replaced with a Postgres RPC call
// (rpc_apply_decision). The function runs atomically server-side with
// SERIALIZABLE isolation and SELECT FOR UPDATE semantics.

export type Decision = "Approved" | "Rejected";

export interface DecisionResult {
  id: string;
  status: string;
  trackingToken: string;
  deduped: boolean;
}

/**
 * Approve or Reject a booking (ADR-02/ADR-03/ADR-05). One atomic RPC:
 * status change + slot-state flip + decision outbox row + audit row,
 * equivalent to the original SERIALIZABLE Drizzle transaction.
 * Idempotent: repeating the same decision returns current state without a
 * duplicate outbox row.
 */
export async function applyDecision(
  db: Db,
  admin: AdminSession,
  bookingId: string,
  decision: Decision,
  reason?: string,
): Promise<DecisionResult> {
  const { data, error } = await db.rpc("rpc_apply_decision", {
    p_booking_id: bookingId,
    p_decision: decision,
    p_actor_email: admin.email,
    p_reason: reason ?? null,
  });

  if (error) {
    throw translateDecisionError(error, "Decision failed.");
  }

  const result = data as {
    id: string;
    status: string;
    tracking_token: string;
    deduped: boolean;
  };

  return {
    id: result.id,
    status: result.status,
    trackingToken: result.tracking_token,
    deduped: result.deduped,
  };
}

/** Map the RPCs' RAISE EXCEPTION prefixes back to LaneErrors. */
function translateDecisionError(
  error: { message?: string },
  fallback: string,
): LaneError {
  const msg = error.message ?? "";
  if (msg.includes("NOT_FOUND"))
    return new LaneError("NOT_FOUND", "Booking not found.", 404);
  if (msg.includes("WRONG_STATUS")) {
    const detail = msg.replace(/^WRONG_STATUS:\s*/, "");
    return new LaneError("WRONG_STATUS", detail, 409);
  }
  return new LaneError("INTERNAL", fallback, 500);
}

/**
 * Refund an Approved booking: status -> Refunded, slots released, customer
 * email queued, audit written (rpc_refund_booking). Idempotent.
 */
export async function refundBooking(
  db: Db,
  admin: AdminSession,
  bookingId: string,
  reason?: string,
): Promise<DecisionResult> {
  const { data, error } = await db.rpc("rpc_refund_booking", {
    p_booking_id: bookingId,
    p_actor_email: admin.email,
    p_reason: reason || null,
  });
  if (error) throw translateDecisionError(error, "Refund failed.");

  const result = data as {
    id: string;
    status: string;
    tracking_token: string;
    deduped: boolean;
  };
  return {
    id: result.id,
    status: result.status,
    trackingToken: result.tracking_token,
    deduped: result.deduped,
  };
}

export interface DeleteBookingResult {
  id: string;
  /** false when the booking was already gone (re-delete). */
  deleted: boolean;
}

/** Permanently delete a booking and its dependent rows (rpc_delete_booking). */
export async function deleteBooking(
  db: Db,
  admin: AdminSession,
  bookingId: string,
): Promise<DeleteBookingResult> {
  const { data, error } = await db.rpc("rpc_delete_booking", {
    p_booking_id: bookingId,
    p_actor_email: admin.email,
  });
  if (error) throw translateDecisionError(error, "Delete failed.");

  const result = data as { id: string; deleted: boolean };
  return { id: result.id, deleted: result.deleted };
}

export function getDbOrThrow(): Db {
  try {
    return getDb();
  } catch {
    throw new LaneError("NOT_CONFIGURED", "Database is not configured.", 500);
  }
}
