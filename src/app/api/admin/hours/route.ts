import { NextResponse } from "next/server";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { getDbOrThrow } from "@/lib/admin/decisions";
import { createHours, hoursCreateSchema } from "@/lib/admin/config";

export const runtime = "nodejs";

// POST /api/admin/hours — admin only. Adds one operating_hours row + audit.
// Rows for the same (court, day) act as a UNION in isSlotOpen; a court with
// zero rows defaults to OPEN (see /admin/hours banner).
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const parsed = hoursCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const row = await createHours(getDbOrThrow(), admin, parsed.data);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin hours create failed", e);
    return err("INTERNAL", "Hours creation failed.", 500);
  }
}
