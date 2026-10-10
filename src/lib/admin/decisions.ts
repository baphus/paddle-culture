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
    // Translate Postgres exception messages back to LaneErrors
    const msg = error.message ?? "";
    if (msg.includes("NOT_FOUND")) throw new LaneError("NOT_FOUND", "Booking not found.", 404);
    if (msg.includes("WRONG_STATUS")) {
      const detail = msg.replace(/^WRONG_STATUS:\s*/, "");
      throw new LaneError("WRONG_STATUS", detail, 409);
    }
    throw new LaneError("INTERNAL", "Decision failed.", 500);
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

export function getDbOrThrow(): Db {
  try {
    return getDb();
  } catch {
    throw new LaneError("NOT_CONFIGURED", "Database is not configured.", 500);
  }
}
