"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PlusCircle,
  Trash2,
  Clock,
  CalendarX,
  ChevronDown,
  ChevronUp,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ClosureRow, CourtRow, HoursRow } from "@/lib/admin/config";
import { DAY_NAMES } from "@/lib/admin/config";

// ── helpers ───────────────────────────────────────────────────────────────

function readError(data: unknown, fallback: string): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof (data as { error?: { message?: string } }).error?.message === "string"
  ) {
    return (data as { error: { message: string } }).error.message;
  }
  return fallback;
}

/** Format 24h "HH:MM" → readable "6:00 AM" */
function fmt12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = mStr ?? "00";
  if (isNaN(h)) return hhmm;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

/** Display a closure's date range in a human-friendly way */
function formatClosureRange(startAt: string, endAt: string): { date: string; time: string } {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const dateOpts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  };
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  };
  const startDate = start.toLocaleDateString("en-PH", dateOpts);
  const endDate = end.toLocaleDateString("en-PH", dateOpts);
  const startTime = start.toLocaleTimeString("en-PH", timeOpts);
  const endTime = end.toLocaleTimeString("en-PH", timeOpts);

  if (startDate === endDate) {
    return { date: startDate, time: `${startTime} – ${endTime}` };
  }
  return {
    date: `${startDate} – ${endDate}`,
    time: `${startTime} → ${endTime}`,
  };
}

/** True if the closure window is entirely in the past */
function isPast(endAt: string): boolean {
  return new Date(endAt).getTime() < Date.now();
}

const selectClass =
  "h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-flame/30";

// ── Hours section ─────────────────────────────────────────────────────────

