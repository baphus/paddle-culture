import { and, eq, gte, lt } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, startOfMonth } from "date-fns";
import type { Db } from "@/db/client";
import { bookingSlots, bookings, courts } from "@/db/schema";
import { MANILA_TZ } from "@/lib/booking/constants";
import { manilaDateStr } from "@/lib/booking/slots";

export interface CalendarEvent {
  id: string;
  fullName: string;
  courts: string;
  status: string;
  date: string; // "YYYY-MM-DD" Manila
  slotLabels: string[]; // ["6AM–7AM", ...]
  slotStarts: string[]; // ISO strings, sorted asc — used for consecutive formatting
  total: string;
}

// ─── slot label helpers ───────────────────────────────────────────────────────

function h12(n: number): string {
  const v = n % 12 === 0 ? 12 : n % 12;
  return `${v}${n < 12 ? "AM" : "PM"}`;
}

function hourLabel(start: Date): string {
  const z = new TZDate(start, MANILA_TZ);
  const h = z.getHours();
  return `${h12(h)}–${h12((h + 1) % 24)}`;
}

/**
 * Collapse sorted slot-start ISO strings into a human label.
 * Consecutive 1-hour runs merge: ["6AM–7AM","7AM–8AM"] → "6AM–8AM"
 * Non-consecutive runs are comma-joined: "6AM–8AM, 10AM–11AM"
 */
export function formatConsecutiveSlots(slotStarts: string[]): string {
  if (slotStarts.length === 0) return "—";
  const sorted = [...slotStarts].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );
  const runs: Date[][] = [[new Date(sorted[0]!)]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = runs[runs.length - 1]!;
    const gap =
      new Date(sorted[i]!).getTime() - prev[prev.length - 1]!.getTime();
    if (gap === 3_600_000) {
      prev.push(new Date(sorted[i]!));
    } else {
      runs.push([new Date(sorted[i]!)]);
    }
  }
  return runs
    .map((run) => {
      if (run.length === 1) return hourLabel(run[0]!);
      const startZ = new TZDate(run[0]!, MANILA_TZ);
      const endZ = new TZDate(run[run.length - 1]!, MANILA_TZ);
      const startH = startZ.getHours();
      const endHours = endZ.getHours() + 1; // end is exclusive
      return `${h12(startH)}–${h12(endHours % 24)}`;
    })
    .join(", ");
}

// ─── shared query core ────────────────────────────────────────────────────────

async function buildEvents(
  db: Db,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<CalendarEvent[]> {
  const slotRows = await db
    .select({
      bookingId: bookingSlots.bookingId,
      courtName: courts.name,
      slotStart: bookingSlots.slotStart,
    })
    .from(bookingSlots)
    .innerJoin(courts, eq(bookingSlots.courtId, courts.id))
    .where(
      and(
        gte(bookingSlots.slotStart, rangeStart as unknown as Date),
        lt(bookingSlots.slotStart, rangeEnd as unknown as Date),
      ),
    );

  if (slotRows.length === 0) return [];

  const bookingIds = [...new Set(slotRows.map((s) => s.bookingId))];
  const { inArray } = await import("drizzle-orm");

  const bookingRows = await db
    .select({
      id: bookings.id,
      fullName: bookings.fullName,
      status: bookings.status,
      total: bookings.total,
    })
    .from(bookings)
    .where(inArray(bookings.id, bookingIds));

  const bookingMap = new Map(bookingRows.map((b) => [b.id, b]));

  type SlotAcc = {
    courtNames: Set<string>;
    slots: { t: number; label: string; iso: string }[];
  };
  const acc = new Map<string, SlotAcc>();

  for (const s of slotRows) {
    const entry = acc.get(s.bookingId) ?? { courtNames: new Set(), slots: [] };
    entry.courtNames.add(s.courtName);
    const tz = new TZDate(s.slotStart, MANILA_TZ);
    const h = tz.getHours();
    entry.slots.push({
      t: s.slotStart.getTime(),
      label: `${h12(h)}–${h12((h + 1) % 24)}`,
      iso: s.slotStart.toISOString(),
    });
    acc.set(s.bookingId, entry);
  }

  const events: CalendarEvent[] = [];

  for (const [id, data] of acc) {
    const booking = bookingMap.get(id);
    if (!booking) continue;
    const sorted = data.slots.slice().sort((a, b) => a.t - b.t);
    const earliest = new Date(sorted[0]!.t);
    events.push({
      id,
      fullName: booking.fullName,
      courts: [...data.courtNames].join(", "),
      status: booking.status,
      date: manilaDateStr(earliest),
      slotLabels: sorted.map((s) => s.label),
      slotStarts: sorted.map((s) => s.iso),
      total: booking.total,
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Returns all bookings (any status) whose earliest slot falls within the
 * requested calendar month (Manila time). One entry per booking.
 */
export async function getCalendarBookings(
  db: Db,
  year: number,
  month: number, // 1-based
): Promise<CalendarEvent[]> {
  const monthStart = new TZDate(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00`,
    MANILA_TZ,
  );
  const monthEnd = addMonths(monthStart, 1);
  return buildEvents(db, monthStart as unknown as Date, monthEnd as unknown as Date);
}

/**
 * Returns all bookings whose earliest slot falls within a specific date range
 * [start, end) in Manila time. Used for weekly and daily views.
 */
export async function getCalendarBookingsRange(
  db: Db,
  start: string, // "YYYY-MM-DD"
  end: string, // "YYYY-MM-DD" exclusive
): Promise<CalendarEvent[]> {
  const rangeStart = new TZDate(`${start}T00:00:00`, MANILA_TZ);
  const rangeEnd = new TZDate(`${end}T00:00:00`, MANILA_TZ);
  return buildEvents(
    db,
    rangeStart as unknown as Date,
    rangeEnd as unknown as Date,
  );
}

export function manilaYearMonth(): { year: number; month: number } {
  const z = new TZDate(Date.now(), MANILA_TZ);
  return { year: z.getFullYear(), month: z.getMonth() + 1 };
}

export function manilaDateToday(): string {
  const z = new TZDate(Date.now(), MANILA_TZ);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

/** ISO weekday start (Monday) of the week containing dateStr */
export function weekStartManila(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcNoon = Date.UTC(y as number, (m as number) - 1, d as number, 12);
  const dow = new Date(utcNoon).getUTCDay(); // 0=Sun
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  const monMs = utcNoon + daysToMon * 86_400_000;
  const dt = new Date(monMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Add n days to a YYYY-MM-DD string (UTC noon anchor) */
export function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcNoon = Date.UTC(y as number, (m as number) - 1, d as number, 12);
  const dt = new Date(utcNoon + n * 86_400_000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
