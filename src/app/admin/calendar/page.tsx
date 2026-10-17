import { Suspense } from "react";
import { getDb } from "@/db/client";
import {
  getCalendarBookings,
  manilaDateToday,
  manilaYearMonth,
} from "@/lib/admin/calendar";
import { listClosures } from "@/lib/admin/config";
import type { ClosureRow } from "@/lib/admin/config";
import CalendarView from "@/components/admin/calendar-view";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

type CalEvents = Awaited<ReturnType<typeof getCalendarBookings>>;

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

  // View is a client concern; the server only needs the *anchor month* to seed.
  // - monthly view: ?year=&month=
  // - weekly/daily/schedule: ?date=YYYY-MM-DD (derive its year/month)
  const rawDate = first(sp.date);
  const anchorDate =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
  const [anchorYear, anchorMonth] = anchorDate.split("-").map(Number);

  const rawY = Number.parseInt(first(sp.year), 10);
  const rawM = Number.parseInt(first(sp.month), 10);
  // Fall back to the anchor date's month when year/month aren't supplied.
  const year = Number.isFinite(rawY) ? clamp(rawY, 2020, 2099) : (anchorYear ?? nowYear);
  const month = Number.isFinite(rawM) ? clamp(rawM, 1, 12) : (anchorMonth ?? nowMonth);

  // Load exactly one month server-side, then hand it to the client as the seed.
  const payloadPromise = loadMonth(year, month);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Booking Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View bookings, closures, and court availability at a glance.
        </p>
      </header>

      <Card className="gap-0 overflow-hidden py-0">
        <Suspense fallback={<Skeleton className="h-[520px]" />}>
          <CalendarBody
            payload={payloadPromise}
            year={year}
            month={month}
            today={today}
            anchorDate={anchorDate}
          />
        </Suspense>
      </Card>
    </div>
  );
}

interface MonthPayload {
  events: CalEvents;
  closures: ClosureRow[];
}

// DB not configured or query failure → empty month (same graceful fallback as before).
async function loadMonth(year: number, month: number): Promise<MonthPayload> {
  try {
    const db = getDb();
    const [events, closures] = await Promise.all([
      getCalendarBookings(db, year, month).catch(() => [] as CalEvents),
      listClosures(db).catch(() => [] as ClosureRow[]),
    ]);
    return { events, closures };
  } catch {
    return { events: [], closures: [] };
  }
}

async function CalendarBody({
  payload,
  year,
  month,
  today,
  anchorDate,
}: {
  payload: Promise<MonthPayload>;
  year: number;
  month: number;
  today: string;
  anchorDate: string;
}) {
  const { events, closures } = await payload;
  return (
    <CalendarView
      initialEvents={events}
      initialClosures={closures}
      loadedYear={year}
      loadedMonth={month}
      today={today}
      anchorDate={anchorDate}
    />
  );
}
