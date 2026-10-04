import { NextResponse } from "next/server";
import { z } from "zod";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { getDbOrThrow } from "@/lib/admin/decisions";
import { deleteHours } from "@/lib/admin/config";

export const runtime = "nodejs";

const idParam = z.string().uuid();

// DELETE /api/admin/hours/[id] — admin only. Removes one operating_hours
// row + audit. Deleting a court's last row re-opens it fully (default-OPEN).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!idParam.safeParse(id).success) {
      return err("BAD_REQUEST", "Invalid hours id.", 400);
    }
    await deleteHours(getDbOrThrow(), admin, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin hours delete failed", e);
    return err("INTERNAL", "Hours deletion failed.", 500);
  }
}
