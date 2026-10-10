import { TZDate } from "@date-fns/tz";
import { addHours } from "date-fns";
import {
  DAY_START_HOUR_MANILA,
  MANILA_TZ,
  SLOT_COUNT,
} from "./constants";

export interface SlotInstant {
  index: number;
  /** Slot start as a Date (instant; serializes to ISO UTC on the wire). */
  start: Date;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * All 21 slot-start instants for a Manila selection date (YYYY-MM-DD).
 * Mapping is explicit Asia/Manila wall time via TZDate — never browser-local
 * math. Manila is UTC+8 with no DST, so hour arithmetic is exact.
 */
export function slotsForDate(dateStr: string): SlotInstant[] {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new TZDate(
    `${y}-${pad(m as number)}-${pad(d as number)}T${pad(DAY_START_HOUR_MANILA)}:00:00`,
    MANILA_TZ,
  );
  const out: SlotInstant[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    out.push({ index: i, start: addHours(base, i) });
  }
  return out;
}

/** Manila wall-clock parts of an instant (day: 0=Sunday..6=Saturday). */
export function manilaParts(instant: Date): { day: number; hour: number } {
  const z = new TZDate(instant, MANILA_TZ);
  return { day: z.getDay(), hour: z.getHours() };
}

/** Manila calendar date (YYYY-MM-DD) containing an instant. */
export function manilaDateStr(instant: Date): string {
  const z = new TZDate(instant, MANILA_TZ);
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

/**
 * Selection (offer) date for an instant. The operating day runs
 * 06:00→03:00+1d Manila, so instants before 06:00 wall time belong to the
 * previous selection date's 21-slot grid.
 */
export function selectionDateStr(instant: Date): string {
  const z = new TZDate(instant, MANILA_TZ);
  if (z.getHours() < DAY_START_HOUR_MANILA) {
    const prev = new TZDate(z);
    prev.setDate(prev.getDate() - 1);
    return `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(prev.getDate())}`;
  }
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

/**
 * True when an instant sits exactly on the hourly slot grid of its Manila
 * selection date (whole hour, one of the 21 slots starting 06:00).
 * Overnight slots 00:00–02:00 belong to the previous selection date's grid,
 * so the previous Manila day's 06:00 base is tried as a fallback.
 */
export function isOnSlotGrid(instant: Date): boolean {
  const z = new TZDate(instant, MANILA_TZ);
  if (z.getMinutes() !== 0 || z.getSeconds() !== 0 || z.getMilliseconds() !== 0) {
    return false;
  }
  const base = new TZDate(
    `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}T${pad(DAY_START_HOUR_MANILA)}:00:00`,
    MANILA_TZ,
  );
  const diffHours = (z.getTime() - base.getTime()) / 3_600_000;
  if (Number.isInteger(diffHours) && diffHours >= 0 && diffHours < SLOT_COUNT) {
    return true;
  }
  // Overnight spill: 00:00–02:00 wall time belongs to the previous
  // selection date's 06:00→03:00+1d grid.
  const sel = selectionDateStr(instant);
  const selBase = new TZDate(
    `${sel}T${pad(DAY_START_HOUR_MANILA)}:00:00`,
    MANILA_TZ,
  );
  if (selBase.getTime() === base.getTime()) return false;
  const prevDiffHours = (z.getTime() - selBase.getTime()) / 3_600_000;
  return (
    Number.isInteger(prevDiffHours) &&
    prevDiffHours >= 0 &&
    prevDiffHours < SLOT_COUNT
  );
}

/** Only future slots are bookable (ADR-03; same-day allowed if in future). */
export function isFutureSlot(start: Date, now: Date = new Date()): boolean {
  return start.getTime() > now.getTime();
}

// 12-month rolling booking window (ADR-03). The client calendar enforces the
// same window, but a client-side max date is a hint, not a rule — the server
// must reject far-future slot starts itself, otherwise a hand-crafted
// POST /api/holds books 2035.
export const BOOKING_HORIZON_MONTHS = 12;

/** Last instant a customer may still book. */
export function maxBookableInstant(now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() + BOOKING_HORIZON_MONTHS);
  return d;
}

/** Max selectable date (YYYY-MM-DD, Manila) — the client calendar's ceiling. */
export function maxBookableDateStr(now: Date = new Date()): string {
  return manilaDateStr(maxBookableInstant(now));
}

/** True when a slot start sits inside the 12-month bookable window. */
export function isWithinBookingHorizon(start: Date, now: Date = new Date()): boolean {
  return start.getTime() <= maxBookableInstant(now).getTime();
}

// --- Pricing vocabulary derivation (documented assumptions) ---
// pricing_rules rows are matched on (day_type, time_band, item_type) with a
// court-specific → global fallback chain (see pricing.ts). The admin
// pricing lane owns the vocabulary; these derivations must stay in sync
// with whatever the admin UI writes:
//   day_type:  'weekend' (Sat/Sun Manila) else 'weekday'
//   time_band: 'evening' for slot starts 18:00–02:59 Manila (frozen rate card,
//     ADR-02) else 'morning' (06:00–18:00)
//   item_type: 'court' | 'paddle' | 'ball'
export function dayTypeFor(instant: Date): string {
  const { day } = manilaParts(instant);
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

export function timeBandFor(instant: Date): string {
  const { hour } = manilaParts(instant);
  // Evening 18:00–03:00 (hour 18–23 or 0–2; slots end at 03:00 so hour 3+ never
  // occurs); morning 06:00–18:00.
  return hour >= 18 || hour < 3 ? "evening" : "morning";
}
