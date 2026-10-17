export interface CalendarEventInput {
  title: string;
  /** Slot start instants (ISO with offset, as stored); the event spans first start → 1h after the last. */
  slotStarts: string[];
  details?: string;
  location?: string;
}

// Google Calendar wants UTC basic-format stamps (`20261018T220000Z`).
const pad = (n: number) => String(n).padStart(2, "0");
function stamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
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
