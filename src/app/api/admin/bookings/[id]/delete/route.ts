import { NextResponse } from "next/server";
import { z } from "zod";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { deleteBooking, getDbOrThrow } from "@/lib/admin/decisions";

export const runtime = "nodejs";

const idParam = z.string().uuid();

// POST /api/admin/bookings/[id]/delete — admin only, permanent. Removes the
// booking and its dependent rows atomically and writes a booking.delete audit
// snapshot. Idempotent: deleting an already-gone booking returns deleted:false.
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
    const result = await deleteBooking(getDbOrThrow(), admin, id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("delete booking failed", e);
    return err("INTERNAL", "Delete failed.", 500);
  }
}
