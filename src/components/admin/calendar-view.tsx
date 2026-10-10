"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Check, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import type { BookingDetail } from "@/lib/admin/bookings";

// ─── types ────────────────────────────────────────────────────────────────────

type ViewMode = "daily" | "weekly" | "monthly";

interface Props {
  events: CalendarEvent[];
  year: number;
  month: number; // 1-based
  today: string; // "YYYY-MM-DD"
  view?: ViewMode; // optional for mini mode
  anchorDate?: string; // optional for mini mode
  weekStart?: string; // optional for mini mode
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
      return { pill: "bg-pine/10 text-pine border-pine/20", dot: "bg-pine" };
    case "Pending":
      return { pill: "bg-flame/10 text-flame border-flame/20", dot: "bg-flame" };
    case "Rejected":
      return { pill: "bg-error/10 text-error border-error/20", dot: "bg-error" };
    default:
      return { pill: "bg-oat text-ink/60 border-line", dot: "bg-warm-muted" };
  }
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Approved") return "default";
  if (status === "Rejected") return "destructive";
  if (status === "Pending") return "secondary";
  return "outline";
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

export default function CalendarView({
  events,
  year,
  month,
  today,
  view = "weekly",
  anchorDate = today,
  weekStart = today,
  mode = "full",
}: Props) {
  const router = useRouter();
  const isMini = mode === "mini";

  // Day-panel state (first slider)
  const [dayPanelDate, setDayPanelDate] = useState<string | null>(null);
  // Booking-detail state (second slider)
  const [detailBooking, setDetailBooking] = useState<BookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Index events by date
  const byDate = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const list = byDate.get(ev.date) ?? [];
    list.push(ev);
    byDate.set(ev.date, list);
  }

  function navigate(params: Record<string, string>) {
    const sp = new URLSearchParams(params);
    router.push(`/admin/calendar?${sp.toString()}`);
  }

  function navView(v: ViewMode) {
    const base: Record<string, string> = { view: v };
    if (v === "monthly") {
      base.y = String(year);
      base.m = String(month);
    } else {
      base.date = anchorDate;
    }
    navigate(base);
  }

  async function openBookingDetail(id: string) {
    setDetailLoading(true);
    setDetailBooking(null);
    try {
      const res = await fetch(`/api/admin/bookings/${id}`);
      const data = (await res.json()) as BookingDetail & { error?: unknown };
      if (res.ok) setDetailBooking(data);
      else toast.error("Failed to load booking.");
    } catch {
      toast.error("Failed to load booking.");
    } finally {
      setDetailLoading(false);
    }
  }

  // ── mini mode ──────────────────────────────────────────────────────────────
  if (isMini) {
    const grid = buildMonthGrid(year, month);
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1 pb-1">
          <h2 className="text-sm font-extrabold tracking-tight text-ink">
            {MONTH_NAMES[month - 1]} {year}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const d = prevMonthDate(year, month);
                const [y2, m2] = d.split("-").map(Number);
                navigate({ view: "monthly", y: String(y2), m: String(m2) });
              }}
              aria-label="Previous month"
              className="grid size-6 place-items-center rounded-lg border border-line bg-white text-ink hover:bg-oat"
            >
              <ChevronLeft className="size-3" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                const d = nextMonthDate(year, month);
                const [y2, m2] = d.split("-").map(Number);
                navigate({ view: "monthly", y: String(y2), m: String(m2) });
              }}
              aria-label="Next month"
              className="grid size-6 place-items-center rounded-lg border border-line bg-white text-ink hover:bg-oat"
            >
              <ChevronRight className="size-3" aria-hidden />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7">
          {DAY_NAMES_MINI.map((d, i) => (
            <div key={i} className="py-1 text-center text-[9px] font-bold uppercase tracking-wider text-warm-muted">
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
                onClick={() => dayEvents.length > 0 && navigate({ view: "daily", date: cell.date })}
                className={cn(
                  "relative flex flex-col items-center py-1 text-[11px] font-semibold transition-colors",
                  cell.inMonth ? "text-ink" : "text-ink/25",
                  dayEvents.length > 0 ? "cursor-pointer hover:bg-oat rounded-lg" : "cursor-default",
                )}
              >
                <span className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] font-bold leading-none",
                  isToday ? "bg-flame text-white" : "",
                )}>
                  {new Date(cell.date + "T12:00:00Z").getUTCDate()}
                </span>
                {dayEvents.length > 0 && (
                  <span className={cn(
                    "mt-0.5 size-1 rounded-full",
                    hasPending ? "bg-flame" : hasApproved ? "bg-pine" : "bg-error",
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        {/* Period label + nav */}
        <div className="flex items-center gap-2">
          {/* Prev */}
          <button
            type="button"
            aria-label="Previous"
            onClick={() => {
              if (view === "monthly") {
                const d = prevMonthDate(year, month);
                const [y2, m2] = d.split("-").map(Number);
                navigate({ view: "monthly", y: String(y2), m: String(m2) });
              } else if (view === "weekly") {
                navigate({ view: "weekly", date: addDays(weekStart, -7) });
              } else {
                navigate({ view: "daily", date: addDays(anchorDate, -1) });
              }
            }}
            className="grid size-8 place-items-center rounded-lg border border-line bg-white text-ink hover:bg-oat"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>

          {/* Label */}
          <h2 className="text-base font-extrabold tracking-tight text-ink">
            {view === "monthly"
              ? `${MONTH_NAMES[month - 1]} ${year}`
              : view === "weekly"
                ? weekRangeLabel(weekStart)
                : dayLabel(anchorDate)}
          </h2>

          {/* Next */}
          <button
            type="button"
            aria-label="Next"
            onClick={() => {
              if (view === "monthly") {
                const d = nextMonthDate(year, month);
                const [y2, m2] = d.split("-").map(Number);
                navigate({ view: "monthly", y: String(y2), m: String(m2) });
              } else if (view === "weekly") {
                navigate({ view: "weekly", date: addDays(weekStart, 7) });
              } else {
                navigate({ view: "daily", date: addDays(anchorDate, 1) });
              }
            }}
            className="grid size-8 place-items-center rounded-lg border border-line bg-white text-ink hover:bg-oat"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>

          {/* Booking count badge */}
          <span className="rounded-full bg-oat px-2 py-0.5 text-[11px] font-semibold text-warm-muted">
            {events.length} booking{events.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Right side: Today + view toggles */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (view === "monthly") {
                const now = new Date();
                navigate({ view: "monthly", y: String(now.getUTCFullYear()), m: String(now.getUTCMonth() + 1) });
              } else if (view === "weekly") {
                navigate({ view: "weekly", date: today });
              } else {
                navigate({ view: "daily", date: today });
              }
            }}
            className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink hover:bg-oat"
          >
            Today
          </button>

          {/* View toggle */}
          <div className="flex rounded-lg border border-line bg-oat p-0.5">
            {(["daily", "weekly", "monthly"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => navView(v)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-colors",
                  view === v
                    ? "bg-white text-ink shadow-sm"
                    : "text-warm-muted hover:text-ink",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── View body ────────────────────────────────────────────────────── */}
      {view === "monthly" && (
        <MonthlyView
          year={year}
          month={month}
          today={today}
          byDate={byDate}
          onDayClick={(date) => setDayPanelDate(date)}
        />
      )}
      {view === "weekly" && (
        <WeeklyView
          weekStart={weekStart}
          today={today}
          byDate={byDate}
          onDayClick={(date) => setDayPanelDate(date)}
          onNavDay={(date) => navigate({ view: "daily", date })}
        />
      )}
      {view === "daily" && (
        <DailyView
          date={anchorDate}
          today={today}
          byDate={byDate}
          onOpenBooking={openBookingDetail}
          detailLoading={detailLoading}
        />
      )}

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-2.5">
        {(["Approved", "Pending", "Rejected"] as const).map((s) => {
          const c = eventColors(s);
          return (
            <span key={s} className="flex items-center gap-1.5 text-[11px] font-semibold text-ink/70">
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
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto border-line bg-parchment p-0 sm:max-w-sm">
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

      {/* ── Booking detail (2nd slide-over) ─────────────────────────────── */}
      <Sheet
        open={detailBooking !== null || detailLoading}
        onOpenChange={(o) => { if (!o) { setDetailBooking(null); setDetailLoading(false); } }}
      >
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto border-line bg-parchment p-0 sm:max-w-md">
          {detailLoading && (
            <div className="flex flex-1 items-center justify-center py-20">
              <LoadingAnimation label="Loading booking" />
            </div>
          )}
          {detailBooking && (
            <BookingDetailSheet
              booking={detailBooking}
              onClose={() => setDetailBooking(null)}
              onUpdate={() => router.refresh()}
            />
          )}
        </SheetContent>
      </Sheet>
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
            className="border-b border-line py-2 text-center text-[11px] font-bold uppercase tracking-wider text-warm-muted"
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
                "group min-h-[90px] border-b border-r border-line p-1.5 text-left transition-colors",
                isLastRow && "border-b-0",
                (idx + 1) % 7 === 0 && "border-r-0",
                !cell.inMonth && "bg-oat/30",
                dayEvents.length > 0 ? "cursor-pointer hover:bg-oat/50" : "cursor-default",
              )}
            >
              {/* Date number */}
              <div className="mb-1 flex justify-end">
                <span className={cn(
                  "flex size-6 items-center justify-center rounded-full text-[12px] font-bold leading-none",
                  isToday ? "bg-flame text-white" : cell.inMonth ? "text-ink" : "text-ink/30",
                )}>
                  {new Date(cell.date + "T12:00:00Z").getUTCDate()}
                </span>
              </div>

              {/* Dot indicator + count */}
              {dayEvents.length > 0 && (
                <div className="flex items-center gap-1 px-0.5">
                  <span className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    hasPending ? "bg-flame" : hasApproved ? "bg-pine" : "bg-error",
                  )} />
                  <span className="text-[11px] font-semibold text-ink/70 leading-tight">
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
    <div className="grid grid-cols-7 divide-x divide-line">
      {days.map((date, col) => {
        const dayEvents = byDate.get(date) ?? [];
        const isToday = date === today;
        const [, , dd] = date.split("-").map(Number);
        const dowLabel = DAY_NAMES_SHORT[new Date(date + "T12:00:00Z").getUTCDay()]!;

        return (
          <div key={date} className="flex min-h-[320px] flex-col">
            {/* Header row */}
            <div
              className={cn(
                "border-b border-line px-2 py-2 text-center",
                isToday && "bg-flame/5",
              )}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-warm-muted">
                {dowLabel}
              </p>
              <button
                type="button"
                onClick={() => onNavDay(date)}
                className={cn(
                  "mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-sm font-extrabold leading-none transition-colors",
                  isToday
                    ? "bg-flame text-white"
                    : "text-ink hover:bg-oat",
                )}
              >
                {dd}
              </button>
            </div>

            {/* Events */}
            <div className="flex flex-1 flex-col gap-1 p-1.5">
              {dayEvents.length === 0 && (
                <p className="mt-3 text-center text-[10px] text-ink/25">—</p>
              )}
              {dayEvents.map((ev) => {
                const c = eventColors(ev.status);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onDayClick(date)}
                    className={cn(
                      "w-full rounded border px-1.5 py-1 text-left transition-opacity hover:opacity-80",
                      c.pill,
                    )}
                  >
                    <p className="truncate text-[11px] font-bold leading-tight">{ev.fullName}</p>
                    <p className="mt-0.5 truncate text-[10px] font-medium leading-tight opacity-80">
                      {formatConsecutiveSlots(ev.slotStarts)}
                    </p>
                  </button>
                );
              })}
              {dayEvents.length > 0 && (
                <button
                  type="button"
                  onClick={() => onDayClick(date)}
                  className="mt-auto w-full rounded-lg py-1 text-center text-[10px] font-semibold text-warm-muted hover:bg-oat/60"
                >
                  View all →
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
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
        <p className="py-12 text-center text-sm text-warm-muted">
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
                  "w-full rounded-xl border p-3 text-left transition-opacity hover:opacity-80 disabled:opacity-50",
                  c.pill,
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{ev.fullName}</p>
                    <p className="mt-0.5 text-[11px] font-medium opacity-80">
                      {ev.courts}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium opacity-70">
                      {formatConsecutiveSlots(ev.slotStarts)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold",
                      c.pill,
                    )}>
                      {ev.status}
                    </span>
                    <span className="text-xs font-bold text-ink">{pesos(ev.total)}</span>
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
      <SheetHeader className="border-b border-line bg-white px-5 py-4">
        <SheetTitle className="text-base font-extrabold text-ink">{label}</SheetTitle>
        <SheetDescription className="mt-0.5 text-xs text-warm-muted">
          {events.length} booking{events.length !== 1 ? "s" : ""} on this day
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-2 px-4 py-4">
        {events.length === 0 && (
          <p className="py-12 text-center text-sm text-warm-muted">No bookings on this day.</p>
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
                "w-full rounded-xl border bg-white p-3 text-left transition-all hover:shadow-sm disabled:opacity-60",
                "border-line",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{ev.fullName}</p>
                  <p className="mt-0.5 text-xs text-warm-muted">{ev.courts}</p>
                  <p className="mt-1 text-xs font-medium text-ink/70">
                    {formatConsecutiveSlots(ev.slotStarts)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold",
                    c.pill,
                  )}>
                    {ev.status}
                  </span>
                  <span className="text-xs font-bold text-ink">{pesos(ev.total)}</span>
                  {isLoading && <LoadingAnimation size="compact" label="Loading" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─── Booking detail sheet (2nd slide-over) ────────────────────────────────────

function BookingDetailSheet({
  booking,
  onClose,
  onUpdate,
}: {
  booking: BookingDetail;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofFailed, setProofFailed] = useState(false);
  const [proofLoaded, setProofLoaded] = useState(false);
  const pending = booking.status === "Pending";

  // Load proof on mount
  const loadProof = useCallback(async () => {
    if (proofLoaded || proofFailed || !booking.proofPath) {
      setProofLoaded(true);
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/proofs/read?path=${encodeURIComponent(booking.proofPath)}`,
      );
      const data = (await res.json()) as { signedUrl?: string };
      if (res.ok && data.signedUrl) setProofUrl(data.signedUrl);
      else setProofFailed(true);
    } catch {
      setProofFailed(true);
    }
    setProofLoaded(true);
  }, [booking.proofPath, proofLoaded, proofFailed]);

  // Load proof when component mounts
  useEffect(() => { void loadProof(); }, [loadProof]);

  async function decide(kind: "approve" | "reject") {
    if (kind === "reject" && !reason.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }
    setBusy(kind);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kind === "reject" ? { reason: reason.trim() } : {}),
      });
      const data = (await res.json()) as {
        error?: { message?: string };
        deduped?: boolean;
        status?: string;
      };
      if (!res.ok) {
        toast.error(data.error?.message ?? `${kind} failed.`);
        return;
      }
      toast.success(
        data.deduped
          ? `Already ${data.status ?? booking.status} — no duplicate email sent.`
          : kind === "approve"
            ? "Booking approved."
            : "Booking rejected.",
      );
      onClose();
      onUpdate();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  function copyTrackingLink() {
    const url = `${window.location.origin}/track/${booking.trackingToken}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Tracking link copied."),
      () => toast.error("Copy failed."),
    );
  }

  return (
    <>
      <SheetHeader className="border-b border-line bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <SheetTitle className="text-base font-extrabold text-ink">
              {booking.fullName}
            </SheetTitle>
            <SheetDescription className="mt-0.5 text-xs text-warm-muted">
              {booking.email} · {booking.phone}
            </SheetDescription>
          </div>
          <Badge variant={statusVariant(booking.status)} className="mt-0.5 shrink-0 text-[11px]">
            {booking.status}
          </Badge>
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-4 px-5 py-5">
        {/* Booking details */}
        <div className="rounded-xl border border-line bg-white p-4 space-y-2">
          <DetailRow label="Courts" value={booking.courts || "—"} />
          <DetailRow label="Date" value={booking.date} />
          <DetailRow
            label="Slots"
            value={formatConsecutiveSlots(booking.slots.map((s) => s.slotStart))}
          />
          <DetailRow
            label="Paddles"
            value={
              booking.paddleQty > 0
                ? `${booking.paddleQty}${booking.paddleHours ? ` × ${booking.paddleHours}h` : ""}`
                : "None"
            }
          />
          <DetailRow label="Ball" value={booking.hasBall ? "Yes" : "No"} />
          <DetailRow label="Total" value={pesos(booking.total)} bold />
          {booking.rejectReason && (
            <DetailRow label="Reject reason" value={booking.rejectReason} />
          )}
        </div>

        {/* Payment proof */}
        <div>
          <p className="mb-2 text-xs font-bold text-ink/60 uppercase tracking-wider">
            Payment proof
          </p>
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            {proofUrl ? (
              <a href={proofUrl} target="_blank" rel="noreferrer" className="block">
                <img src={proofUrl} alt="Payment proof" className="w-full object-contain" />
              </a>
            ) : proofFailed || !booking.proofPath ? (
              <p className="px-4 py-6 text-center text-sm text-warm-muted">
                Proof unavailable.
              </p>
            ) : (
              <div className="flex min-h-24 items-center justify-center">
                <LoadingAnimation label="Loading payment proof" />
              </div>
            )}
          </div>
        </div>

        {/* Copy tracking link */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyTrackingLink}
            className="h-8 rounded-lg border-line text-xs font-semibold"
          >
            <Copy className="mr-1.5 size-3.5" /> Copy tracking link
          </Button>
        </div>

        {/* Decision actions */}
        {pending && (
          <div className="space-y-3 rounded-xl border border-line bg-white p-4">
            <p className="text-xs font-bold text-ink">Decision</p>

            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => decide("approve")}
              className="h-8 w-full rounded-lg bg-pine text-xs font-bold text-white hover:bg-pine/90"
            >
              {busy === "approve" ? (
                <span className="flex items-center gap-1.5">
                  <LoadingAnimation size="compact" label="Approving" />
                  Approving…
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Check className="size-3.5" /> Approve
                </span>
              )}
            </Button>

            <div className="space-y-1.5">
              <Label
                htmlFor={`cal-reason-${booking.id}`}
                className="text-xs font-semibold text-ink/70"
              >
                Rejection reason (required)
              </Label>
              <Input
                id={`cal-reason-${booking.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for rejection…"
                className="h-9 rounded-lg border-line text-sm"
              />
            </div>

            <Button
              size="sm"
              variant="destructive"
              disabled={busy !== null}
              onClick={() => decide("reject")}
              className="h-8 w-full rounded-lg text-xs font-bold"
            >
              {busy === "reject" ? (
                <span className="flex items-center gap-1.5">
                  <LoadingAnimation size="compact" label="Rejecting" />
                  Rejecting…
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <X className="size-3.5" /> Reject
                </span>
              )}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── shared sub-components ────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-warm-muted">{label}</span>
      <span className={`text-right ${bold ? "font-bold text-ink" : "text-ink/80"}`}>
        {value}
      </span>
    </div>
  );
}
