import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { getAvailability } from "@/lib/booking/availability";
import { LaneError, err } from "@/lib/booking/errors";
import { availabilityQuerySchema } from "@/lib/booking/validation";

export const runtime = "nodejs";

// GET /api/availability?date=YYYY-MM-DD&courtId=<uuid>[&courtId=<uuid>...]
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const parsed = availabilityQuerySchema.safeParse({
      date: sp.get("date"),
      courtIds: sp.getAll("courtId"),
    });
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
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
      .in("id", parsed.data.courtIds);
    if (courtError) return err("INTERNAL", "Could not verify courts.", 500);
    if ((courtRows ?? []).length !== parsed.data.courtIds.length) {
      return err("UNKNOWN_COURT", "One or more courts do not exist.", 404);
    }
    const courtsAvail = await getAvailability(db, parsed.data);
    return NextResponse.json({ date: parsed.data.date, courts: courtsAvail });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("availability failed", e);
    return err("INTERNAL", "Availability check failed.", 500);
  }
}
