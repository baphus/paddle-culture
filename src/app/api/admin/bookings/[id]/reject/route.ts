import { NextResponse } from "next/server";
import { z } from "zod";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { applyDecision, getDbOrThrow } from "@/lib/admin/decisions";
import { drainOutboxBestEffort } from "@/lib/mail/worker";

export const runtime = "nodejs";

const idParam = z.string().uuid();
// Reason is mandatory (ADR-08 frozen) — schema supports it via reject_reason.
const rejectBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

// POST /api/admin/bookings/[id]/reject — admin only. Pending → Rejected +
// booking_customer_rejected outbox row + audit, atomically; slots released.
// Idempotent: re-rejecting returns current state with no duplicate email.
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
    const parsed = rejectBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err(
        "BAD_REQUEST",
        parsed.error.issues[0]?.message ?? "A rejection reason is required.",
        400,
      );
    }
    const result = await applyDecision(
      getDbOrThrow(),
      admin,
      id,
      "Rejected",
      parsed.data.reason,
    );
    // Immediate send of the rejection email (best-effort; cron is backstop).
    if (!result.deduped) await drainOutboxBestEffort();
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("reject failed", e);
    return err("INTERNAL", "Rejection failed.", 500);
  }
}
