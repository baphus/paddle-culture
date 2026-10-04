import { eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import {
  auditLog,
  bookingRentals,
  bookingSlots,
  bookings,
  courts,
  emailOutbox,
} from "@/db/schema";
import { LaneError } from "@/lib/booking/errors";
import {
  OUTBOX_TEMPLATE_CUSTOMER_APPROVED,
  OUTBOX_TEMPLATE_CUSTOMER_REJECTED,
} from "@/lib/mail/templates";
import type { AdminSession } from "./session";

export type Decision = "Approved" | "Rejected";

export interface DecisionResult {
  id: string;
  status: string;
  trackingToken: string;
  deduped: boolean;
}

export interface SlotDetail {
  courtId: string;
  courtName: string;
  slotStart: string;
}

// NOTE (schema gap, reported not migrated): bookings has NO decided_by /
// decided_at columns — only reject_reason + updatedAt. Decision attribution
// (who/when) is recorded durably in audit_log instead (actor = admin email,
// action = booking.approve|booking.reject, at = now), and updatedAt bumps on
// every decision. No silent migration was performed.

async function loadDetails(tx: Db, bookingId: string) {
  const slotRows = await tx
    .select({
      courtId: bookingSlots.courtId,
      courtName: courts.name,
      slotStart: bookingSlots.slotStart,
    })
    .from(bookingSlots)
    .innerJoin(courts, eq(bookingSlots.courtId, courts.id))
    .where(eq(bookingSlots.bookingId, bookingId))
    .orderBy(bookingSlots.slotStart);
  const rentalRows = await tx
    .select()
    .from(bookingRentals)
    .where(eq(bookingRentals.bookingId, bookingId));
  return { slotRows, rental: rentalRows[0] ?? null };
}

/**
 * Approve or Reject a booking (ADR-02/ADR-03/ADR-05). One transaction:
 * status change + slot-state flip + decision outbox row + audit row commit
 * atomically, so a failure after the status change always leaves the email
 * retryable via the outbox. The route drains best-effort immediately after
 * commit (cron is backstop). Idempotent: repeating the
 * same decision returns current state without a duplicate outbox row
 * (status X ⟹ its outbox row already committed in the same txn).
 */
export async function applyDecision(
  db: Db,
  admin: AdminSession,
  bookingId: string,
  decision: Decision,
  reason?: string,
): Promise<DecisionResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);

    const rows = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .for("update");
    const booking = rows[0];
    if (!booking) {
      throw new LaneError("NOT_FOUND", "Booking not found.", 404);
    }
    if (booking.status !== "Pending") {
      if (booking.status === decision) {
        return {
          id: booking.id,
          status: booking.status,
          trackingToken: booking.trackingToken,
          deduped: true,
        };
      }
      throw new LaneError(
        "WRONG_STATUS",
        `Booking is already ${booking.status}.`,
        409,
      );
    }

    const { slotRows } = await loadDetails(tx, booking.id);
    const slots: SlotDetail[] = slotRows.map((s) => ({
      courtId: s.courtId,
      courtName: s.courtName,
      slotStart: s.slotStart.toISOString(),
    }));

    const now = new Date();
    // Flip slot states so availability follows the decision: approved slots
    // stay reserved (visible as approved), rejected slots drop out of the
    // partial unique index (released).
    const nextSlotState = decision === "Approved" ? "approved" : "rejected";
    await tx
      .update(bookings)
      .set({
        status: decision,
        rejectReason: decision === "Rejected" ? (reason ?? null) : null,
        updatedAt: now,
      })
      .where(eq(bookings.id, booking.id));
    await tx
      .update(bookingSlots)
      .set({ state: nextSlotState })
      .where(eq(bookingSlots.bookingId, booking.id));

    const template =
      decision === "Approved"
        ? OUTBOX_TEMPLATE_CUSTOMER_APPROVED
        : OUTBOX_TEMPLATE_CUSTOMER_REJECTED;
    await tx.insert(emailOutbox).values({
      bookingId: booking.id,
      template,
      toAddr: booking.email,
      payload: {
        trackingToken: booking.trackingToken,
        fullName: booking.fullName,
        slots,
        total: booking.total,
        ...(decision === "Rejected" ? { rejectReason: reason ?? null } : {}),
      },
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
    });

    await tx.insert(auditLog).values({
      actor: admin.email,
      action: decision === "Approved" ? "booking.approve" : "booking.reject",
      entity: "booking",
      entityId: booking.id,
      before: { status: "Pending" },
      after: {
        status: decision,
        ...(decision === "Rejected" ? { rejectReason: reason ?? null } : {}),
      },
    });

    return {
      id: booking.id,
      status: decision,
      trackingToken: booking.trackingToken,
      deduped: false,
    };
  });
}

export function getDbOrThrow(): Db {
  try {
    return getDb();
  } catch {
    throw new LaneError("NOT_CONFIGURED", "Database is not configured.", 500);
  }
}
