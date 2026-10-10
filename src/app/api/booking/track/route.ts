import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";

const TRACKING_CODE_RE = /^[A-Z0-9]{5}$/;

export const dynamic = "force-dynamic";

/**
 * GET /api/booking/track?code=AB3K7
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

  const { data, error } = await db
    .from("bookings")
    .select("tracking_token")
    .eq("tracking_code", rawCode)
    .limit(1)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "No booking found with that tracking code. Double-check and try again." },
      { status: 404 },
    );
  }

  return NextResponse.json({ token: (data as { tracking_token: string }).tracking_token });
}
