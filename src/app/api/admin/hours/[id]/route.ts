import { NextResponse } from "next/server";
import { z } from "zod";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { getDbOrThrow } from "@/lib/admin/decisions";
import { deleteHours, hoursAmountSchema, updateHoursAmount } from "@/lib/admin/config";

export const runtime = "nodejs";

const idParam = z.string().uuid();

// PATCH /api/admin/hours/[id] — admin only. Amount-only edit (ADR-13).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!idParam.safeParse(id).success) {
      return err("BAD_REQUEST", "Invalid hours id.", 400);
    }
    const parsed = hoursAmountSchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const row = await updateHoursAmount(getDbOrThrow(), admin, id, parsed.data.amount);
    return NextResponse.json(row);
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin hours amount update failed", e);
    return err("INTERNAL", "Hours update failed.", 500);
  }
}

// DELETE /api/admin/hours/[id] — admin only. Removes one operating_hours
// row + audit. This also removes that day's rate; a court with no rows on a
// day is now CLOSED (ADR-13).
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
