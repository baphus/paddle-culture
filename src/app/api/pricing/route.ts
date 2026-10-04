import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { pricingRules } from "@/db/schema";
import { deriveDisplayRates, FALLBACK_RATES } from "@/lib/pricing-display";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/pricing — CUSTOMER-facing, unauthenticated, read-only.
// Returns the live display rate card { morning, evening, paddle, ball,
// currency: 'PHP' } derived from the GLOBAL (court_id NULL) pricing_rules
// rows. Landing + booking estimate consume this; the submit total stays
// server-authoritative (recalculateTotal) and never trusts these numbers.
// Fail-soft: on NOT_CONFIGURED/empty/error returns the frozen fallback with
// an X-Pricing-Fallback: 1 header so clients know it's stale copy.
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
    const rows = await db.select().from(pricingRules);
    const rates = deriveDisplayRates(rows);
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
