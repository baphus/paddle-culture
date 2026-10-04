// Public display-rate helpers — the numbers shown on the landing page and
// used for the booking wizard's client-side ESTIMATE.
//
// Reads are derived from the GLOBAL (court_id NULL) pricing_rules rows only:
// court-specific overrides still apply at submit time via the authoritative
// server recalculation (recalculateTotal in lib/booking/pricing.ts), which
// this file must never duplicate or replace.
//
// Client-safe: this module has NO runtime server imports. The `Db` type is
// imported type-only (erased at build) and the `pricingRules` table object
// comes from drizzle-orm/pg-core (pure JS, browser-safe) — so client
// components (booking-flow estimate) can import FALLBACK_RATES / peso
// without pulling postgres-js (node-only) into the browser bundle. Server
// callers pass the lazy getDb() database into getDisplayRates(db).

import { pricingRules, type PricingRule } from "@/db/schema";
import type { Db } from "@/db/client";

export interface DisplayRates {
  morning: number;
  evening: number;
  paddle: number;
  ball: number;
  currency: "PHP";
}

/** Frozen fallback — used ONLY when the DB is unreachable/empty (build time,
 *  outage, or PRICING_NOT_CONFIGURED). Matches the seeded rate card:
 *  morning ₱150 (06:00–18:00), evening ₱200 (18:00–03:00),
 *  paddle ₱25/paddle/hour, ball ₱15 flat per booking. */
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

/** "₱150" — landing display formatting (not the booking total format). */
export function peso(n: number): string {
  return `₱${formatAmount(n)}`;
}

function minAmount(rows: PricingRule[]): number | null {
  let best: number | null = null;
  for (const r of rows) {
    const n = Number(r.amount);
    if (!Number.isFinite(n) || n <= 0) continue;
    best = best === null ? n : Math.min(best, n);
  }
  return best;
}

/** Exact time_band first, then the 'all' band; min() wins on multiples
 *  (e.g. weekday + weekend duplicates — rates are uniform across days). */
function pickBand(rows: PricingRule[], band: string): number | null {
  const exact = minAmount(rows.filter((r) => r.timeBand === band));
  if (exact !== null) return exact;
  return minAmount(rows.filter((r) => r.timeBand === "all"));
}

/**
 * Derive landing display rates from pricing_rules rows. Global
 * (court_id NULL) rows only; court-specific rows are ignored here on
 * purpose — they still apply at submit via recalculateTotal.
 * Returns null when any of the four display rates is missing (fail-soft
 * callers fall back to FALLBACK_RATES; submit stays fail-closed).
 */
export function deriveDisplayRates(rules: PricingRule[]): DisplayRates | null {
  const global = rules.filter((r) => r.courtId === null);
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

/** Server helper for RSCs / API routes (landing page). Fail-soft: never throws.
 *  Takes the lazy getDb() database as a param so this module stays
 *  client-safe (see note at top). */
export async function getDisplayRates(db: Db): Promise<DisplayRates> {
  try {
    const rows = await db.select().from(pricingRules);
    return deriveDisplayRates(rows) ?? FALLBACK_RATES;
  } catch {
    return FALLBACK_RATES;
  }
}
