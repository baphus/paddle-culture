import { TZDate } from "@date-fns/tz";
import { addMonths } from "date-fns";
import type { Db } from "@/db/client";
import { MANILA_TZ } from "@/lib/booking/constants";
import { manilaDateStr } from "@/lib/booking/slots";

// All Drizzle ORM imports replaced with @supabase/supabase-js HTTP client.

export interface CalendarEvent {
  id: string;
  fullName: string;
  courts: string;
  status: string;
  date: string;
  slotLabels: string[];
  slotStarts: string[];
  total: string;
}

function h12(n: number): string {
  const v = n % 12 === 0 ? 12 : n % 12;
  return `${v}${n < 12 ? "AM" : "PM"}`;
}

function hourLabel(start: Date): string {
  const z = new TZDate(start, MANILA_TZ);
  const h = z.getHours();
  return `${h12(h)}–${h12((h + 1) % 24)}`;
}

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
      const endHours = endZ.getHours() + 1;
      return `${h12(startH)}–${h12(endHours % 24)}`;
    })
    .join(", ");
}

async function buildEvents(
  db: Db,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<CalendarEvent[]> {
  type SlotRow = { booking_id: string; court_id: string; slot_start: string; courts: unknown };
  function getCourtName(s: SlotRow): string {
    const c = s.courts;
    if (!c) return s.court_id;
    if (Array.isArray(c)) return (c[0] as { name?: string })?.name ?? s.court_id;
    return (c as { name?: string })?.name ?? s.court_id;
  }

  const { data: slotData, error: slotError } = await db
    .from("booking_slots")
    .select("booking_id,court_id,slot_start,courts(name)")
    .gte("slot_start", rangeStart.toISOString())
    .lt("slot_start", rangeEnd.toISOString());

  if (slotError) throw new Error(slotError.message);
  if (!slotData || slotData.length === 0) return [];

  const bookingIds = [...new Set((slotData as SlotRow[]).map((s) => s.booking_id))];

  const { data: bookingData, error: bookingError } = await db
    .from("bookings")
    .select("id,full_name,status,total")
    .in("id", bookingIds);

  if (bookingError) throw new Error(bookingError.message);

  type BookingRow = { id: string; full_name: string; status: string; total: string };
  const bookingMap = new Map(
    ((bookingData ?? []) as BookingRow[]).map((b) => [b.id, b]),
  );

  type SlotAcc = {
    courtNames: Set<string>;
    slots: { t: number; label: string; iso: string }[];
  };
  const acc = new Map<string, SlotAcc>();

  for (const s of slotData as SlotRow[]) {
    const entry = acc.get(s.booking_id) ?? { courtNames: new Set(), slots: [] };
    const courtNameVal = getCourtName(s);
    entry.courtNames.add(courtNameVal);
    const start = new Date(s.slot_start);
    const tz = new TZDate(start, MANILA_TZ);
    const h = tz.getHours();
    entry.slots.push({
      t: start.getTime(),
      label: `${h12(h)}–${h12((h + 1) % 24)}`,
      iso: s.slot_start,
    });
    acc.set(s.booking_id, entry);
  }

  const events: CalendarEvent[] = [];

  for (const [id, data] of acc) {
    const booking = bookingMap.get(id);
    if (!booking) continue;
    const sorted = data.slots.slice().sort((a, b) => a.t - b.t);
    const earliest = new Date(sorted[0]!.t);
    events.push({
      id,
      fullName: booking.full_name,
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

export async function getCalendarBookings(
  db: Db,
  year: number,
  month: number,
): Promise<CalendarEvent[]> {
  const monthStart = new TZDate(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00`,
    MANILA_TZ,
  );
  const monthEnd = addMonths(monthStart, 1);
  return buildEvents(db, monthStart as unknown as Date, monthEnd as unknown as Date);
}

export async function getCalendarBookingsRange(
  db: Db,
  start: string,
  end: string,
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

export function weekStartManila(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcNoon = Date.UTC(y as number, (m as number) - 1, d as number, 12);
  const dow = new Date(utcNoon).getUTCDay();
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  const monMs = utcNoon + daysToMon * 86_400_000;
  const dt = new Date(monMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcNoon = Date.UTC(y as number, (m as number) - 1, d as number, 12);
  const dt = new Date(utcNoon + n * 86_400_000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
