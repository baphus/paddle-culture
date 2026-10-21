// Public court catalog for the customer booking flow.
//
// SINGLE SOURCE OF TRUTH for the bookable-court list on the public site.
// Live court rows come from the `courts` table (id + name); this file owns
// the client-safe types + display helpers, and the FALLBACK_COURTS used when
// the database is unreachable (e.g. during `next build` with no DATABASE_URL).
//
// To change the courts offered publicly: add/rename/deactivate rows in the
// `courts` table (status = 'active'). No code change needed here unless you
// want to change the offline fallback below.
//
// Client-safe: no server imports — importable from client components.

import {
  manilaDateStr,
  slotSelectionDateStr,
  maxBookableDateStr as maxBookableDateStrImpl,
} from "@/lib/booking/slots";

export interface CourtOption {
  id: string;
  name: string;
}

/** Used when the DB cannot be reached (build time / outage). */
export const FALLBACK_COURTS: CourtOption[] = [];

const manilaDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const manilaHourFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Today's date in Asia/Manila as YYYY-MM-DD (same-day booking allowed). */
export function manilaTodayStr(now: Date = new Date()): string {
  return manilaDateStr(now);
}

/** Max selectable date: 12-month rolling window (matches operating scale). */
export function maxBookableDateStr(now: Date = new Date()): string {
  return maxBookableDateStrImpl(now);
}

const manilaMonthFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  month: "long",
  year: "numeric",
});

const manilaLongFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

function splitDateStr(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y: y as number, m: m as number, d: d as number };
}

/**
 * Add N days to a YYYY-MM-DD Manila date. Anchored at UTC noon (= 20:00
 * Manila, same civil date — Manila is UTC+8 with no DST), so the math is
 * timezone-safe and never browser-local.
 */
export function addDaysManilaStr(dateStr: string, days: number): string {
  const { y, m, d } = splitDateStr(dateStr);
  return manilaDayFmt.format(new Date(Date.UTC(y, m - 1, d, 12) + days * 86_400_000));
}

/**
 * Earliest online-bookable *date*: today in Asia/Manila.
 *
 * Same-day booking is allowed (ADR-03) — the only thing that shuts hours out is
 * being in the past, which `isFutureSlot` / the availability payload filter at
 * slot granularity. So the calendar's floor is today, not tomorrow: a customer
 * at 2 PM can still book 6 PM tonight. The day itself is never disabled; its
 * spent hours simply render as unavailable.
 */
export function manilaEarliestBookableStr(now: Date = new Date()): string {
  return manilaDayFmt.format(now);
}

/** "October 2026" for a 0-indexed month — same Manila source as the day cells. */
export function monthLabelManila(year: number, monthIndex: number): string {
  return manilaMonthFmt.format(new Date(Date.UTC(year, monthIndex, 1, 12)));
}

/** "Fri, Oct 25, 2026" for a YYYY-MM-DD Manila date. */
export function formatManilaLong(dateStr: string): string {
  const { y, m, d } = splitDateStr(dateStr);
  return manilaLongFmt.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** Manila weekday of the 1st of a 0-indexed month (0 = Sunday .. 6 = Saturday). */
export function firstWeekdayManila(year: number, monthIndex: number): number {
  // UTC noon == 20:00 Manila on the same civil date, so getUTCDay is exact.
  return new Date(Date.UTC(year, monthIndex, 1, 12)).getUTCDay();
}

/** Manila weekday (0 = Sunday .. 6 = Saturday) for a YYYY-MM-DD date. Pure
 *  arithmetic off firstWeekdayManila — never browser-local Date math. */
export function weekdayManila(dateStr: string): number {
  const { y, m, d } = splitDateStr(dateStr);
  return (firstWeekdayManila(y, m - 1) + (d - 1)) % 7;
}

/** Gregorian month length — timezone-independent, never browser-local. */
export function daysInManilaMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 12)).getUTCDate();
}

/** "6:00 – 7:00 AM" label for a 1h slot start ISO (Manila wall time). */
export function formatSlotRange(startIso: string): string {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + 3_600_000);
  const s = manilaHourFmt.format(start);
  const e = manilaHourFmt.format(end);
  // "6:00 AM" + "7:00 AM" -> "6:00 – 7:00 AM" when meridiems match.
  const [sTime, sMer] = splitMeridiem(s);
  const [eTime, eMer] = splitMeridiem(e);
  if (sMer === eMer) return `${sTime} – ${eTime} ${eMer}`;
  return `${s} – ${e}`;
}

/** "7:00 – 8:00 AM (Court 1)" for one booked court slot. */
export function formatCourtSlotLine(courtName: string, startIso: string): string {
  return `${formatSlotRange(startIso)} (${courtName})`;
}

/** Compact admin label with date-aware splits: "7:00 – 8:00, 8:00 – 9:00 AM
 *  (Court 1)"; next-day runs get a prefix — "Oct 22, 2026 · 12:00 – 2:00 AM". */
