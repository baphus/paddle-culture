"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BookingStatusBadge } from "@/components/admin/status-badge";
import {
  BookingDetailDialog,
  type BookingDecision,
} from "@/components/admin/booking-detail-dialog";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { CalendarEvent } from "@/lib/admin/calendar";
import { formatConsecutiveSlots } from "@/lib/admin/calendar";
import { manilaDateStr } from "@/lib/booking/slots";
import type { BookingDetail } from "@/lib/admin/bookings";
import type { ClosureRow } from "@/lib/admin/config";

// ─── types ────────────────────────────────────────────────────────────────────

type ViewMode = "daily" | "weekly" | "monthly" | "schedule";

interface Props {
  /** Initial payload for the anchor month, loaded server-side by page.tsx. */
  initialEvents: CalendarEvent[];
  initialClosures: ClosureRow[];
  /** Anchor month loaded server-side (1-based month). */
  loadedYear: number;
  loadedMonth: number;
  today: string; // "YYYY-MM-DD"
  view?: ViewMode; // optional for mini mode
  anchorDate?: string; // optional for mini mode
  mode?: "full" | "mini";
}

// ─── constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_MINI = ["S", "M", "T", "W", "T", "F", "S"];

// ─── status colours ───────────────────────────────────────────────────────────

function eventColors(status: string) {
  switch (status) {
    case "Approved":
      return { pill: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" };
    case "Pending":
      return { pill: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" };
    case "Rejected":
      return { pill: "bg-rose-50 text-rose-800 border-rose-200", dot: "bg-rose-500" };
    case "Refunded":
      return { pill: "bg-zinc-50 text-zinc-700 border-zinc-200", dot: "bg-zinc-400" };
    default:
      return { pill: "bg-zinc-50 text-zinc-700 border-zinc-200", dot: "bg-zinc-400" };
  }
}

function pesos(total: string): string {
  return `₱${Number(total).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ─── date helpers (client-safe, UTC-noon anchor) ──────────────────────────────

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const ms = Date.UTC(y as number, (m as number) - 1, d as number, 12) + n * 86_400_000;
  const dt = new Date(ms);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function prevMonthDate(year: number, month: number): string {
  const m = month === 1 ? 12 : month - 1;
  const y = month === 1 ? year - 1 : year;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function nextMonthDate(year: number, month: number): string {
  const m = month === 12 ? 1 : month + 1;
  const y = month === 12 ? year + 1 : year;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** Monday-start week for the given date (client-safe, UTC-noon anchor). */
function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y as number, (m as number) - 1, d as number, 12)).getUTCDay();
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  return addDays(dateStr, daysToMon);
}

/** Manila "today" as YYYY-MM-DD for client-side init when no param is present. */
function manilaTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y as number, (m as number) - 1, d as number, 12));
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function weekRangeLabel(weekStart: string): string {
  const weekEnd = addDays(weekStart, 6);
  const [sy, sm, sd] = weekStart.split("-").map(Number);
  const [ey, em, ed] = weekEnd.split("-").map(Number);
  const s = new Date(Date.UTC(sy as number, (sm as number) - 1, sd as number, 12));
  const e = new Date(Date.UTC(ey as number, (em as number) - 1, ed as number, 12));
  const sLabel = s.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const eLabel = e.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  // Same month → "Oct 12 – 18, 2026" so the label fits one line on mobile.
  if (sy === ey && sm === em) {
    return `${sLabel} – ${ed}, ${ey}`;
  }
  return `${sLabel} – ${eLabel}`;
}

/** Build a 6-week grid (42 cells) for the given year/month. */
function buildMonthGrid(year: number, month: number): Array<{ date: string; inMonth: boolean }> {
  const firstDay = new Date(Date.UTC(year, month - 1, 1, 12));
  const startOffset = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const cells: Array<{ date: string; inMonth: boolean }> = [];

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const daysInPrev = new Date(Date.UTC(prevYear, prevMonth, 0, 12)).getUTCDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    cells.push({ date: `${prevYear}-${pad(prevMonth)}-${pad(d)}`, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${year}-${pad(month)}-${pad(d)}`, inMonth: true });
  }
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  let nd = 1;
  while (cells.length < 42) {
    cells.push({ date: `${nextYear}-${pad(nextMonth)}-${pad(nd++)}`, inMonth: false });
  }
  return cells;
}

