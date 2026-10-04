"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/admin/calendar";

// ─── types ───────────────────────────────────────────────────────────────────

interface Props {
  events: CalendarEvent[];
  year: number;
  month: number; // 1-based
  today: string; // "YYYY-MM-DD"
  mode?: "full" | "mini";
}

// ─── status colours ──────────────────────────────────────────────────────────

function eventColors(status: string) {
  switch (status) {
    case "Approved":
      return {
        pill: "bg-pine/10 text-pine border-pine/20",
        dot: "bg-pine",
      };
    case "Pending":
      return {
        pill: "bg-flame/10 text-flame border-flame/20",
        dot: "bg-flame",
      };
    case "Rejected":
      return {
        pill: "bg-error/10 text-error border-error/20",
        dot: "bg-error",
      };
    default:
      return {
        pill: "bg-oat text-ink/60 border-line",
        dot: "bg-warm-muted",
      };
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_NAMES_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_MINI = ["S", "M", "T", "W", "T", "F", "S"];

/** Build a 6-week grid (42 cells) for the given year/month. */
function buildGrid(year: number, month: number): Array<{ date: string; inMonth: boolean }> {
  const firstDay = new Date(year, month - 1, 1);
  const startOffset = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: Array<{ date: string; inMonth: boolean }> = [];
  const pad = (n: number) => String(n).padStart(2, "0");

  // Leading days from prev month
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const daysInPrev = new Date(prevYear, prevMonth, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    cells.push({ date: `${prevYear}-${pad(prevMonth)}-${pad(d)}`, inMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${year}-${pad(month)}-${pad(d)}`, inMonth: true });
  }

  // Trailing days into next month
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  let nd = 1;
  while (cells.length < 42) {
    cells.push({ date: `${nextYear}-${pad(nextMonth)}-${pad(nd++)}`, inMonth: false });
  }

  return cells;
}

function prevMonthHref(year: number, month: number): string {
  const m = month === 1 ? 12 : month - 1;
  const y = month === 1 ? year - 1 : year;
  return `/admin/calendar?y=${y}&m=${m}`;
}

function nextMonthHref(year: number, month: number): string {
  const m = month === 12 ? 1 : month + 1;
  const y = month === 12 ? year + 1 : year;
  return `/admin/calendar?y=${y}&m=${m}`;
}

// ─── main component ───────────────────────────────────────────────────────────

export default function CalendarView({
  events,
  year,
  month,
  today,
  mode = "full",
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const grid = buildGrid(year, month);
  const isMini = mode === "mini";

  // Index events by date
  const byDate = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const list = byDate.get(ev.date) ?? [];
    list.push(ev);
    byDate.set(ev.date, list);
  }

  function navigate(href: string) {
    router.push(href);
  }

  return (
    <div className={cn("flex flex-col", isMini ? "gap-2" : "gap-0")}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className={cn(
        "flex items-center justify-between",
        isMini ? "px-1 pb-1" : "mb-0 border-b border-line px-4 py-3",
      )}>
        <div className="flex items-center gap-2">
          <h2 className={cn(
            "font-extrabold tracking-tight text-ink",
            isMini ? "text-sm" : "text-base",
          )}>
            {MONTH_NAMES[month - 1]} {year}
          </h2>
          {!isMini && (
            <span className="rounded-full bg-oat px-2 py-0.5 text-[11px] font-semibold text-warm-muted">
              {events.length} booking{events.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isMini && (
            <button
              type="button"
              onClick={() => navigate(`/admin/calendar?y=${new Date().getFullYear()}&m=${new Date().getMonth() + 1}`)}
              className="mr-1 rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink hover:bg-oat"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(isMini
              ? `/admin/calendar?y=${month === 1 ? year - 1 : year}&m=${month === 1 ? 12 : month - 1}`
              : prevMonthHref(year, month)
            )}
            aria-label="Previous month"
            className={cn(
              "grid place-items-center rounded-lg border border-line bg-white text-ink hover:bg-oat",
              isMini ? "size-6" : "size-8",
            )}
          >
            <ChevronLeft className={isMini ? "size-3" : "size-4"} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => navigate(isMini
              ? `/admin/calendar?y=${month === 12 ? year + 1 : year}&m=${month === 12 ? 1 : month + 1}`
              : nextMonthHref(year, month)
            )}
            aria-label="Next month"
            className={cn(
              "grid place-items-center rounded-lg border border-line bg-white text-ink hover:bg-oat",
              isMini ? "size-6" : "size-8",
            )}
          >
            <ChevronRight className={isMini ? "size-3" : "size-4"} aria-hidden />
          </button>
        </div>
      </div>

      {/* ── Day-of-week header ──────────────────────────────────────── */}
      <div className="grid grid-cols-7">
        {(isMini ? DAY_NAMES_MINI : DAY_NAMES_FULL).map((d, i) => (
          <div
            key={i}
            className={cn(
              "text-center font-bold uppercase tracking-wider text-warm-muted",
              isMini ? "py-1 text-[9px]" : "border-b border-line py-2 text-[11px]",
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* ── Grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-7">
        {grid.map((cell, idx) => {
          const dayEvents = byDate.get(cell.date) ?? [];
          const isToday = cell.date === today;
          const isLastRow = idx >= 35;

          if (isMini) {
            // Mini: just the number + a dot indicator if events
            const hasPending = dayEvents.some((e) => e.status === "Pending");
            const hasApproved = dayEvents.some((e) => e.status === "Approved");
            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => dayEvents.length > 0 && router.push(`/admin/calendar?y=${year}&m=${month}&date=${cell.date}`)}
                className={cn(
                  "relative flex flex-col items-center py-1 text-[11px] font-semibold transition-colors",
                  cell.inMonth ? "text-ink" : "text-ink/25",
                  isToday
                    ? "rounded-lg"
                    : dayEvents.length > 0
                      ? "cursor-pointer hover:bg-oat rounded-lg"
                      : "cursor-default",
                )}
              >
                <span className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] font-bold leading-none",
                  isToday ? "bg-flame text-white" : "",
                )}>
                  {new Date(cell.date + "T12:00:00").getDate()}
                </span>
                {dayEvents.length > 0 && (
                  <span className={cn(
                    "mt-0.5 size-1 rounded-full",
                    hasPending ? "bg-flame" : hasApproved ? "bg-pine" : "bg-error",
                  )} />
                )}
              </button>
            );
          }

          // Full mode: event pills
          const MAX_VISIBLE = 3;
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const overflow = dayEvents.length - MAX_VISIBLE;

          return (
            <div
              key={cell.date}
              className={cn(
                "min-h-[100px] border-b border-r border-line p-1.5",
                // remove bottom border on last row, right border on last col
                isLastRow && "border-b-0",
                (idx + 1) % 7 === 0 && "border-r-0",
                !cell.inMonth && "bg-oat/30",
              )}
            >
              {/* Date number */}
              <div className="mb-1 flex justify-end">
                <span className={cn(
                  "flex size-6 items-center justify-center rounded-full text-[12px] font-bold leading-none",
                  isToday
                    ? "bg-flame text-white"
                    : cell.inMonth
                      ? "text-ink"
                      : "text-ink/30",
                )}>
                  {new Date(cell.date + "T12:00:00").getDate()}
                </span>
              </div>

              {/* Event pills */}
              <div className="space-y-0.5">
                {visible.map((ev) => {
                  const c = eventColors(ev.status);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setSelected(ev)}
                      className={cn(
                        "w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] font-semibold leading-tight transition-opacity hover:opacity-80",
                        c.pill,
                      )}
                      title={`${ev.fullName} · ${ev.courts}`}
                    >
                      {ev.fullName}
                    </button>
                  );
                })}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected(dayEvents[MAX_VISIBLE] ?? null)}
                    className="w-full rounded px-1.5 py-0.5 text-left text-[11px] font-semibold text-warm-muted hover:bg-oat"
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Legend (full only) ──────────────────────────────────────── */}
      {!isMini && (
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
      )}

      {/* ── Event detail popover ────────────────────────────────────── */}
      {selected && (
        <EventPopover event={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ─── Event detail popover ─────────────────────────────────────────────────────

function EventPopover({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  const colors = eventColors(event.status);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-sm" aria-hidden />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl border border-line bg-white shadow-[0_20px_50px_rgba(66,48,45,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-base font-extrabold text-ink">{event.fullName}</p>
            <p className="mt-0.5 text-xs text-warm-muted">{event.date}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold",
              colors.pill,
            )}>
              {event.status}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-7 place-items-center rounded-lg border border-line text-warm-muted hover:bg-oat"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-2 px-5 py-4">
          <Row label="Courts" value={event.courts || "—"} />
          <Row label="Slots" value={event.slotLabels.join(", ") || "—"} />
          <Row
            label="Total"
            value={`₱${Number(event.total).toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
            bold
          />
        </div>

        {/* Footer action */}
        <div className="border-t border-line px-5 py-3">
          <a
            href="/admin/bookings"
            className="text-xs font-semibold text-flame hover:underline"
          >
            View in Bookings →
          </a>
        </div>
      </div>
    </div>
  );
}

function Row({
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
      <span className={cn("text-right", bold ? "font-bold text-ink" : "text-ink/80")}>
        {value}
      </span>
    </div>
  );
}
