import { NextResponse } from "next/server";
import { z } from "zod";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { getDbOrThrow } from "@/lib/admin/decisions";
import { courtStatusSchema, setCourtStatus } from "@/lib/admin/config";

export const runtime = "nodejs";

const idParam = z.string().uuid();

// PATCH /api/admin/courts/[id] — admin only. Flips active/inactive + audit
// row. Deactivation hides the court from booking; history rows keep working
// (slots join by id, never filtered by status).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!idParam.safeParse(id).success) {
      return err("BAD_REQUEST", "Invalid court id.", 400);
    }
    const parsed = courtStatusSchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const row = await setCourtStatus(getDbOrThrow(), admin, id, parsed.data.status);
    return NextResponse.json(row);
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin courts status failed", e);
    return err("INTERNAL", "Court update failed.", 500);
  }
}