// ─── main component ───────────────────────────────────────────────────────────

interface MonthData {
  events: CalendarEvent[];
  closures: ClosureRow[];
}

const monthKey = (year: number, month: number) => `${year}-${month}`;

export default function CalendarView({
  initialEvents,
  initialClosures,
  loadedYear,
  loadedMonth,
  today,
  view = "weekly",
  anchorDate,
  mode = "full",
}: Props) {
  const isMini = mode === "mini";

  // ── client-side navigation state (initialised from server-loaded anchor) ──
  const initialAnchor = anchorDate ?? today;
  const [viewMode, setViewMode] = useState<ViewMode>(view);
  const [year, setYear] = useState<number>(loadedYear);
  const [month, setMonth] = useState<number>(loadedMonth);
  const [anchor, setAnchor] = useState<string>(initialAnchor);
  const weekStart = useMemo(() => weekStartOf(anchor), [anchor]);

  // ── month data + on-demand cache (seed with server payload) ──────────────
  const cacheRef = useRef<Map<string, MonthData>>(new Map());
  const seeded = useRef(false);
  if (!seeded.current) {
    cacheRef.current.set(monthKey(loadedYear, loadedMonth), {
      events: initialEvents,
      closures: initialClosures,
    });
    seeded.current = true;
  }
  const [data, setData] = useState<MonthData>({
    events: initialEvents,
    closures: initialClosures,
  });
  const [loading, setLoading] = useState(false);
  // There can be more than one month in flight (a fast next/prev click). Count
  // them so the first one to land does not clear the spinner for the rest.
  const inFlight = useRef(0);

  // Fetch (or reuse) a month's data; returns the payload.
  const ensureMonth = useCallback(
    async (y: number, m: number): Promise<MonthData | null> => {
      const key = monthKey(y, m);
      const cached = cacheRef.current.get(key);
      if (cached) return cached;
      inFlight.current += 1;
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/calendar/events?year=${y}&month=${m}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as MonthData;
        const store: MonthData = {
          events: payload.events ?? [],
          closures: payload.closures ?? [],
        };
        cacheRef.current.set(key, store);
        return store;
      } catch {
        return null;
      } finally {
        inFlight.current -= 1;
        if (inFlight.current <= 0) setLoading(false);
      }
    },
    [],
  );

  // When the visible month changes, ensure its data is loaded.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await ensureMonth(year, month);
      if (cancelled) return;
      if (next) setData(next);
      else toast.error("Failed to load calendar events.");
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month, ensureMonth]);

  // ── URL sync (shareable, no navigation) ──────────────────────────────────
  const syncUrl = useCallback(
    (v: ViewMode, opts: { y: number; m: number; date: string }) => {
      const sp = new URLSearchParams();
      sp.set("view", v);
      if (v === "monthly") {
        sp.set("year", String(opts.y));
        sp.set("month", String(opts.m));
      } else {
        sp.set("date", opts.date);
      }
      const qs = sp.toString();
      window.history.replaceState(null, "", `/admin/calendar?${qs}`);
    },
    [],
  );

  const applyState = useCallback(
    (next: { view?: ViewMode; year?: number; month?: number; anchor?: string }) => {
      const v = next.view ?? viewMode;
      const y = next.year ?? year;
      const m = next.month ?? month;
      const a = next.anchor ?? anchor;
      setViewMode(v);
      setYear(y);
      setMonth(m);
      setAnchor(a);
      syncUrl(v, { y, m, date: a });
    },
    [viewMode, year, month, anchor, syncUrl],
  );

  // Switch view without moving the current period.
  function navView(v: ViewMode) {
    applyState({ view: v });
  }

  // Step the current period by one unit (month / week / day).
  function step(dir: -1 | 1) {
    if (viewMode === "monthly") {
      const d = dir === 1 ? nextMonthDate(year, month) : prevMonthDate(year, month);
      const [y2, m2] = d.split("-").map(Number);
      applyState({ year: y2, month: m2 });
    } else if (viewMode === "weekly" || viewMode === "schedule") {
      applyState({ anchor: addDays(weekStart, dir * 7) });
    } else {
      applyState({ anchor: addDays(anchor, dir) });
    }
  }

  // Jump to a specific day (opens daily view).
  function goToDay(date: string) {
    applyState({ view: "daily", anchor: date });
  }

  function jumpToToday() {
    const t = manilaTodayStr();
    if (viewMode === "monthly") {
      const [ty, tm] = t.split("-").map(Number);
      applyState({ year: ty, month: tm, anchor: t });
    } else {
      applyState({ anchor: t });
    }
  }

  const events = data.events;
  const closures = data.closures;

  // Day-panel state (first slider)
  const [dayPanelDate, setDayPanelDate] = useState<string | null>(null);
  // Booking-detail modal — shares the exact component the bookings table uses
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailBooking, setDetailBooking] = useState<BookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decision, setDecision] = useState<BookingDecision>(null);

  // Index events by date
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [events]);

  // After a decision, drop the current month from cache and refetch it.
  const refetchCurrentMonth = useCallback(async () => {
    cacheRef.current.delete(monthKey(year, month));
    const next = await ensureMonth(year, month);
    if (next) setData(next);
    else toast.error("Failed to refresh calendar.");
  }, [year, month, ensureMonth]);

  async function openBookingDetail(id: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailBooking(null);
    setDecision(null);
    try {
      const res = await fetch(`/api/admin/bookings/${id}`);
      const data = (await res.json()) as BookingDetail & { error?: unknown };
      if (res.ok) setDetailBooking(data);
      else {
        setDetailOpen(false);
        toast.error("Failed to load booking.");
      }
    } catch {
      setDetailOpen(false);
      toast.error("Failed to load booking.");
    } finally {
      setDetailLoading(false);
    }
  }

  function handleDetailOpenChange(open: boolean) {
    setDetailOpen(open);
    if (!open) {
      setDetailBooking(null);
      setDetailLoading(false);
      setDecision(null);
    }
  }

  // ── mini mode ──────────────────────────────────────────────────────────────
  if (isMini) {
    const grid = buildMonthGrid(year, month);
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1 pb-1">
          <h2 className="text-sm font-extrabold tracking-tight text-foreground">
            {MONTH_NAMES[month - 1]} {year}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const d = prevMonthDate(year, month);
                const [y2, m2] = d.split("-").map(Number);
                applyState({ year: y2, month: m2 });
              }}
              aria-label="Previous month"
              className="grid size-6 place-items-center rounded-lg border border-border bg-background text-foreground hover:bg-muted"
            >
              <ChevronLeft className="size-3" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                const d = nextMonthDate(year, month);
                const [y2, m2] = d.split("-").map(Number);
                applyState({ year: y2, month: m2 });
              }}
              aria-label="Next month"
              className="grid size-6 place-items-center rounded-lg border border-border bg-background text-foreground hover:bg-muted"
            >
              <ChevronRight className="size-3" aria-hidden />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7">
          {DAY_NAMES_MINI.map((d, i) => (
            <div key={i} className="py-1 text-center text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.map((cell) => {
            const dayEvents = byDate.get(cell.date) ?? [];
            const isToday = cell.date === today;
            const hasPending = dayEvents.some((e) => e.status === "Pending");
            const hasApproved = dayEvents.some((e) => e.status === "Approved");
            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => dayEvents.length > 0 && goToDay(cell.date)}
                className={cn(
                  "relative flex flex-col items-center py-1 text-[11px] font-semibold transition-colors",
                  cell.inMonth ? "text-foreground" : "text-foreground/25",
                  dayEvents.length > 0 ? "cursor-pointer hover:bg-muted rounded-lg" : "cursor-default",
                )}
              >
                <span className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] font-bold leading-none",
                  isToday ? "bg-primary text-primary-foreground" : "",
                )}>
                  {Number(cell.date.slice(8, 10))}
                </span>
                {dayEvents.length > 0 && (
                  <span className={cn(
                    "mt-0.5 size-1 rounded-full",
                    hasPending ? "bg-amber-500" : hasApproved ? "bg-emerald-500" : "bg-rose-500",
                  )} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── full mode ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2 sm:py-3">
        {/* Period label + nav */}
        <div className="flex min-w-0 items-center gap-2">
          {/* Prev */}
          <button
            type="button"
            aria-label="Previous"
            onClick={() => step(-1)}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background text-foreground hover:bg-muted"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>

          {/* Label */}
          <h2 className="min-w-0 flex-1 text-base font-extrabold tracking-tight text-foreground sm:flex-none sm:whitespace-nowrap">
            {viewMode === "monthly"
              ? `${MONTH_NAMES[month - 1]} ${year}`
              : viewMode === "schedule" || viewMode === "weekly"
                ? weekRangeLabel(weekStart)
                : dayLabel(anchor)}
          </h2>

          {/* Next */}
          <button
            type="button"
            aria-label="Next"
            onClick={() => step(1)}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background text-foreground hover:bg-muted"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>

          {/* Booking count badge */}
          <span className="shrink-0 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {events.length} booking{events.length !== 1 ? "s" : ""}
            {loading && <span className="ml-1 opacity-60">…</span>}
          </span>
        </div>

        {/* Right side: Today + view toggles */}
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <button
            type="button"
            onClick={jumpToToday}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted sm:py-1"
          >
            Today
          </button>

          {/* View toggle */}
          <div className="flex rounded-lg border border-border bg-muted p-0.5">
            {(["monthly", "weekly", "daily", "schedule"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => navView(v)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-semibold capitalize transition-colors sm:py-1",
                  viewMode === v
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── View body ────────────────────────────────────────────────────── */}
      {viewMode === "monthly" && (
        <MonthlyView
          year={year}
          month={month}
          today={today}
          byDate={byDate}
          onDayClick={(date) => setDayPanelDate(date)}
        />
      )}
      {viewMode === "weekly" && (
        <WeeklyView
          weekStart={weekStart}
          today={today}
          byDate={byDate}
          onDayClick={(date) => setDayPanelDate(date)}
          onNavDay={goToDay}
        />
      )}
      {viewMode === "daily" && (
        <DailyView
          date={anchor}
          today={today}
          byDate={byDate}
          onOpenBooking={openBookingDetail}
          detailLoading={detailLoading}
        />
      )}
      {viewMode === "schedule" && (
        <ScheduleView
          events={events}
          closures={closures ?? []}
          weekStart={weekStart}
          today={today}
          onOpenBooking={openBookingDetail}
          detailLoading={detailLoading}
        />
      )}

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-2.5">
        {(["Approved", "Pending", "Rejected", "Refunded"] as const).map((s) => {
          const c = eventColors(s);
          return (
            <span key={s} className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/70">
              <span className={cn("size-2 rounded-full", c.dot)} aria-hidden />
              {s}
            </span>
          );
        })}
      </div>

      {/* ── Day panel (1st slide-over) ───────────────────────────────────── */}
      <Sheet
        open={dayPanelDate !== null}
        onOpenChange={(o) => { if (!o) setDayPanelDate(null); }}
      >
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-sm">
          {dayPanelDate && (
            <DayPanel
              date={dayPanelDate}
              events={byDate.get(dayPanelDate) ?? []}
              onOpenBooking={(id) => {
                openBookingDetail(id);
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ── Booking detail (same modal as the bookings table View action) ── */}
      <BookingDetailDialog
        booking={detailBooking}
        open={detailOpen}
        onOpenChange={handleDetailOpenChange}
        decision={decision}
        onDecisionChange={setDecision}
        onDecided={() => { void refetchCurrentMonth(); }}
      />
    </>
  );
}

// ─── Monthly view ─────────────────────────────────────────────────────────────

function MonthlyView({
  year,
  month,
  today,
  byDate,
  onDayClick,
}: {
  year: number;
  month: number;
  today: string;
  byDate: Map<string, CalendarEvent[]>;
  onDayClick: (date: string) => void;
}) {
  const grid = buildMonthGrid(year, month);

  return (
    <>
      {/* Day-of-week header */}
      <div className="grid grid-cols-7">
        {DAY_NAMES_SHORT.map((d, i) => (
          <div
            key={i}
            className="border-b border-border py-2 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {grid.map((cell, idx) => {
          const dayEvents = byDate.get(cell.date) ?? [];
          const isToday = cell.date === today;
          const isLastRow = idx >= 35;
          const hasPending = dayEvents.some((e) => e.status === "Pending");
          const hasApproved = dayEvents.some((e) => e.status === "Approved");

          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onDayClick(cell.date)}
              className={cn(
                "group min-h-[64px] sm:min-h-[90px] border-b border-r border-border p-1.5 text-left transition-colors",
                isLastRow && "border-b-0",
                (idx + 1) % 7 === 0 && "border-r-0",
                !cell.inMonth && "bg-muted/30",
                dayEvents.length > 0 ? "cursor-pointer hover:bg-muted/50" : "cursor-default",
              )}
            >
              {/* Date number */}
              <div className="mb-1 flex justify-end">
                <span className={cn(
                  "flex size-6 items-center justify-center rounded-full text-[12px] font-bold leading-none",
                  isToday ? "bg-primary text-primary-foreground" : cell.inMonth ? "text-foreground" : "text-foreground/30",
                )}>
                  {Number(cell.date.slice(8, 10))}
                </span>
              </div>

              {/* Dot indicator + count */}
              {dayEvents.length > 0 && (
                <div className="flex min-w-0 items-center gap-1 px-0.5">
                  <span className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    hasPending ? "bg-amber-500" : hasApproved ? "bg-emerald-500" : "bg-rose-500",
                  )} />
                  <span className="min-w-0 truncate text-[11px] font-semibold text-foreground/70 leading-tight">
                    {dayEvents.length} booking{dayEvents.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─── Weekly view ──────────────────────────────────────────────────────────────

function WeeklyView({
  weekStart,
  today,
  byDate,
  onDayClick,
  onNavDay,
}: {
  weekStart: string;
  today: string;
  byDate: Map<string, CalendarEvent[]>;
  onDayClick: (date: string) => void;
  onNavDay: (date: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <>
      {/* Desktop: 7-col grid */}
      <div className="hidden sm:grid grid-cols-7 divide-x divide-border">
        {days.map((date, col) => {
          const dayEvents = byDate.get(date) ?? [];
          const isToday = date === today;
          const [, , dd] = date.split("-").map(Number);
          const dowLabel = DAY_NAMES_SHORT[new Date(date + "T12:00:00Z").getUTCDay()]!;

          return (
            <div key={date} className="flex min-h-[320px] min-w-0 flex-col">
              {/* Header row */}
              <div
                className={cn(
                  "border-b border-border px-2 py-3 text-center",
                  isToday && "bg-primary/5",
                )}
              >
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {dowLabel}
                </p>
                <button
                  type="button"
                  onClick={() => onNavDay(date)}
                  className={cn(
                    "mx-auto mt-1.5 flex size-8 items-center justify-center rounded-full text-sm font-extrabold leading-none transition-colors",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  {dd}
                </button>
              </div>

              {/* Events */}
              <div className="flex flex-1 flex-col gap-1.5 p-2">
                {dayEvents.length === 0 && (
                  <p className="mt-4 text-center text-[11px] text-foreground/25">—</p>
                )}
                {dayEvents.map((ev) => {
                  const c = eventColors(ev.status);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onDayClick(date)}
                      className={cn(
                        "group w-full truncate rounded-lg border px-2.5 py-2 text-left transition-opacity hover:opacity-80",
                        c.pill,
                      )}
                    >
                      <p className="truncate text-[11px] font-bold leading-tight">{ev.fullName}</p>
                      <p className="mt-1 truncate text-[10px] font-medium leading-tight opacity-80">
                        {formatConsecutiveSlots(ev.slotStarts)}
                      </p>
                      <span className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide opacity-60 group-hover:opacity-100">
                        <Eye className="size-2.5" aria-hidden />
                        View
                      </span>
                    </button>
                  );
                })}
                {dayEvents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onDayClick(date)}
                    className="mt-auto w-full truncate rounded-lg py-1.5 text-center text-[10px] font-semibold text-muted-foreground hover:bg-muted/60"
                  >
                    View all →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile: horizontal day scroller + day agenda */}
      <div className="sm:hidden">
        {/* Day strip */}
        <div className="flex gap-2.5 overflow-x-auto px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {days.map((date) => {
            const dayEvents = byDate.get(date) ?? [];
            const isToday = date === today;
            const [, , dd] = date.split("-").map(Number);
            const dowLabel = DAY_NAMES_SHORT[new Date(date + "T12:00:00Z").getUTCDay()]!;
            return (
              <button
                key={date}
                type="button"
                onClick={() => onNavDay(date)}
                className={cn(
                  "flex w-[52px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border py-2.5 transition-colors",
                  isToday
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-background hover:bg-muted/60",
                )}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {dowLabel}
                </span>
                <span className={cn(
                  "flex size-8 items-center justify-center rounded-full text-sm font-extrabold leading-none",
                  isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                )}>
                  {dd}
                </span>
                <span className="flex h-2 items-center gap-1">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <span
                      key={ev.id}
                      className={cn("size-1.5 rounded-full", eventColors(ev.status).dot)}
                      aria-hidden
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        {/* Day agenda for the week */}
        <div className="space-y-5 border-t border-border px-4 pb-6 pt-5">
          {days.map((date) => {
            const dayEvents = byDate.get(date) ?? [];
            if (dayEvents.length === 0) return null;
            const isToday = date === today;
            const [, , dd] = date.split("-").map(Number);
            const dowLabel = DAY_NAMES_SHORT[new Date(date + "T12:00:00Z").getUTCDay()]!;
            return (
              <div key={date}>
                <div className="mb-2.5 flex items-baseline gap-2">
                  <span className={cn(
                    "text-[11px] font-bold uppercase tracking-wider",
                    isToday ? "text-primary" : "text-muted-foreground",
                  )}>
                    {dowLabel}
                  </span>
                  <span className="text-sm font-extrabold text-foreground">{dd}</span>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {dayEvents.length} booking{dayEvents.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {dayEvents.map((ev) => {
                    const c = eventColors(ev.status);
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onDayClick(date)}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-opacity hover:opacity-85",
                          c.pill,
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold leading-snug">
                            {ev.fullName}
                          </span>
                          <span className="mt-1 block truncate text-xs font-medium leading-snug opacity-75">
                            {formatConsecutiveSlots(ev.slotStarts)}
                          </span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-foreground/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-foreground/70 transition-colors group-hover:bg-foreground/20">
                          <Eye className="size-3.5" aria-hidden />
                          View
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {days.every((date) => (byDate.get(date) ?? []).length === 0) && (
            <p className="py-14 text-center text-sm text-muted-foreground">
              No bookings this week.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Daily view ───────────────────────────────────────────────────────────────

function DailyView({
  date,
  today,
  byDate,
  onOpenBooking,
  detailLoading,
}: {
  date: string;
  today: string;
  byDate: Map<string, CalendarEvent[]>;
  onOpenBooking: (id: string) => void;
  detailLoading: boolean;
}) {
  const dayEvents = byDate.get(date) ?? [];

  return (
    <div className="px-4 py-4">
      {dayEvents.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No bookings on this day.
        </p>
      ) : (
        <div className="space-y-2">
          {dayEvents.map((ev) => {
            const c = eventColors(ev.status);
            return (
              <button
                key={ev.id}
                type="button"
                disabled={detailLoading}
                onClick={() => onOpenBooking(ev.id)}
                className={cn(
                  "group w-full rounded-xl border p-3 text-left transition-opacity hover:opacity-80 disabled:opacity-50",
                  c.pill,
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{ev.fullName}</p>
                    <p className="mt-0.5 text-[11px] font-medium opacity-80">
                      {ev.courts}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium opacity-70">
                      {formatConsecutiveSlots(ev.slotStarts)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <BookingStatusBadge status={ev.status} />
                    <span className="text-xs font-bold text-foreground">{pesos(ev.total)}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/70 transition-colors group-hover:bg-foreground/20">
                      <Eye className="size-3" aria-hidden />
                      View
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Schedule view (agenda / Google Calendar style) ───────────────────────────

function formatManilaTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" });
}

function formatClosureDateRange(startAt: string, endAt: string): string {
  const s = new Date(startAt);
  const e = new Date(endAt);
  const sLabel = s.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
  const eLabel = e.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
  const tSame = s.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }).localeCompare(
    e.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }));
  if (tSame === 0) {
    const st = s.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" });
    const et = e.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" });
    return `${st} – ${et}`;
  }
  const st = s.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" });
  const et = e.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" });
  return `${sLabel}, ${st} – ${eLabel}, ${et}`;
}

function ScheduleView({
  events,
  closures,
  weekStart,
  today,
  onOpenBooking,
  detailLoading,
}: {
  events: CalendarEvent[];
  closures: ClosureRow[];
  weekStart: string;
  today: string;
  onOpenBooking: (id: string) => void;
  detailLoading: boolean;
}) {
  // Group events by date and render
  type DayGroup = { date: string; bookings: CalendarEvent[]; closures: ClosureRow[] };
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const groups: DayGroup[] = days.map((date) => ({
    date,
    bookings: events.filter((e) => e.date === date),
    closures: closures.filter((c) => {
      // Manila day, not the UTC day: a closure starting 00:00 Manila is
      // ...T16:00:00Z on the *previous* UTC date, so slicing the ISO string
      // filed it under the wrong column — the same defect as the Play Date
      // report. manilaDateStr() is the canonical helper (client-safe).
      const start = new Date(c.startAt);
      if (Number.isNaN(start.getTime())) return false;
      return manilaDateStr(start) === date;
    }),
  })).filter((g) => g.bookings.length > 0 || g.closures.length > 0);

  if (groups.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No events this week.</p>;
  }

  return (
    <div className="px-4 py-4">
      {groups.map((group) => {
        const [y, m, d] = group.date.split("-").map(Number);
        const dt = new Date(Date.UTC(y as number, (m as number) - 1, d as number, 12));
        const isToday = group.date === today;
        const heading = dt.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        });
        return (
          <div key={group.date} className="mb-6 last:mb-0">
            <p className={cn(
              "mb-2 text-xs font-bold uppercase tracking-wider",
              isToday ? "text-primary" : "text-muted-foreground",
            )}>
              {heading}
            </p>
            <div className="space-y-2">
              {group.bookings.map((ev) => {
                const c = eventColors(ev.status);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    disabled={detailLoading}
                    onClick={() => onOpenBooking(ev.id)}
                    className={cn(
                      "group w-full rounded-xl border bg-background p-3 text-left transition-opacity hover:bg-muted/50 disabled:opacity-50",
                      "border-border",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn("mt-0.5 size-2.5 shrink-0 rounded-full", c.dot)} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">{ev.fullName}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{ev.courts}</p>
                        <p className="mt-0.5 text-xs font-medium text-foreground/70">
                          {formatConsecutiveSlots(ev.slotStarts)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <BookingStatusBadge status={ev.status} />
                        <span className="text-xs font-bold text-foreground">{pesos(ev.total)}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/70 transition-colors group-hover:bg-foreground/20">
                          <Eye className="size-3" aria-hidden />
                          View
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {group.closures.map((cl) => {
                const isGlobal = cl.scope === "global";
                return (
                  <div
                    key={cl.id}
                    className="w-full rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-left"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 size-2.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground">
                          {isGlobal ? "Court Closure" : `Closure · ${cl.courtName}`}
                        </p>
                        {cl.reason && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{cl.reason}</p>
                        )}
                        <p className="mt-0.5 text-xs font-medium text-foreground/70">
                          {formatClosureDateRange(cl.startAt, cl.endAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Day panel (1st slide-over: list of bookings for a day) ───────────────────

function DayPanel({
  date,
  events,
  onOpenBooking,
}: {
  date: string;
  events: CalendarEvent[];
  onOpenBooking: (id: string) => void;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleOpen(id: string) {
    setLoadingId(id);
    await onOpenBooking(id);
    setLoadingId(null);
  }

  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y as number, (m as number) - 1, d as number, 12));
  const label = dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <>
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle>{label}</SheetTitle>
        <SheetDescription>
          {events.length} booking{events.length !== 1 ? "s" : ""} on this day
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-2 px-4 py-4">
        {events.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">No bookings on this day.</p>
        )}
        {events.map((ev) => {
          const c = eventColors(ev.status);
          const isLoading = loadingId === ev.id;
          return (
            <button
              key={ev.id}
              type="button"
              disabled={loadingId !== null}
              onClick={() => handleOpen(ev.id)}
              className={cn(
                "group w-full rounded-xl border p-3 text-left transition-all hover:shadow-sm disabled:opacity-60",
                c.pill,
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{ev.fullName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{ev.courts}</p>
                  <p className="mt-1 text-xs font-medium text-foreground/70">
                    {formatConsecutiveSlots(ev.slotStarts)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <BookingStatusBadge status={ev.status} />
                  <span className="text-xs font-bold text-foreground">{pesos(ev.total)}</span>
                  {isLoading ? (
                    <LoadingAnimation size="compact" label="Loading" />
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/70 transition-colors group-hover:bg-foreground/20">
                      <Eye className="size-3" aria-hidden />
                      View
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─── shared sub-components ────────────────────────────────────────────────────

