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
  total: string;
}

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

  // All slots that fall in this month
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
        gte(bookingSlots.slotStart, monthStart as unknown as Date),
        lt(bookingSlots.slotStart, monthEnd as unknown as Date),
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

  // Group slots by booking, compute earliest slot date + hour labels
  type SlotAcc = {
    courtNames: Set<string>;
    slots: { t: number; label: string }[];
  };
  const acc = new Map<string, SlotAcc>();

  for (const s of slotRows) {
    const entry = acc.get(s.bookingId) ?? { courtNames: new Set(), slots: [] };
    entry.courtNames.add(s.courtName);
    const tz = new TZDate(s.slotStart, MANILA_TZ);
    const h = tz.getHours();
    const h12 = (n: number) => {
      const v = n % 12 === 0 ? 12 : n % 12;
      return `${v}${n < 12 ? "AM" : "PM"}`;
    };
    entry.slots.push({ t: s.slotStart.getTime(), label: `${h12(h)}–${h12((h + 1) % 24)}` });
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
      total: booking.total,
    });
  }

  // Sort by date then by first slot
  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
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
