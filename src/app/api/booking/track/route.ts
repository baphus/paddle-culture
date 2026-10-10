import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { bookings } from "@/db/schema";

// Tracking code format: 5 uppercase alphanumeric chars (A-Z0-9)
const TRACKING_CODE_RE = /^[A-Z0-9]{5}$/;

export const dynamic = "force-dynamic";

/**
 * GET /api/booking/track?code=AB3K7
 *
 * Resolves a short tracking code to a tracking token so the client can
 * navigate to /track/[token]. Returns only the token — no booking data.
 * The code is case-insensitive on input (normalised to uppercase server-side).
 */
export async function GET(req: NextRequest) {
  const rawCode = req.nextUrl.searchParams.get("code")?.trim().toUpperCase() ?? "";

  if (!TRACKING_CODE_RE.test(rawCode)) {
    return NextResponse.json(
      { error: "Invalid tracking code format. It should be 5 characters, like AB3K7." },
      { status: 400 },
    );
  }

  let db;
  try {
    db = getDb();
  } catch {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const rows = await db
    .select({ trackingToken: bookings.trackingToken })
    .from(bookings)
    .where(eq(bookings.trackingCode, rawCode))
    .limit(1);

  if (!rows[0]) {
    return NextResponse.json(
      { error: "No booking found with that tracking code. Double-check and try again." },
      { status: 404 },
    );
  }

  return NextResponse.json({ token: rows[0].trackingToken });
}
