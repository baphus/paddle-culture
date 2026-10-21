import type { Db } from "@/db/client";
import { LaneError } from "./errors";
import { dayTypeFor, manilaParts, timeBandFor } from "./slots";
import { dayName } from "./windows";

// All Drizzle ORM imports replaced with @supabase/supabase-js HTTP client.

export interface PricedSlot {
  courtId: string;
  start: Date;
}

export interface RecalcInput {
  slots: PricedSlot[];
  paddleQty: number;
  paddleHours: number | null | undefined;
  ball: boolean;
}

export interface TotalLine {
  kind: "court" | "paddle" | "ball";
  courtId: string | null;
  detail: string;
  unitAmount: string;
  qty: number;
  amount: string;
}

interface PricingRule {
  id: string;
  courtId: string | null;
  dayType: string;
  timeBand: string;
  itemType: string;
  unit: string;
  amount: string;
}

/** An operating_hours row (ADR-13). Court pricing's only source. */
interface HoursRateRow {
  id: string;
  courtId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  amount: string | null;
}

function minutesOfWall(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h as number) * 60 + (m as number);
}

/** True when `hour` falls inside this row on its configured weekday. */
function hourInRow(hour: number, row: HoursRateRow): boolean {
  const open = minutesOfWall(row.openTime);
  const close = minutesOfWall(row.closeTime);
  const end = close <= open ? close + 1440 : close;
  const at = hour * 60;
  return at >= open && at < end;
}

/** "6:00 AM–12:00 PM" — the detail label for a priced hours row. */
function rateRangeLabel(row: HoursRateRow): string {
  const fmt = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    const suffix = (h as number) < 12 ? "AM" : "PM";
    const h12 = (h as number) % 12 === 0 ? 12 : (h as number) % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
  };
  return `${fmt(row.openTime)}–${fmt(row.closeTime)}`;
}

function toCentavos(amount: string): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) throw new Error(`bad amount ${amount}`);
  return Math.round(n * 100);
}

/**
 * Wrap a row amount for pricing math. A malformed `amount` in the DB is a
 * data/config fault the owner must fix — not a "no rate configured" case. We
 * surface it as PRICE_INVALID (500) so the error text points at the row
 * instead of telling the customer to try again.
 */
function amountOrThrow(id: string, amount: string): number {
  try {
    return toCentavos(amount);
  } catch {
    throw new LaneError(
      "PRICE_INVALID",
      `Pricing row ${id} has a non-numeric amount (${JSON.stringify(amount)}). Fix it in the admin pricing page.`,
      500,
    );
  }
}

