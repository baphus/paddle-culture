import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getCalendarBookings } from "@/lib/admin/calendar";
import { listClosures } from "@/lib/admin/config";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";

export const runtime = "nodejs";

// GET /api/admin/calendar/events?year=YYYY&month=M — admin-only.
// Returns one month's calendar events + closures for the on-demand client cache.
export async function GET(request: Request) {
  try {
    await requireAdmin();

    const url = new URL(request.url);
    const yearStr = url.searchParams.get("year");
    const monthStr = url.searchParams.get("month");

    if (
      !yearStr ||
      !monthStr ||
      !/^\d{4}$/.test(yearStr) ||
      !/^\d{1,2}$/.test(monthStr)
    ) {
      return err("BAD_REQUEST", "year (YYYY) and month (1-12) are required.", 400);
    }

    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    if (month < 1 || month > 12) {
      return err("BAD_REQUEST", "month must be between 1 and 12.", 400);
    }

    const db = getDb();
    const [events, closures] = await Promise.all([
      getCalendarBookings(db, year, month),
      listClosures(db),
    ]);

    return NextResponse.json({ events, closures });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin calendar events fetch failed", e);
    return err("INTERNAL", "Failed to fetch calendar events.", 500);
  }
}
