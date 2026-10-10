import type { Db } from "@/db/client";
import { LaneError } from "./errors";
import { dayTypeFor, timeBandFor } from "./slots";

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

function toCentavos(amount: string): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) throw new Error(`bad amount ${amount}`);
  return Math.round(n * 100);
}

function fromCentavos(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Pick the best pricing_rules row for (court, dayType, timeBand, itemType).
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
 * Server-side total recalculation (ADR-03).
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
    .select("id,court_id,day_type,time_band,item_type,unit,amount");

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

  const lines: TotalLine[] = [];
  let cents = 0;

  for (const slot of input.slots) {
    const dayType = dayTypeFor(slot.start);
    const timeBand = timeBandFor(slot.start);
    const rule = pickRule(rules, slot.courtId, dayType, timeBand, "court");
    if (!rule) {
      throw new LaneError(
        "PRICING_NOT_CONFIGURED",
        `No court rate for court ${slot.courtId} (${dayType}/${timeBand}).`,
        503,
      );
    }
    const unit = toCentavos(rule.amount);
    cents += unit;
    lines.push({
      kind: "court",
      courtId: slot.courtId,
      detail: `${dayType}/${timeBand} @ ${slot.start.toISOString()}`,
      unitAmount: rule.amount,
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
    const lineCents = toCentavos(rule.amount) * input.paddleQty * hours;
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
    const lineCents = toCentavos(rule.amount);
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