export function formatCourtSlotGroup(courtName: string, startIsos: string[]): string {
  const runs = collapseRuns(startIsos, true);
  if (runs.length === 0) return "";
  const business = slotSelectionDateStr(runs[0] as string[]);
  const labels = runs
    .map((run) => {
      const label = runLabel(run);
      return manilaDateStr(new Date(run[0] as string)) === business
        ? label
        : `${slotDateShort(run[0] as string)} · ${label}`;
    });

  const meridiems = labels.map((label) => label.trim().split(" ").at(-1));
  const sharedMeridiem = meridiems.every((meridiem) => meridiem === meridiems[0])
    ? meridiems[0]
    : null;
  const compactLabels = sharedMeridiem
    ? labels.map((label) => label.slice(0, -(sharedMeridiem.length + 1)).trim())
    : labels;

  return `${compactLabels.join(", ")}${sharedMeridiem ? ` ${sharedMeridiem}` : ""} (${courtName})`;
}

function splitMeridiem(s: string): [string, string] {
  const parts = s.trim().split(" ");
  if (parts.length >= 2) {
    return [parts.slice(0, -1).join(" "), parts[parts.length - 1] as string];
  }
  return [s, ""];
}

/** Collapse sorted slot starts into consecutive-hour runs. With
 *  `splitAcrossDates`, a run never crosses a Manila calendar-date boundary. */
function collapseRuns(startIsos: string[], splitAcrossDates = false): string[][] {
  const times = [...startIsos].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const runs: string[][] = [];
  for (const iso of times) {
    const run = runs[runs.length - 1];
    const previous = run?.[run.length - 1];
    const contiguous =
      previous !== undefined &&
      new Date(iso).getTime() - new Date(previous).getTime() === 3_600_000;
    const sameDay =
      previous === undefined ||
      !splitAcrossDates ||
      manilaDateStr(new Date(previous)) === manilaDateStr(new Date(iso));
    if (run && contiguous && sameDay) run.push(iso);
    else runs.push([iso]);
  }
  return runs;
}

/** "9:00 AM" or "9:00 – 11:00 AM" for one collapsed run. */
function runLabel(run: string[]): string {
  if (run.length === 1) return formatSlotRange(run[0] as string);
  return `${formatSlotRange(run[0] as string).split("–")[0]?.trim()} – ${formatSlotRange(run[run.length - 1] as string).split("–")[1]?.trim()}`;
}

/**
 * "6:00 – 8:00 AM, 10:00 – 11:00 AM" for slot start ISOs (Manila wall time).
 * Consecutive 1h runs collapse to one range; gaps start a new range.
 * Empty → "".
 */
export function formatSlotRanges(startIsos: string[]): string {
  return collapseRuns(startIsos)
    .map((run) => runLabel(run))
    .join(", ");
}

/** "Oct 22, 2026" — the slot's own Manila calendar date. */
export function slotDateShort(startIso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(startIso));
}

/**
 * formatSlotRanges split at Manila-date boundaries, so an overnight booking
 * reads in real calendar dates: each run after the selection's own business
 * day gets an explicit date prefix —
 * "9:00 PM – 12:00 AM, Oct 22, 2026 · 12:00 – 2:00 AM".
 * Same-date bookings render identically to formatSlotRanges.
 */
export function formatSlotRangesWithDates(startIsos: string[]): string {
  const runs = collapseRuns(startIsos, true);
  if (runs.length === 0) return "";
  const business = slotSelectionDateStr(runs[0] as string[]);
  return runs
    .map((run) => {
      const label = runLabel(run);
      return manilaDateStr(new Date(run[0] as string)) === business
        ? label
        : `${slotDateShort(run[0] as string)} · ${label}`;
    })
    .join(", ");
}

/** One court's slice of a booking: the (court, slots) pairing that the flat
 *  `courtNames` + `slotStarts` arrays lose. */
export interface CourtSlotGroup {
  courtId?: string;
  courtName: string;
  slotStarts: string[];
}

/**
 * Per-court time lines for a booking that moves between courts —
 * ["Court 1 · 3:00 – 4:00 PM", "Court 2 · 4:00 – 5:00 PM"]. Empty whenever the
 * collapsed range label is already accurate (one court, or every court on the
 * same hours), so callers can fall back to the plain label.
 */
export function formatCourtSlotGroups(groups: CourtSlotGroup[]): string[] {
  const booked = groups.filter((g) => g.slotStarts.length > 0);
  if (booked.length <= 1) return [];
  const keys = booked.map((g) => [...g.slotStarts].sort().join(","));
  if (keys.every((k) => k === keys[0])) return [];
  return booked.map((g) => `${g.courtName} · ${formatSlotRangesWithDates(g.slotStarts)}`);
}

/** "mm:ss" countdown text for a millisecond remainder (clamped at 0). */
export function formatCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
