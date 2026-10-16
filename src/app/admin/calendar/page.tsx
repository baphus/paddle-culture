import { Suspense } from "react";
import { getDb, type Db } from "@/db/client";
import {
  addDaysStr,
  getCalendarBookings,
  getCalendarBookingsRange,
  manilaDateToday,
  manilaYearMonth,
  weekStartManila,
} from "@/lib/admin/calendar";
import CalendarView from "@/components/admin/calendar-view";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

type CalEvents = Awaited<ReturnType<typeof getCalendarBookings>>;

// DB not configured or query failure → empty calendar, same as the old try/catch.
function loadEvents(fetch: (db: Db) => Promise<CalEvents>): Promise<CalEvents> {
  try {
    return fetch(getDb()).catch(() => [] as CalEvents);
  } catch {
    return Promise.resolve([] as CalEvents);
  }
}

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

  const view = (first(sp.view) || "monthly") as "daily" | "weekly" | "monthly";

  // ── monthly ──────────────────────────────────────────────────────────────
  const rawY = Number.parseInt(first(sp.y), 10);
  const rawM = Number.parseInt(first(sp.m), 10);
  const year = Number.isFinite(rawY) ? clamp(rawY, 2020, 2099) : nowYear;
  const month = Number.isFinite(rawM) ? clamp(rawM, 1, 12) : nowMonth;

  // ── weekly / daily ────────────────────────────────────────────────────────
  // anchor: ?date=YYYY-MM-DD — defaults to today
  const rawDate = first(sp.date);
  const anchorDate =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;

  // Weekly: Mon–Sun week containing anchorDate
  const weekStart = weekStartManila(anchorDate);
  const weekEnd = addDaysStr(weekStart, 7);

  // Daily: just anchorDate → anchorDate+1
  const dayEnd = addDaysStr(anchorDate, 1);

  // Started before the shell renders; the calendar streams in once it resolves.
  const eventsPromise = loadEvents((db) =>
    view === "monthly"
      ? getCalendarBookings(db, year, month)
      : getCalendarBookingsRange(
          db,
          view === "weekly" ? weekStart : anchorDate,
          view === "weekly" ? weekEnd : dayEnd,
        ),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Booking Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All bookings by slot date (Manila time).
        </p>
      </header>

      <Card className="gap-0 overflow-hidden py-0">
        <Suspense fallback={<Skeleton className="h-[520px]" />}>
          <CalendarBody
            events={eventsPromise}
            year={year}
            month={month}
            today={today}
            view={view}
            anchorDate={anchorDate}
            weekStart={weekStart}
          />
        </Suspense>
      </Card>
    </div>
  );
}

async function CalendarBody({
  events: eventsPromise,
  year,
  month,
  today,
  view,
  anchorDate,
  weekStart,
}: {
  events: Promise<CalEvents>;
  year: number;
  month: number;
  today: string;
  view: "daily" | "weekly" | "monthly";
  anchorDate: string;
  weekStart: string;
}) {
  const events = await eventsPromise;
  return (
    <CalendarView
      events={events}
      year={year}
      month={month}
      today={today}
      view={view}
      anchorDate={anchorDate}
      weekStart={weekStart}
    />
  );
}
