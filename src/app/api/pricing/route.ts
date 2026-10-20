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
    const [rulesRes, hoursRes] = await Promise.all([
      db.from("pricing_rules").select("court_id,item_type,amount"),
      db.from("operating_hours").select("amount"),
    ]);
    if (rulesRes.error || !rulesRes.data || hoursRes.error || !hoursRes.data) {
      return NextResponse.json(FALLBACK_RATES, {
        headers: { ...headers, "X-Pricing-Fallback": "1" },
      });
    }
    const rates = deriveDisplayRates(
      rulesRes.data.map((r: {
        court_id: string | null; item_type: string; amount: string;
      }) => ({
        courtId: r.court_id,
        itemType: r.item_type,
        amount: r.amount,
      })),
      hoursRes.data.map((h: { amount: string | null }) => ({ amount: h.amount })),
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
