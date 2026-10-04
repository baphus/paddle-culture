import { NextResponse } from "next/server";
import { z } from "zod";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { getDbOrThrow } from "@/lib/admin/decisions";
import { deleteClosure } from "@/lib/admin/config";

export const runtime = "nodejs";

const idParam = z.string().uuid();

// DELETE /api/admin/closures/[id] — admin only. Lifts one closure + audit.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!idParam.safeParse(id).success) {
      return err("BAD_REQUEST", "Invalid closure id.", 400);
    }
    await deleteClosure(getDbOrThrow(), admin, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin closures delete failed", e);
    return err("INTERNAL", "Closure deletion failed.", 500);
  }
}