/** One day-of-week column in the grid: shows all rows for that day */
function DayCell({
  dayIndex,
  dayLabel,
  rows,
  courts,
  busy,
  onDelete,
}: {
  dayIndex: number;
  dayLabel: string;
  rows: HoursRow[];
  courts: CourtRow[];
  busy: string | null;
  onDelete: (id: string) => void;
}) {
  const isToday = new Date().getDay() === dayIndex;
  void courts; // available for future display

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3",
        isToday ? "border-flame/40 bg-flame-light/30" : "border-line bg-white",
      )}
    >
      {/* Day label */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-xs font-bold uppercase tracking-wider",
            isToday ? "text-flame" : "text-ink/50",
          )}
        >
          {dayLabel.slice(0, 3)}
        </span>
        {isToday && (
          <span className="rounded-full bg-flame/10 px-1.5 py-0.5 text-[10px] font-bold text-flame">
            Today
          </span>
        )}
      </div>

      {/* Hour rows */}
      {rows.length === 0 ? (
        <p className="text-[11px] text-warm-muted/70 italic">Open all day</p>
      ) : (
        rows.map((h) => (
          <div
            key={h.id}
            className="group flex items-start justify-between gap-1 rounded-lg bg-oat/60 px-2 py-1.5"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-ink leading-tight truncate">
                {h.courtName === "All courts (global)" ? "All courts" : h.courtName}
              </p>
              <p className="text-[11px] text-warm-muted tabular-nums">
                {fmt12(h.openTime)} – {fmt12(h.closeTime)}
              </p>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => onDelete(h.id)}
              title="Remove this hours row"
              className="mt-0.5 shrink-0 rounded p-0.5 text-warm-muted/40 opacity-0 transition-all group-hover:opacity-100 hover:bg-error/10 hover:text-error focus:opacity-100"
            >
              {busy === h.id ? (
                <span className="text-[10px]">…</span>
              ) : (
                <Trash2 className="size-3" />
              )}
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function HoursSection({
  initialHours,
  courts,
}: {
  initialHours: HoursRow[];
  courts: CourtRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Add form state
  const [hCourt, setHCourt] = useState("");
  const [hDay, setHDay] = useState("1");
  const [hOpen, setHOpen] = useState("06:00");
  const [hClose, setHClose] = useState("03:00");

  // Group hours by day of week
  const byDay = DAY_NAMES.reduce<Record<number, HoursRow[]>>((acc, _, i) => {
    acc[i] = initialHours.filter((h) => h.dayOfWeek === i);
    return acc;
  }, {});

  async function addRow(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    try {
      const res = await fetch("/api/admin/hours", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          courtId: hCourt === "" ? null : hCourt,
          dayOfWeek: Number(hDay),
          openTime: hOpen,
          closeTime: hClose,
        }),
      });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) { toast.error(readError(data, "Request failed.")); return; }
      toast.success("Hours row added.");
      setShowForm(false);
      router.refresh();
    } catch { toast.error("Request failed."); }
    finally { setBusy(null); }
  }

  async function deleteRow(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/hours/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) { toast.error(readError(data, "Request failed.")); return; }
      toast.success("Hours row deleted.");
      router.refresh();
    } catch { toast.error("Request failed."); }
    finally { setBusy(null); }
  }

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-flame" />
          <h2 className="text-sm font-bold text-ink">Operating Hours</h2>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          className="h-8 rounded-lg bg-flame px-3 text-xs font-bold text-white hover:bg-flame-hover"
        >
          <PlusCircle className="mr-1.5 size-3.5" />
          Add row
        </Button>
      </div>

      {/* Info callout */}
      <div className="flex items-start gap-2 rounded-lg border border-columbia/60 bg-columbia/20 px-3 py-2.5 text-xs text-pine">
        <Globe className="mt-0.5 size-3.5 shrink-0" />
        <p>
          A court with <strong>no rows on a day</strong> is treated as open all day.
          Court-specific rows take priority over "All courts" global rows.
        </p>
      </div>

      {/* Add form (collapsed by default) */}
      {showForm && (
        <div className="rounded-xl border border-flame/20 bg-flame-light/20 p-4">
          <p className="mb-3 text-xs font-bold text-ink">New hours row</p>
          <form onSubmit={(e) => void addRow(e)}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="h-court" className="text-xs font-semibold text-ink/70">Court</Label>
                <select id="h-court" value={hCourt} onChange={(e) => setHCourt(e.target.value)} className={selectClass}>
                  <option value="">All courts (global)</option>
                  {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="h-day" className="text-xs font-semibold text-ink/70">Day</Label>
                <select id="h-day" value={hDay} onChange={(e) => setHDay(e.target.value)} className={selectClass}>
                  {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="h-open" className="text-xs font-semibold text-ink/70">Open (24h)</Label>
                <Input id="h-open" value={hOpen} onChange={(e) => setHOpen(e.target.value)} placeholder="06:00" className="h-9 rounded-lg border-line text-sm" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="h-close" className="text-xs font-semibold text-ink/70">Close (24h)</Label>
                <Input id="h-close" value={hClose} onChange={(e) => setHClose(e.target.value)} placeholder="03:00" className="h-9 rounded-lg border-line text-sm" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button type="submit" disabled={busy !== null} className="h-8 rounded-lg bg-flame px-4 text-xs font-bold text-white hover:bg-flame-hover">
                {busy === "add" ? "Adding…" : "Add"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="h-8 rounded-lg border-line text-xs text-warm-muted hover:text-ink">
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* 7-day grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {DAY_NAMES.map((day, i) => (
          <DayCell
            key={day}
            dayIndex={i}
            dayLabel={day}
            rows={byDay[i] ?? []}
            courts={courts}
            busy={busy}
            onDelete={deleteRow}
          />
        ))}
      </div>
    </section>
  );
}

// ── Closures section ──────────────────────────────────────────────────────

function ClosureCard({
  closure,
  busy,
  onDelete,
}: {
  closure: ClosureRow;
  busy: string | null;
  onDelete: (id: string) => void;
}) {
  const past = isPast(closure.endAt);
  const { date, time } = formatClosureRange(closure.startAt, closure.endAt);
  const isGlobal = closure.scope === "global";

  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border p-4 transition-opacity",
        past ? "opacity-50" : "",
        isGlobal
          ? "border-l-4 border-l-cocoa border-line bg-white"
          : "border-l-4 border-l-flame border-line bg-white",
      )}
    >
      {/* Left: icon */}
      <div className={cn(
        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm",
        isGlobal ? "bg-cocoa/10" : "bg-flame-light",
      )}>
        <CalendarX className={cn("size-4", isGlobal ? "text-cocoa" : "text-flame")} />
      </div>

      {/* Center: info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-ink">
            {isGlobal ? "All courts" : closure.courtName}
          </p>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            isGlobal ? "bg-cocoa/10 text-cocoa" : "bg-flame-light text-flame",
          )}>
            {isGlobal ? "Global" : "Court"}
          </span>
          {past && (
            <span className="rounded-full bg-oat px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warm-muted">
              Past
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs font-semibold text-ink/80">{date}</p>
        <p className="text-xs text-warm-muted">{time}</p>
        {closure.reason && (
          <p className="mt-1 text-xs text-warm-muted italic">"{closure.reason}"</p>
        )}
        {closure.by && (
          <p className="mt-0.5 text-[11px] text-warm-muted/60">by {closure.by}</p>
        )}
      </div>

      {/* Right: delete */}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => onDelete(closure.id)}
        title="Remove closure"
        className="self-start rounded-lg p-1.5 text-warm-muted/50 transition-colors hover:bg-error/10 hover:text-error focus:bg-error/10 focus:text-error"
      >
        {busy === closure.id ? (
          <span className="text-xs">…</span>
        ) : (
          <Trash2 className="size-4" />
        )}
      </button>
    </div>
  );
}

