import { NextResponse, after } from "next/server";
import { z } from "zod";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { getDbOrThrow, refundBooking } from "@/lib/admin/decisions";
import { drainBookingOutboxBestEffort } from "@/lib/mail/worker";

export const runtime = "nodejs";

const idParam = z.string().uuid();
// Reason is optional: the admin may just return the money at the desk.
const refundBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

// POST /api/admin/bookings/[id]/refund — admin only. Approved → Refunded +
// booking_customer_refunded outbox row + audit, atomically; slots released.
// Idempotent: re-refunding returns current state with no duplicate email.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!idParam.safeParse(id).success) {
      return err("BAD_REQUEST", "Invalid booking id.", 400);
    }
    const parsed = refundBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err(
        "BAD_REQUEST",
        parsed.error.issues[0]?.message ?? "Invalid refund reason.",
        400,
      );
    }
    const result = await refundBooking(
      getDbOrThrow(),
      admin,
      id,
      parsed.data.reason,
    );
    // Scoped background send; the cron is the backstop.
    if (!result.deduped)
      after(() => drainBookingOutboxBestEffort(result.id).catch(() => {}));
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("refund failed", e);
    return err("INTERNAL", "Refund failed.", 500);
  }
}
