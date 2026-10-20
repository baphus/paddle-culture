import { NextResponse } from "next/server";
import { z } from "zod";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { deleteAdminUser } from "@/lib/admin/users";

export const runtime = "nodejs";

const idParam = z.string().uuid();

// DELETE /api/admin/users/[userId] — permanently delete another admin.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const actor = await requireAdmin();
    const { userId } = await params;
    if (!idParam.safeParse(userId).success) {
      return err("BAD_REQUEST", "Invalid user id.", 400);
    }
    await deleteAdminUser(actor, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin user delete failed", e);
    return err("INTERNAL", "Could not delete user.", 500);
  }
}
