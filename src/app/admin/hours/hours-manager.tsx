"use client";

import { useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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
        "flex flex-col gap-2 rounded-lg border p-3",
        isToday && "border-ring/50 bg-accent/40",
      )}
    >
      {/* Day label */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {dayLabel.slice(0, 3)}
        </span>
        {isToday && (
          <Badge variant="secondary" className="text-[10px]">
            Today
          </Badge>
        )}
      </div>

      {/* Hour rows */}
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">Open all day</p>
      ) : (
        rows.map((h) => (
          <div
            key={h.id}
            className="group flex items-start justify-between gap-1 rounded-md bg-muted px-2 py-1.5"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-medium leading-tight truncate">
                {h.courtName === "All courts (global)" ? "All courts" : h.courtName}
              </p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {fmt12(h.openTime)} – {fmt12(h.closeTime)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={busy !== null}
              onClick={() => onDelete(h.id)}
              title="Remove this hours row"
              className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              {busy === h.id ? <span className="text-[10px]">…</span> : <Trash2 />}
            </Button>
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
  const byDay = useMemo(
    () =>
      DAY_NAMES.reduce<Record<number, HoursRow[]>>((acc, _, i) => {
        acc[i] = initialHours.filter((h) => h.dayOfWeek === i);
        return acc;
      }, {}),
    [initialHours],
  );

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
          <Clock className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Operating Hours</h2>
        </div>
        <Button type="button" size="sm" onClick={() => setShowForm((v) => !v)}>
          <PlusCircle />
          Add row
        </Button>
      </div>

      {/* Info callout */}
      <div className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
        <Globe className="mt-0.5 size-3.5 shrink-0" />
        <p>
          A court with <strong>no rows on a day</strong> is treated as open all day.
          Court-specific rows take priority over "All courts" global rows.
        </p>
      </div>

      {/* Add form (collapsed by default) */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New hours row</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void addRow(e)}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="h-court">Court</Label>
                  <select id="h-court" value={hCourt} onChange={(e) => setHCourt(e.target.value)} className={selectClass}>
                    <option value="">All courts (global)</option>
                    {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="h-day">Day</Label>
                  <select id="h-day" value={hDay} onChange={(e) => setHDay(e.target.value)} className={selectClass}>
                    {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="h-open">Open (24h)</Label>
                  <Input id="h-open" value={hOpen} onChange={(e) => setHOpen(e.target.value)} placeholder="06:00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="h-close">Close (24h)</Label>
                  <Input id="h-close" value={hClose} onChange={(e) => setHClose(e.target.value)} placeholder="03:00" />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button type="submit" disabled={busy !== null}>
                  {busy === "add" ? "Adding…" : "Add"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
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
        "flex gap-3 rounded-lg border bg-card p-4 text-card-foreground transition-opacity",
        past && "opacity-50",
      )}
    >
      {/* Left: icon */}
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <CalendarX className="size-4" />
      </div>

      {/* Center: info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">
            {isGlobal ? "All courts" : closure.courtName}
          </p>
          <Badge variant="secondary">{isGlobal ? "Global" : "Court"}</Badge>
          {past && <Badge variant="outline">Past</Badge>}
        </div>
        <p className="mt-0.5 text-xs font-medium">{date}</p>
        <p className="text-xs text-muted-foreground">{time}</p>
        {closure.reason && (
          <p className="mt-1 text-xs text-muted-foreground italic">"{closure.reason}"</p>
        )}
        {closure.by && (
          <p className="mt-0.5 text-[11px] text-muted-foreground/70">by {closure.by}</p>
        )}
      </div>

      {/* Right: delete */}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={busy !== null}
        onClick={() => onDelete(closure.id)}
        title="Remove closure"
        className="self-start text-muted-foreground hover:text-destructive"
      >
        {busy === closure.id ? <span className="text-xs">…</span> : <Trash2 />}
      </Button>
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
          <CalendarX className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Closures</h2>
          {upcoming.length > 0 && (
            <Badge variant="secondary">{upcoming.length} upcoming</Badge>
          )}
        </div>
        <Button type="button" size="sm" onClick={() => setShowForm((v) => !v)}>
          <PlusCircle />
          Add closure
        </Button>
      </div>

      {/* Info callout */}
      <div className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
        <CalendarX className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Closures <strong>always override hours</strong>. A global closure blocks all courts;
          a court closure blocks only that court.
        </p>
      </div>

      {/* Add form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New closure</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void addClosure(e)}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="c-scope">Scope</Label>
                  <select id="c-scope" value={cScope} onChange={(e) => setCScope(e.target.value as "global" | "court")} className={selectClass}>
                    <option value="global">All courts</option>
                    <option value="court">One court</option>
                  </select>
                </div>
                {cScope === "court" && (
                  <div className="space-y-2">
                    <Label htmlFor="c-court">Court</Label>
                    <select id="c-court" value={cCourt} onChange={(e) => setCCourt(e.target.value)} className={selectClass}>
                      <option value="">— pick one —</option>
                      {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="c-start">Start</Label>
                  <Input id="c-start" type="datetime-local" value={cStart} onChange={(e) => setCStart(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="c-end">End</Label>
                  <Input id="c-end" type="datetime-local" value={cEnd} onChange={(e) => setCEnd(e.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="c-reason">Reason (optional)</Label>
                  <Input id="c-reason" value={cReason} onChange={(e) => setCReason(e.target.value)} maxLength={500} placeholder="e.g. Maintenance" />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button type="submit" disabled={busy !== null}>
                  {busy === "add" ? "Adding…" : "Add closure"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Upcoming closures */}
      {upcoming.length === 0 && past.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          No closures scheduled — courts follow regular hours.
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground">No upcoming closures.</p>
          ) : (
            upcoming.map((c) => (
              <ClosureCard key={c.id} closure={c} busy={busy} onDelete={deleteClosure} />
            ))
          )}

          {/* Past closures toggle */}
          {past.length > 0 && (
            <div className="pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPast((v) => !v)}
                className="text-muted-foreground"
              >
                {showPast ? <ChevronUp /> : <ChevronDown />}
                {showPast ? "Hide" : "Show"} {past.length} past closure{past.length !== 1 ? "s" : ""}
              </Button>
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
      <div className="border-t" />
      <ClosuresSection initialClosures={initialClosures} courts={courts} />
    </div>
  );
}
