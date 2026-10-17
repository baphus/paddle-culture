import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import {
  datesInMonth,
  getAvailabilityForInstants,
  groupByDate,
} from "@/lib/booking/availability";
import { LaneError, err } from "@/lib/booking/errors";
import { maxBookableDateStr, slotsForDate, type SlotInstant } from "@/lib/booking/slots";
import { availabilityMonthQuerySchema } from "@/lib/booking/validation";

export const runtime = "nodejs";

// GET /api/availability/month?month=YYYY-MM&courtId=<uuid>[&courtId=<uuid>...]
//
// One request covers the whole month: the slot grid is pure arithmetic and
// hours/closures load by range, so this is 5 DB calls per month instead of 5
// per day. Past dates are included (they come back non-bookable) so the client
// cache is a plain lookup with no gap handling.
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const parsed = availabilityMonthQuerySchema.safeParse({
      month: sp.get("month"),
      courtIds: sp.getAll("courtId"),
    });
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const { month, courtIds } = parsed.data;

    // Reject a month that starts past the 12-month horizon — nothing in it can
    // be booked, so the client should never ask for it.
    if (`${month}-01` > maxBookableDateStr()) {
      return err("BAD_REQUEST", "That month is outside the booking window.", 400);
    }

    let db;
    try {
      db = getDb();
    } catch {
      return err("NOT_CONFIGURED", "Database is not configured.", 500);
    }

    // Verify all requested courts exist
    const { data: courtRows, error: courtError } = await db
      .from("courts")
      .select("id")
      .in("id", courtIds);
    if (courtError) return err("INTERNAL", "Could not verify courts.", 500);
    if ((courtRows ?? []).length !== courtIds.length) {
      return err("UNKNOWN_COURT", "One or more courts do not exist.", 404);
    }

    const instants: SlotInstant[] = datesInMonth(month).flatMap((d) => slotsForDate(d));
    const perCourt = await getAvailabilityForInstants(db, { instants, courtIds });

    return NextResponse.json({
      month,
      courts: courtIds,
      days: groupByDate(month, courtIds, perCourt),
    });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("month availability failed", e);
    return err("INTERNAL", "Availability check failed.", 500);
  }
}