function ClosuresSection({
  initialClosures,
  courts,
}: {
  initialClosures: ClosureRow[];
  courts: CourtRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPast, setShowPast] = useState(false);

  // Closure form state
  const [cScope, setCScope] = useState<"global" | "court">("global");
  const [cCourt, setCCourt] = useState("");
  const [cStart, setCStart] = useState("");
  const [cEnd, setCEnd] = useState("");
  const [cReason, setCReason] = useState("");

  const upcoming = initialClosures.filter((c) => !isPast(c.endAt));
  const past = initialClosures.filter((c) => isPast(c.endAt));

  async function addClosure(e: React.FormEvent) {
    e.preventDefault();
    if (!cStart || !cEnd) { toast.error("Pick a start and end datetime."); return; }
    setBusy("add");
    try {
      const res = await fetch("/api/admin/closures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: cScope,
          courtId: cScope === "global" ? null : cCourt || null,
          startAt: new Date(cStart).toISOString(),
          endAt: new Date(cEnd).toISOString(),
          reason: cReason.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) { toast.error(readError(data, "Request failed.")); return; }
      toast.success("Closure added.");
      setCStart(""); setCEnd(""); setCReason(""); setShowForm(false);
      router.refresh();
    } catch { toast.error("Request failed."); }
    finally { setBusy(null); }
  }

  async function deleteClosure(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/closures/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) { toast.error(readError(data, "Request failed.")); return; }
      toast.success("Closure lifted.");
      router.refresh();
    } catch { toast.error("Request failed."); }
    finally { setBusy(null); }
  }

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarX className="size-4 text-flame" />
          <h2 className="text-sm font-bold text-ink">Closures</h2>
          {upcoming.length > 0 && (
            <span className="rounded-full bg-flame/10 px-2 py-0.5 text-[11px] font-bold text-flame">
              {upcoming.length} upcoming
            </span>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setShowForm((v) => !v)}
          className="h-8 rounded-lg bg-flame px-3 text-xs font-bold text-white hover:bg-flame-hover"
        >
          <PlusCircle className="mr-1.5 size-3.5" />
          Add closure
        </Button>
      </div>

      {/* Info callout */}
      <div className="flex items-start gap-2 rounded-lg border border-surface-dim/60 bg-surface-dim/20 px-3 py-2.5 text-xs text-cocoa">
        <CalendarX className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Closures <strong>always override hours</strong>. A global closure blocks all courts;
          a court closure blocks only that court.
        </p>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl border border-flame/20 bg-flame-light/20 p-4">
          <p className="mb-3 text-xs font-bold text-ink">New closure</p>
          <form onSubmit={(e) => void addClosure(e)}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="c-scope" className="text-xs font-semibold text-ink/70">Scope</Label>
                <select id="c-scope" value={cScope} onChange={(e) => setCScope(e.target.value as "global" | "court")} className={selectClass}>
                  <option value="global">All courts</option>
                  <option value="court">One court</option>
                </select>
              </div>
              {cScope === "court" && (
                <div className="space-y-1">
                  <Label htmlFor="c-court" className="text-xs font-semibold text-ink/70">Court</Label>
                  <select id="c-court" value={cCourt} onChange={(e) => setCCourt(e.target.value)} className={selectClass}>
                    <option value="">— pick one —</option>
                    {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="c-start" className="text-xs font-semibold text-ink/70">Start</Label>
                <Input id="c-start" type="datetime-local" value={cStart} onChange={(e) => setCStart(e.target.value)} className="h-9 rounded-lg border-line text-sm" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-end" className="text-xs font-semibold text-ink/70">End</Label>
                <Input id="c-end" type="datetime-local" value={cEnd} onChange={(e) => setCEnd(e.target.value)} className="h-9 rounded-lg border-line text-sm" />
              </div>
              <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="c-reason" className="text-xs font-semibold text-ink/70">Reason (optional)</Label>
                <Input id="c-reason" value={cReason} onChange={(e) => setCReason(e.target.value)} maxLength={500} placeholder="e.g. Maintenance" className="h-9 rounded-lg border-line text-sm" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button type="submit" disabled={busy !== null} className="h-8 rounded-lg bg-flame px-4 text-xs font-bold text-white hover:bg-flame-hover">
                {busy === "add" ? "Adding…" : "Add closure"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="h-8 rounded-lg border-line text-xs text-warm-muted hover:text-ink">
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Upcoming closures */}
      {upcoming.length === 0 && past.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-line text-sm text-warm-muted">
          No closures scheduled — courts follow regular hours.
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-xs text-warm-muted">No upcoming closures.</p>
          ) : (
            upcoming.map((c) => (
              <ClosureCard key={c.id} closure={c} busy={busy} onDelete={deleteClosure} />
            ))
          )}

          {/* Past closures toggle */}
          {past.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowPast((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-warm-muted hover:text-ink transition-colors"
              >
                {showPast ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                {showPast ? "Hide" : "Show"} {past.length} past closure{past.length !== 1 ? "s" : ""}
              </button>
              {showPast && (
                <div className="mt-2 space-y-2">
                  {past.map((c) => (
                    <ClosureCard key={c.id} closure={c} busy={busy} onDelete={deleteClosure} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── root export ───────────────────────────────────────────────────────────

export default function HoursManager({
  initialHours,
  initialClosures,
  courts,
}: {
  initialHours: HoursRow[];
  initialClosures: ClosureRow[];
  courts: CourtRow[];
}) {
  return (
    <div className="space-y-10">
      <HoursSection initialHours={initialHours} courts={courts} />
      <div className="border-t border-line" />
      <ClosuresSection initialClosures={initialClosures} courts={courts} />
    </div>
  );
}
