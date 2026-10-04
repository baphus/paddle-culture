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
  return manilaDayFmt.format(now);
}

/** Max selectable date: 12-month rolling window (matches operating scale). */
export function maxBookableDateStr(now: Date = new Date()): string {
  const d = new Date(now.getTime());
  d.setFullYear(d.getFullYear() + 1);
  return manilaDayFmt.format(d);
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

function splitMeridiem(s: string): [string, string] {
  const parts = s.trim().split(" ");
  if (parts.length >= 2) {
    return [parts.slice(0, -1).join(" "), parts[parts.length - 1] as string];
  }
  return [s, ""];
}

/** "mm:ss" countdown text for a millisecond remainder (clamped at 0). */
export function formatCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
