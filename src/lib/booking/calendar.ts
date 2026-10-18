export interface CalendarEventInput {
  title: string;
  /** Slot start instants (ISO with offset, as stored); the event spans first start → 1h after the last. */
  slotStarts: string[];
  details?: string;
  location?: string;
}

export interface CalendarRangeInput {
  title: string;
  /** Start instant (ISO with offset, as stored). */
  startIso: string;
  /** End instant (ISO with offset, as stored). */
  endIso: string;
  details?: string;
  location?: string;
}

// Google Calendar wants UTC basic-format stamps (`20261018T220000Z`).
const pad = (n: number) => String(n).padStart(2, "0");
function stamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * "Add to Google Calendar" link for ONE explicit time range.
 *
 * Multi-session bookings (two courts, or two different days) need one accurate
 * event each; `googleCalendarUrl` merges everything into a single span that can
 * straddle unrelated days. Used by the customer emails.
 * Returns "" when either bound is unparseable or the range is not positive.
 */
export function googleCalendarUrlForRange({
  title,
  startIso,
  endIso,
  details,
  location,
}: CalendarRangeInput): string {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return "";
  if (endMs <= startMs) return "";

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${stamp(new Date(startMs))}/${stamp(new Date(endMs))}`,
    ...(details ? { details } : {}),
    ...(location ? { location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** "Add to Google Calendar" template link. Returns "" when there is nothing to schedule. */
export function googleCalendarUrl({ title, slotStarts, details, location }: CalendarEventInput): string {
  const times = slotStarts.map((s) => new Date(s).getTime()).filter((t) => !Number.isNaN(t));
  if (times.length === 0) return "";
  const start = new Date(Math.min(...times));
  const end = new Date(Math.max(...times) + 60 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${stamp(start)}/${stamp(end)}`,
    ...(details ? { details } : {}),
    ...(location ? { location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
