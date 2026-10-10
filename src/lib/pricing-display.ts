// Public display-rate helpers — the numbers shown on the landing page and
// used for the booking wizard's client-side ESTIMATE.
//
// Reads are derived from the GLOBAL (court_id NULL) pricing_rules rows only:
// court-specific overrides still apply at submit time via the authoritative
// server recalculation (recalculateTotal in lib/booking/pricing.ts), which
// this file must never duplicate or replace.
//
// Updated: Drizzle ORM replaced with @supabase/supabase-js HTTP client.

import type { Db } from "@/db/client";

export interface DisplayRates {
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
  timeBand: string;
  itemType: string;
  amount: string;
}

function minAmount(rows: PricingRuleInternal[]): number | null {
  let best: number | null = null;
  for (const r of rows) {
    const n = Number(r.amount);
    if (!Number.isFinite(n) || n <= 0) continue;
    best = best === null ? n : Math.min(best, n);
  }
  return best;
}

function pickBand(rows: PricingRuleInternal[], band: string): number | null {
  const exact = minAmount(rows.filter((r) => r.timeBand === band));
  if (exact !== null) return exact;
  return minAmount(rows.filter((r) => r.timeBand === "all"));
}

/**
 * Derive landing display rates from pricing_rules rows.
 * Accepts either camelCase (internal) or snake_case (raw Supabase API) rows.
 */
export function deriveDisplayRates(
  rules: Array<
    | PricingRuleInternal
    | { court_id: string | null; time_band: string; item_type: string; amount: string }
  >,
): DisplayRates | null {
  // Normalise to camelCase
  const normalised: PricingRuleInternal[] = rules.map((r) => {
    if ("courtId" in r) return r as PricingRuleInternal;
    const s = r as { court_id: string | null; time_band: string; item_type: string; amount: string };
    return { courtId: s.court_id, timeBand: s.time_band, itemType: s.item_type, amount: s.amount };
  });

  const global = normalised.filter((r) => r.courtId === null);
  if (global.length === 0) return null;
  const courtRows = global.filter((r) => r.itemType === "court");
  const morning = pickBand(courtRows, "morning");
  const evening = pickBand(courtRows, "evening");
  const paddle = minAmount(global.filter((r) => r.itemType === "paddle"));
  const ball = minAmount(global.filter((r) => r.itemType === "ball"));
  if (morning === null || evening === null || paddle === null || ball === null) {
    return null;
  }
  return { morning, evening, paddle, ball, currency: "PHP" };
}

/** Server helper for RSCs / API routes (landing page). Fail-soft: never throws. */
export async function getDisplayRates(db: Db): Promise<DisplayRates> {
  try {
    const { data, error } = await db
      .from("pricing_rules")
      .select("court_id,time_band,item_type,amount");
    if (error || !data) return FALLBACK_RATES;
    return deriveDisplayRates(data) ?? FALLBACK_RATES;
  } catch {
    return FALLBACK_RATES;
  }
}
