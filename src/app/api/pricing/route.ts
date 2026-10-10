import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { deriveDisplayRates, FALLBACK_RATES } from "@/lib/pricing-display";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/pricing — CUSTOMER-facing, unauthenticated, read-only.
export async function GET() {
  const headers: Record<string, string> = {
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
  };
  try {
    let db;
    try {
      db = getDb();
    } catch {
      return NextResponse.json(FALLBACK_RATES, {
        headers: { ...headers, "X-Pricing-Fallback": "1" },
      });
    }
    const { data, error } = await db.from("pricing_rules").select("*");
    if (error || !data) {
      return NextResponse.json(FALLBACK_RATES, {
        headers: { ...headers, "X-Pricing-Fallback": "1" },
      });
    }
    // Map snake_case API response back to the shape deriveDisplayRates expects
    // (which was previously a Drizzle select — snake_case columns).
    const rates = deriveDisplayRates(
      data.map((r: {
        id: string; court_id: string | null; day_type: string;
        time_band: string; item_type: string; unit: string; amount: string;
      }) => ({
        id: r.id,
        courtId: r.court_id,
        dayType: r.day_type,
        timeBand: r.time_band,
        itemType: r.item_type,
        unit: r.unit,
        amount: r.amount,
      })),
    );
    if (!rates) {
      return NextResponse.json(FALLBACK_RATES, {
        headers: { ...headers, "X-Pricing-Fallback": "1" },
      });
    }
    return NextResponse.json(rates, { headers });
  } catch (e) {
    console.error("pricing failed", e);
    return NextResponse.json(FALLBACK_RATES, {
      headers: { ...headers, "X-Pricing-Fallback": "1" },
    });
  }
}
