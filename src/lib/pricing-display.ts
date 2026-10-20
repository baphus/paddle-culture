// Public display-rate helpers — the numbers shown on the landing page and
// used for the booking wizard's client-side ESTIMATE.
//
// Court rates are derived from operating_hours.amount (ADR-13): the raw hours
// rows ARE the schedule, so the landing "from" price is the minimum non-NULL
// amount across all of a court's rows. The DB remains authoritative: submit
// time running recalculateTotal in lib/booking/pricing.ts is the price.
// Paddle/ball still come from the global pricing_rules band rows.
//
// Updated: Drizzle ORM replaced with @supabase/supabase-js HTTP client.

import type { Db } from "@/db/client";

export interface DisplayRates {
  /** "From" hourly court rate; equal to `evening` because windows are per-hour. */
  morning: number;
  evening: number;
  paddle: number;
  ball: number;
  currency: "PHP";
}

/** Frozen fallback — used ONLY when the DB is unreachable/empty. */
export const FALLBACK_RATES: DisplayRates = {
  morning: 150,
  evening: 200,
  paddle: 25,
  ball: 15,
  currency: "PHP",
};

/** "150" | "150.5" | "150.55" — trims trailing zeros for display copy. */
export function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const fixed = n.toFixed(2);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/** "₱150" — landing display formatting. */
export function peso(n: number): string {
  return `₱${formatAmount(n)}`;
}

// Internal shape used inside this module (camelCase, normalised from API response)
interface PricingRuleInternal {
  courtId: string | null;
  itemType: string;
  amount: string;
}

function minAmount(rows: Array<{ amount: string | null }>): number | null {
  let best: number | null = null;
  for (const r of rows) {
    if (r.amount === null) continue;
    const n = Number(r.amount);
    if (!Number.isFinite(n) || n <= 0) continue;
    best = best === null ? n : Math.min(best, n);
  }
  return best;
}

/**
 * Derive landing display rates from operating_hours.amount + pricing_rules
 * rows. Returns null ("rates pending") when no court rate or rental rate exists.
 */
export function deriveDisplayRates(
  rules: Array<
    | PricingRuleInternal
    | { court_id: string | null; item_type: string; amount: string }
  >,
  hours: Array<{ amount: string | null }>,
): DisplayRates | null {
  const normalised: PricingRuleInternal[] = rules.map((r) => {
    if ("courtId" in r) return r as PricingRuleInternal;
    const s = r as { court_id: string | null; item_type: string; amount: string };
    return { courtId: s.court_id, itemType: s.item_type, amount: s.amount };
  });

  const global = normalised.filter((r) => r.courtId === null);
  const from = minAmount(hours);
  const paddle = minAmount(global.filter((r) => r.itemType === "paddle"));
  const ball = minAmount(global.filter((r) => r.itemType === "ball"));
  if (from === null || paddle === null || ball === null) {
    return null;
  }
  return { morning: from, evening: from, paddle, ball, currency: "PHP" };
}

/** Server helper for RSCs / API routes (landing page). Fail-soft: never throws. */
export async function getDisplayRates(db: Db): Promise<DisplayRates> {
  try {
    const [rulesRes, hoursRes] = await Promise.all([
      db.from("pricing_rules").select("court_id,item_type,amount"),
      db.from("operating_hours").select("amount"),
    ]);
    if (rulesRes.error || !rulesRes.data) return FALLBACK_RATES;
    if (hoursRes.error || !hoursRes.data) return FALLBACK_RATES;
    return deriveDisplayRates(rulesRes.data, hoursRes.data) ?? FALLBACK_RATES;
  } catch {
    return FALLBACK_RATES;
  }
}
