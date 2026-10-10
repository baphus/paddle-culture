import { NextResponse } from "next/server";
import { z } from "zod";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { setAdminDisabled } from "@/lib/admin/users";

export const runtime = "nodejs";

const idParam = z.string().uuid();

// POST /api/admin/users/[userId]/reactivate — admin only, never self (ADR-04).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const actor = await requireAdmin();
    const { userId } = await params;
    if (!idParam.safeParse(userId).success) {
      return err("BAD_REQUEST", "Invalid user id.", 400);
    }
    await setAdminDisabled(actor, userId, false);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin user reactivate failed", e);
    return err("INTERNAL", "Could not reactivate user.", 500);
  }
}
