import type { Db } from "@/db/client";
import { pricingRules, type PricingRule } from "@/db/schema";
import { LaneError } from "./errors";
import { dayTypeFor, timeBandFor } from "./slots";

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
 * Chain (each tried court-specific first, then global court_id NULL):
 *   exact → (day,'all') → ('all',band) → ('all','all').
 * Throws PRICING_NOT_CONFIGURED when nothing matches — fail closed, never
 * trust a client total (ADR-03).
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
 * Server-side total recalculation (ADR-03). Court rate is per slot-hour;
 * paddle rate is per paddle per hour (hours default to slot count); ball
 * fee is one-time. All money math in integer centavos.
 */
export async function recalculateTotal(
  db: Db,
  input: RecalcInput,
): Promise<{ total: string; lines: TotalLine[] }> {
  if (input.slots.length === 0) {
    throw new LaneError("NO_SLOTS", "No slots to price.", 422);
  }
  const rules = await db.select().from(pricingRules);
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
    // Cross-check (closes the "24 paddle-hours on a 1-slot booking" gap):
    // paddle hours can never exceed the booked slot count. Fail closed —
    // never silently clamp a client claim (ADR-03).
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