function fromCentavos(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Pick the best pricing_rules band row for (court, dayType, timeBand, itemType).
 * Paddle/ball only — court slots are priced by operating_hours.amount.
 */
function pickRule(
  rules: PricingRule[],
  courtId: string,
  dayType: string,
  timeBand: string,
  itemType: string,
): PricingRule | null {
  const bandFallbacks: Array<[string, string]> = [
    [dayType, timeBand],
    [dayType, "all"],
    ["all", timeBand],
    ["all", "all"],
  ];
  for (const [d, b] of bandFallbacks) {
    const scoped = rules.find(
      (r) =>
        r.courtId === courtId &&
        r.dayType === d &&
        r.timeBand === b &&
        r.itemType === itemType,
    );
    if (scoped) return scoped;
    const global = rules.find(
      (r) =>
        r.courtId === null &&
        r.dayType === d &&
        r.timeBand === b &&
        r.itemType === itemType,
    );
    if (global) return global;
  }
  return null;
}

/**
 * Server-side total recalculation (ADR-03). Court slots are priced by the
 * operating_hours row that covers them (ADR-13): one row = one rate, per court
 * only, no global fallback. No covering row means the court is closed then;
 * a NULL amount means the rate is not configured yet. Both are 503s.
 */
export async function recalculateTotal(
  db: Db,
  input: RecalcInput,
): Promise<{ total: string; lines: TotalLine[] }> {
  if (input.slots.length === 0) {
    throw new LaneError("NO_SLOTS", "No slots to price.", 422);
  }

  const { data, error } = await db
    .from("pricing_rules")
    .select("id,court_id,day_type,time_band,item_type,unit,amount")
    .order("id", { ascending: true });

  if (error) throw new LaneError("DB_ERROR", error.message, 500);

  const rules: PricingRule[] = (data ?? []).map((r) => ({
    id: r.id,
    courtId: r.court_id,
    dayType: r.day_type,
    timeBand: r.time_band,
    itemType: r.item_type,
    unit: r.unit,
    amount: r.amount,
  }));

  const { data: hourData, error: hoursError } = await db
    .from("operating_hours")
    .select("id,court_id,day_of_week,open_time,close_time,amount")
    .order("id", { ascending: true });

  if (hoursError) throw new LaneError("DB_ERROR", hoursError.message, 500);

  const hours: HoursRateRow[] = (hourData ?? []).map((r) => ({
    id: r.id,
    courtId: r.court_id,
    dayOfWeek: r.day_of_week,
    openTime: r.open_time,
    closeTime: r.close_time,
    amount: r.amount === null ? null : String(r.amount),
  }));

  const lines: TotalLine[] = [];
  let cents = 0;

  for (const slot of input.slots) {
    const { day, hour } = manilaParts(slot.start);
    const previousDay = (day + 6) % 7;
    const scopedHours = hours.filter((r) => r.courtId === slot.courtId);
    const match =
      scopedHours.find((r) => r.dayOfWeek === day && hourInRow(hour, r)) ??
      scopedHours.find((r) => {
        if (r.dayOfWeek !== previousDay) return false;
        const open = minutesOfWall(r.openTime);
        const close = minutesOfWall(r.closeTime);
        // A previous day's overnight range carries its rate through its
        // closing hour after midnight, matching isSlotOpen.
        return close <= open && hour * 60 < close;
      });
    if (!match) {
      throw new LaneError(
        "PRICING_NOT_CONFIGURED",
        `No court rate for court ${slot.courtId} (${String(hour).padStart(2, "0")}:00) — court is not open at this day/time.`,
        503,
      );
    }
    if (match.amount === null) {
      throw new LaneError(
        "PRICING_NOT_CONFIGURED",
        `No court rate configured yet for ${dayName(match.dayOfWeek)} ${rateRangeLabel(match)}.`,
        503,
      );
    }
    const unit = amountOrThrow(match.id, match.amount);
    cents += unit;
    lines.push({
      kind: "court",
      courtId: slot.courtId,
      detail: `${rateRangeLabel(match)} @ ${slot.start.toISOString()}`,
      unitAmount: match.amount,
      qty: 1,
      amount: fromCentavos(unit),
    });
  }

  if (input.paddleQty > 0) {
    if (input.paddleHours != null && input.paddleHours > input.slots.length) {
      throw new LaneError(
        "INVALID_PADDLE_HOURS",
        `Paddle hours (${input.paddleHours}) cannot exceed booked hours (${input.slots.length}).`,
        422,
      );
    }
    const first = input.slots[0] as PricedSlot;
    const rule = pickRule(
      rules,
      first.courtId,
      dayTypeFor(first.start),
      timeBandFor(first.start),
      "paddle",
    );
    if (!rule) {
      throw new LaneError(
        "PRICING_NOT_CONFIGURED",
        "Paddle rental requested but no paddle rate is configured.",
        503,
      );
    }
    const hours = input.paddleHours ?? input.slots.length;
    const lineCents = amountOrThrow(rule.id, rule.amount) * input.paddleQty * hours;
    cents += lineCents;
    lines.push({
      kind: "paddle",
      courtId: null,
      detail: `${input.paddleQty} paddle(s) x ${hours}h`,
      unitAmount: rule.amount,
      qty: input.paddleQty * hours,
      amount: fromCentavos(lineCents),
    });
  }

  if (input.ball) {
    const first = input.slots[0] as PricedSlot;
    const rule = pickRule(
      rules,
      first.courtId,
      dayTypeFor(first.start),
      timeBandFor(first.start),
      "ball",
    );
    if (!rule) {
      throw new LaneError(
        "PRICING_NOT_CONFIGURED",
        "Ball requested but no ball fee is configured.",
        503,
      );
    }
    const lineCents = amountOrThrow(rule.id, rule.amount);
    cents += lineCents;
    lines.push({
      kind: "ball",
      courtId: null,
      detail: "one-time ball fee",
      unitAmount: rule.amount,
      qty: 1,
      amount: fromCentavos(lineCents),
    });
  }

  return { total: fromCentavos(cents), lines };
}
