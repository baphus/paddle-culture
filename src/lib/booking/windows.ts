// Hourly rate windows (ADR-12). Pure helpers: no DB, no clock, Manila wall
// clock hours only. A window is a whole-hour range [start, end) and may wrap
// past midnight (end <= start), e.g. 18:00-03:00. A window row also carries the
// weekdays it applies to as ints mirroring operating_hours.day_of_week
// (0=Sun..6=Sat).

export interface RateWindow {
  /** 0-23 hour start. */
  start: number;
  /** 0-23 hour end (exclusive); === start is a full day, < start wraps midnight. */
  end: number;
}

/** Every hour the window covers, end-exclusive (wrap-aware). */
function hoursOf(w: RateWindow): number[] {
  const out: number[] = [];
  if (w.start === w.end) {
    for (let h = 0; h < 24; h++) out.push(h);
  } else if (w.start < w.end) {
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
  if (w.start === w.end) return true;
  return w.start < w.end ? hour >= w.start && hour < w.end : hour >= w.start || hour < w.end;
}

// --- Day scoping -------------------------------------------------------------
// 0=Sunday..6=Saturday, mirroring operating_hours.day_of_week.

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayName(dayIndex: number): string {
  return DAY_LABELS[dayIndex] as string;
}

