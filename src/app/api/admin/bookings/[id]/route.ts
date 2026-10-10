import { NextResponse } from "next/server";
import { z } from "zod";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { getBookingById } from "@/lib/admin/bookings";
import { getDbOrThrow } from "@/lib/admin/decisions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idParam = z.string().uuid();

// GET /api/admin/bookings/[id] — admin only. Returns full BookingDetail.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    if (!idParam.safeParse(id).success) {
      return err("BAD_REQUEST", "Invalid booking id.", 400);
    }
    const booking = await getBookingById(getDbOrThrow(), id);
    if (!booking) return err("NOT_FOUND", "Booking not found.", 404);
    return NextResponse.json(booking);
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("[GET /api/admin/bookings/[id]]", e);
    return err("INTERNAL", "Unexpected error.", 500);
  }
}
