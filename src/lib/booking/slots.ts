import { TZDate } from "@date-fns/tz";
import {
  DAY_START_HOUR_MANILA,
  MANILA_TZ,
  SLOT_COUNT,
} from "./constants";

export interface SlotInstant {
  index: number;
  /**
   * Slot start as a plain Date (instant). Deliberately NOT a TZDate:
   * @date-fns/tz overrides `toISOString`/`toJSON` on TZDate to emit zone-local
   * strings (`...+08:00`), which then leak into PostgREST filters, JSON bodies
   * and React keys. A plain Date always serializes to the UTC `...Z` form the
   * server parses back with `new Date(s)`.
   */
  start: Date;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Instant for a wall-clock time on a Manila date. Do NOT build this with
 * `new TZDate("<date>T<hh>:00:00", MANILA_TZ)`: TZDate's string constructor
 * parses in the *process* timezone (see @date-fns/tz `mini.js`), so on a UTC
 * server (Vercel) every grid instant silently shifts 8h. Component args are
 * interpreted as target-zone wall clock, which is what we want.
 */
export function manilaWallClock(dateStr: string, hour = 0, minute = 0): TZDate {
  const [y, m, d] = dateStr.split("-").map(Number);
  return TZDate.tz(MANILA_TZ, y as number, (m as number) - 1, d as number, hour, minute, 0);
}

/**
 * All 21 slot-start instants for a Manila selection date (YYYY-MM-DD).
 * The base is resolved once with Manila wall-clock args, then stepped by pure
 * epoch arithmetic. Manila is UTC+8 with no DST, so hour arithmetic is exact
 * and the result never depends on the host timezone.
 */
export function slotsForDate(dateStr: string): SlotInstant[] {
  const baseMs = manilaWallClock(dateStr, DAY_START_HOUR_MANILA).getTime();
  const out: SlotInstant[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    out.push({ index: i, start: new Date(baseMs + i * HOUR_MS) });
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
 *
 * The previous day is derived by subtracting 24h of *instants*, not with
 * `setDate`: @date-fns/tz does not override `setDate`, so it would mutate in
 * the process timezone and walk back two Manila days on a UTC server (the
 * production OFF_GRID bug). Manila has no DST, so -24h is exactly one day.
 */
export function selectionDateStr(instant: Date): string {
  const z = new TZDate(instant, MANILA_TZ);
  const ms = z.getTime();
  if (z.getHours() < DAY_START_HOUR_MANILA) {
    const prev = new TZDate(ms - DAY_MS, MANILA_TZ);
    return `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(prev.getDate())}`;
  }
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

/**
 * Play Date for a set of slot-start instants: the Manila *selection* date of
 * the earliest slot (YYYY-MM-DD), or null when there are no slots.
 *
 * Never `iso.slice(0, 10)`: a slot's ISO string is UTC, so a 06:00 Manila
 * start serializes as `...T22:00:00Z` on the *previous* UTC day and the slice
 * renders the Play Date one day early. This is the production tracking-page
 * report ("booked Oct 19, tracking says Oct 18").
 *
 * Sorting by epoch (not string) keeps the comparison meaningful for mixed
 * offsets, and going through `selectionDateStr` makes an overnight tail
 * (00:00–02:00 wall clock) resolve to the day the customer actually picked.
 */
export function slotSelectionDateStr(
  slotStarts: readonly (string | Date)[],
): string | null {
  let earliest: number | null = null;
  for (const s of slotStarts) {
    const ms = (s instanceof Date ? s : new Date(s)).getTime();
    if (Number.isNaN(ms)) continue;
    if (earliest === null || ms < earliest) earliest = ms;
  }
  if (earliest === null) return null;
  return selectionDateStr(new Date(earliest));
}

/**
 * True when an instant sits exactly on the hourly slot grid of its Manila
 * selection date (whole hour, one of the 21 slots starting 06:00).
 * Overnight slots 00:00–02:00 belong to the previous selection date's grid,
 * so that date's 06:00 base is tried as a fallback.
 */
export function isOnSlotGrid(instant: Date): boolean {
  const z = new TZDate(instant, MANILA_TZ);
  if (z.getMinutes() !== 0 || z.getSeconds() !== 0 || z.getMilliseconds() !== 0) {
    return false;
  }
  const todayStr = `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
  const baseMs = manilaWallClock(todayStr, DAY_START_HOUR_MANILA).getTime();
  const diffHours = (z.getTime() - baseMs) / HOUR_MS;
  if (Number.isInteger(diffHours) && diffHours >= 0 && diffHours < SLOT_COUNT) {
    return true;
  }
  // Overnight spill: 00:00–02:00 wall time belongs to the previous
  // selection date's 06:00→03:00+1d grid.
  const sel = selectionDateStr(instant);
  const selBaseMs = manilaWallClock(sel, DAY_START_HOUR_MANILA).getTime();
  if (selBaseMs === baseMs) return false;
  const prevDiffHours = (z.getTime() - selBaseMs) / HOUR_MS;
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
