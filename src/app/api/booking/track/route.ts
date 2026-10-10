import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";

const TRACKING_CODE_RE = /^[A-Z0-9]{5}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const dynamic = "force-dynamic";

/**
 * GET /api/booking/track?code=AB3K7&email=customer@example.com
 *
 * The code alone is 5 chars over a 36-alphabet (~60M values), so it must not
 * be a single-factor look-up for a full name, phone-less booking record. The
 * email the customer typed at booking time is the second factor (ADR-07).
 */
export async function GET(req: NextRequest) {
  const rawCode = req.nextUrl.searchParams.get("code")?.trim().toUpperCase() ?? "";
  const rawEmail = req.nextUrl.searchParams.get("email")?.trim() ?? "";

  if (!TRACKING_CODE_RE.test(rawCode)) {
    return NextResponse.json(
      { error: "Invalid tracking code format. It should be 5 characters, like AB3K7." },
      { status: 400 },
    );
  }

  if (!EMAIL_RE.test(rawEmail)) {
    return NextResponse.json(
      { error: "Enter the email address you used to book." },
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
    .select("tracking_token,email")
    .eq("tracking_code", rawCode)
    .limit(1)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "No booking found with that tracking code and email. Double-check and try again." },
      { status: 404 },
    );
  }

  const row = data as { tracking_token: string; email: string };

  // Same-address, different case must still match, but nothing else should.
  if (row.email.trim().toLowerCase() !== rawEmail.toLowerCase()) {
    return NextResponse.json(
      { error: "No booking found with that tracking code and email. Double-check and try again." },
      { status: 404 },
    );
  }

  return NextResponse.json({ token: row.tracking_token });
}
