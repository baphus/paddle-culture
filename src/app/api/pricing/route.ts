import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { deriveDisplayRates, FALLBACK_RATES, type CourtHourRate } from "@/lib/pricing-display";

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
    const [rulesRes, hoursRes] = await Promise.all([
      db.from("pricing_rules").select("court_id,item_type,amount"),
      db.from("operating_hours").select("court_id,day_of_week,open_time,close_time,amount"),
    ]);
    if (rulesRes.error || !rulesRes.data || hoursRes.error || !hoursRes.data) {
      return NextResponse.json(FALLBACK_RATES, {
        headers: { ...headers, "X-Pricing-Fallback": "1" },
      });
    }
    const courtRates = hoursRes.data
      .filter((row: { amount: string | null }) => row.amount !== null)
      .map((row: {
        court_id: string;
        day_of_week: number;
        open_time: string;
        close_time: string;
        amount: string;
      }) => ({
        courtId: row.court_id,
        dayOfWeek: row.day_of_week,
        openTime: row.open_time,
        closeTime: row.close_time,
        amount: Number(row.amount),
      }))
      .filter((row: CourtHourRate) => Number.isFinite(row.amount) && row.amount > 0);
    const rates = deriveDisplayRates(
      rulesRes.data.map((r: {
        court_id: string | null; item_type: string; amount: string;
      }) => ({
        courtId: r.court_id,
        itemType: r.item_type,
        amount: r.amount,
      })),
      hoursRes.data.map((h: { amount: string | null }) => ({ amount: h.amount })),
      courtRates,
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
