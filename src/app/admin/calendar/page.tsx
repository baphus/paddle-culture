import { getDb } from "@/db/client";
import { getCalendarBookings, manilaDateToday, manilaYearMonth } from "@/lib/admin/calendar";
import CalendarView from "@/components/admin/calendar-view";
import PageHeader from "@/components/admin/page-header";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { year: nowYear, month: nowMonth } = manilaYearMonth();
  const today = manilaDateToday();

  const rawY = Number.parseInt(first(sp.y), 10);
  const rawM = Number.parseInt(first(sp.m), 10);
  const year = Number.isFinite(rawY) ? clamp(rawY, 2020, 2099) : nowYear;
  const month = Number.isFinite(rawM) ? clamp(rawM, 1, 12) : nowMonth;

  let events = [] as Awaited<ReturnType<typeof getCalendarBookings>>;
  try {
    const db = getDb();
    events = await getCalendarBookings(db, year, month);
  } catch {
    // DB not configured — render empty calendar
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Booking Calendar"
        description="All bookings by slot date (Manila time)."
      />

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <CalendarView
          events={events}
          year={year}
          month={month}
          today={today}
          mode="full"
        />
      </div>
    </div>
  );
}
