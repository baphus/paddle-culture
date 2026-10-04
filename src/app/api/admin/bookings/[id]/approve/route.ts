import { NextResponse } from "next/server";
import { z } from "zod";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { applyDecision, getDbOrThrow } from "@/lib/admin/decisions";
import { drainOutboxBestEffort } from "@/lib/mail/worker";

export const runtime = "nodejs";

const idParam = z.string().uuid();

// POST /api/admin/bookings/[id]/approve — admin only. Pending → Approved +
// booking_customer_approved outbox row + audit, atomically. Idempotent:
// re-approving returns current state with no duplicate email.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!idParam.safeParse(id).success) {
      return err("BAD_REQUEST", "Invalid booking id.", 400);
    }
    const result = await applyDecision(getDbOrThrow(), admin, id, "Approved");
    // Immediate send of the approval email (best-effort; cron is backstop).
    if (!result.deduped) await drainOutboxBestEffort();
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("approve failed", e);
    return err("INTERNAL", "Approval failed.", 500);
  }
}
