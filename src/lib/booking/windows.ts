// Hourly rate windows (ADR-12). Pure helpers: no DB, no clock, Manila wall
// clock hours only. A window is a whole-hour range [start, end) and may wrap
// past midnight (end <= start), e.g. 18:00-03:00. A window row also carries the
// weekdays it applies to as ints mirroring operating_hours.day_of_week
// (0=Sun..6=Sat).

export interface RateWindow {
  /** 0-23 hour start. */
  start: number;
  /** 0-23 hour end (exclusive); <= start means the window wraps midnight. */
  end: number;
}

/** Every hour the window covers, end-exclusive (wrap-aware). */
function hoursOf(w: RateWindow): number[] {
  const out: number[] = [];
  if (w.start < w.end) {
    for (let h = w.start; h < w.end; h++) out.push(h);
  } else {
    for (let h = w.start; h < 24; h++) out.push(h);
    for (let h = 0; h < w.end; h++) out.push(h);
  }
  return out;
}

/** Wrap-aware; touching endpoints (06-12, 12-18) do not overlap. */
export function windowOverlaps(a: RateWindow, b: RateWindow): boolean {
  const hours = new Set(hoursOf(a));
  return hoursOf(b).some((h) => hours.has(h));
}

/** "6:00–12:00" (en dash, no zero padding). */
export function windowLabel(w: RateWindow): string {
  return `${w.start}:00–${w.end}:00`;
}

/** True when `hour` (0-23) is one of the window's hours. */
export function hourInWindow(hour: number, w: RateWindow): boolean {
  return w.start < w.end ? hour >= w.start && hour < w.end : hour >= w.start || hour < w.end;
}

// --- Day scoping -------------------------------------------------------------
// 0=Sunday..6=Saturday, mirroring operating_hours.day_of_week.

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Weekday chips/labels render Mon..Sun; 0 = Sunday. */
const MON_SUN = [1, 2, 3, 4, 5, 6, 0];

export function dayName(dayIndex: number): string {
  return DAY_LABELS[dayIndex] as string;
}

/** Admin day-chip alias (same 0=Sun..6=Sat ints). */
export const dayLabel = dayName;

function sameDaySet(days: Set<number>, expected: number[]): boolean {
  return days.size === expected.length && expected.every((d) => days.has(d));
}

/** "All days", "Weekdays", "Weekends", or "Mon,Wed,Fri" (Mon→Sun order). */
export function dayListLabel(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return "All days";
  if (sameDaySet(set, [0, 6])) return "Weekends";
  if (sameDaySet(set, [1, 2, 3, 4, 5])) return "Weekdays";
  return MON_SUN.filter((d) => set.has(d)).map(dayName).join(", ");
}

// The park's fixed bookable grid: 21 hourly starts from 06:00 to 03:00.
const GRID_HOURS: number[] = [
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2,
];

export interface HoursLike {
  courtId: string | null;
  dayOfWeek: number;
  /** "HH:MM" (24h). */
  openTime: string;
  closeTime: string;
}

function minutesOfWall(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h as number) * 60 + (m as number);
}

/**
 * Hourly grid starts for one weekday, derived the same way availability's
 * isSlotOpen resolves hours (court rows for that day, else global rows).
 *
 * Fail safe: no applicable operating_hours rows at all means the fixed 21-slot
 * park grid. A day with no rows while other days have rows is closed ([]).
 */
export function bookableHoursForDay(
  hours: HoursLike[],
  courtId: string | null,
  dayIndex: number,
): number[] {
  const anyRows = hours.some((h) => h.courtId === courtId || h.courtId === null);
  if (!anyRows) return [...GRID_HOURS];
  const scoped = hours.filter((h) => h.courtId === courtId && h.dayOfWeek === dayIndex);
  const rows =
    scoped.length > 0
      ? scoped
      : hours.filter((h) => h.courtId === null && h.dayOfWeek === dayIndex);
  const covered = new Set<number>();
  for (const r of rows) {
    const open = minutesOfWall(r.openTime);
    const closeRaw = minutesOfWall(r.closeTime);
    const close = closeRaw <= open ? closeRaw + 1440 : closeRaw;
    for (let m = open; m < close; m += 60) covered.add(Math.floor(m / 60) % 24);
  }
  return GRID_HOURS.filter((h) => covered.has(h));
}

/** Bookable hours not covered by any window. */
export function missingHours(bookable: number[], windows: RateWindow[]): number[] {
  return bookable.filter((h) => !windows.some((w) => hourInWindow(h, w)));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Group missing hours into ranges in grid order, e.g. [22,23,0,1,2] →
 * "22:00–03:00 (not covered)".
 */
export function missingWindowLabels(missing: number[]): string[] {
  const labels: string[] = [];
  let i = 0;
  while (i < missing.length) {
    const start = missing[i] as number;
    let last = start;
    while (
      i + 1 < missing.length &&
      (missing[i + 1] as number) === (last + 1) % 24
    ) {
      i++;
      last = missing[i] as number;
    }
    const end = (last + 1) % 24;
    labels.push(`${pad2(start)}:00–${pad2(end)}:00 (not covered)`);
    i++;
  }
  return labels;
}
