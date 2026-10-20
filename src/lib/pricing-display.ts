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
import { manilaParts } from "@/lib/booking/slots";

export interface DisplayRates {
  /** Legacy aggregate values retained for offline fallback compatibility. */
  morning: number;
  evening: number;
  paddle: number;
  ball: number;
  /** Court rates configured by admin on operating-hours rows. */
  courtRates: CourtHourRate[];
  currency: "PHP";
}

export interface CourtHourRate {
  courtId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  amount: number;
}

/** Frozen fallback — used ONLY when the DB is unreachable/empty. */
export const FALLBACK_RATES: DisplayRates = {
  morning: 150,
  evening: 200,
  paddle: 100,
  ball: 15,
  courtRates: [],
  currency: "PHP",
};

/** Total paddle rental for the selected quantity and booked hours. */
export function calculatePaddleRentalTotal(
  hourlyRate: number,
  paddleQty: number,
  hoursBooked: number,
): number {
  return hourlyRate * paddleQty * hoursBooked;
}

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

function minutesOfWall(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return (hour as number) * 60 + (minute as number);
}

function rateCoversHour(rate: CourtHourRate, hour: number): boolean {
  const open = minutesOfWall(rate.openTime);
  const close = minutesOfWall(rate.closeTime);
  const end = close <= open ? close + 1440 : close;
  const at = hour * 60;
  return (at >= open && at < end) || (at + 1440 >= open && at + 1440 < end);
}

/** Find the admin-configured rate for one court slot. */
export function courtRateForSlot(
  rates: DisplayRates,
  courtId: string | undefined,
  slot: Date,
): CourtHourRate | null {
  if (!courtId) return null;
  const { day, hour } = manilaParts(slot);
  return (
    rates.courtRates.find(
      (rate) =>
        rate.courtId === courtId &&
        rate.dayOfWeek === day &&
        rateCoversHour(rate, hour),
    ) ?? null
  );
}

export function courtRateLabel(rate: CourtHourRate): string {
  const format = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    const suffix = (hour as number) < 12 ? "AM" : "PM";
    const h12 = (hour as number) % 12 === 0 ? 12 : (hour as number) % 12;
    return `${h12}:${String(minute).padStart(2, "0")} ${suffix}`;
  };
  return `${format(rate.openTime)}-${format(rate.closeTime)}`;
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
  courtRates: CourtHourRate[] = [],
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
  return { morning: from, evening: from, paddle, ball, courtRates, currency: "PHP" };
}

/** Server helper for RSCs / API routes (landing page). Fail-soft: never throws. */
export async function getDisplayRates(db: Db): Promise<DisplayRates> {
  try {
    const [rulesRes, hoursRes] = await Promise.all([
      db.from("pricing_rules").select("court_id,item_type,amount"),
      db.from("operating_hours").select("court_id,day_of_week,open_time,close_time,amount"),
    ]);
    if (rulesRes.error || !rulesRes.data) return FALLBACK_RATES;
    if (hoursRes.error || !hoursRes.data) return FALLBACK_RATES;
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
    return deriveDisplayRates(rulesRes.data, hoursRes.data, courtRates) ?? FALLBACK_RATES;
  } catch {
    return FALLBACK_RATES;
  }
}
