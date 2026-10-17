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
import { Calendar } from "@/components/ui/calendar";
import LandingImage from "@/components/landing/landing-image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ClosureRow, CourtRow, HoursRow } from "@/lib/admin/config";
import { DAY_NAMES } from "@/lib/admin/config";
import {
  fmtDay,
  groupRuns,
  manilaDay,
  relativeDay,
  toDateStr,
  wholeDayRange,
} from "@/lib/admin/hours-format";

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

const tileClass =
  "flex flex-col items-center gap-1.5 rounded-lg border p-1.5 text-center transition-colors hover:bg-accent/60";

/** Pick a court by its photo; value "" means all courts. */
function CourtPicker({
  courts,
  value,
  onChange,
}: {
  courts: CourtRow[];
  value: string;
  onChange: (courtId: string) => void;
}) {
  const tile = (selected: boolean) =>
    cn(tileClass, selected && "border-ring bg-accent");
  return (
    <div role="radiogroup" aria-label="Court" className="grid grid-cols-3 gap-2">
      <button
        type="button"
        role="radio"
        aria-checked={value === ""}
        onClick={() => onChange("")}
        className={tile(value === "")}
      >
        <span className="flex aspect-[4/3] w-full items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Globe className="size-5" />
        </span>
        <span className="w-full truncate text-[11px] font-medium">All courts</span>
      </button>
      {courts.map((c, i) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          onClick={() => onChange(c.id)}
          className={tile(value === c.id)}
        >
          {/* Same photo-per-index convention as the booking page. */}
          <LandingImage
            src={`/images/court-${(i % 2) + 1}.jpg`}
            alt=""
            className="aspect-[4/3] w-full rounded-md"
          />
          <span className="w-full truncate text-[11px] font-medium">{c.name}</span>
        </button>
      ))}
    </div>
  );
}

// ── Hours section ─────────────────────────────────────────────────────────

/** One day-of-week column: shows all rows for that day, plus an inline add form */
function DayCell({
  dayIndex,
  dayLabel,
  rows,
  courts,
  busy,
  onAdd,
  onDelete,
}: {
  dayIndex: number;
  dayLabel: string;
  rows: HoursRow[];
  courts: CourtRow[];
  busy: string | null;
  onAdd: (
    dayOfWeek: number,
    courtId: string,
    openTime: string,
    closeTime: string,
  ) => Promise<boolean>;
  onDelete: (id: string) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [court, setCourt] = useState("");
  const [open, setOpen] = useState("06:00");
  const [close, setClose] = useState("03:00");
  const [saving, setSaving] = useState(false);
  const isToday = new Date().getDay() === dayIndex;

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.openTime.localeCompare(b.openTime)),
    [rows],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (open === close) {
      toast.error("Open and close times must differ.");
      return;
    }
    setSaving(true);
    const ok = await onAdd(dayIndex, court, open, close);
    setSaving(false);
    if (ok) {
      setFormOpen(false);
      setCourt("");
    }
  }

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
      {sorted.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">Open all day</p>
      ) : (
        sorted.map((h) => (
          <div
            key={h.id}
            className="flex items-start justify-between gap-1 rounded-md bg-muted px-2 py-1.5"
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
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              {busy === h.id ? <span className="text-[10px]">…</span> : <Trash2 />}
            </Button>
          </div>
        ))
      )}

      {/* Add hours — modal, day comes from this cell */}
      <Dialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setCourt("");
        }}
      >
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="justify-start text-muted-foreground"
            >
              <PlusCircle />
              Add hours
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add hours — {dayLabel}</DialogTitle>
            <DialogDescription>
              Applies to {dayLabel} only. Leave the court as "All courts" to set a
              default for every court.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <div className="space-y-2">
              <Label>Court</Label>
              <CourtPicker courts={courts} value={court} onChange={setCourt} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor={`h-open-${dayIndex}`}>Opens</Label>
                <Input
                  id={`h-open-${dayIndex}`}
                  type="time"
                  required
                  value={open}
                  onChange={(e) => setOpen(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`h-close-${dayIndex}`}>Closes</Label>
                <Input
                  id={`h-close-${dayIndex}`}
                  type="time"
                  required
                  value={close}
                  onChange={(e) => setClose(e.target.value)}
                />
              </div>
            </div>
            <p className="rounded-lg border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Closing earlier than opening means it runs past midnight.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Adding…" : "Add hours"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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

  // Group hours by day of week
  const byDay = useMemo(
    () =>
      DAY_NAMES.reduce<Record<number, HoursRow[]>>((acc, _, i) => {
        acc[i] = initialHours.filter((h) => h.dayOfWeek === i);
        return acc;
      }, {}),
    [initialHours],
  );

  async function addRow(
    dayOfWeek: number,
    courtId: string,
    openTime: string,
    closeTime: string,
  ): Promise<boolean> {
    setBusy("add");
    try {
      const res = await fetch("/api/admin/hours", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          courtId: courtId === "" ? null : courtId,
          dayOfWeek,
          openTime,
          closeTime,
        }),
      });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        toast.error(readError(data, "Request failed."));
        return false;
      }
      toast.success("Hours added.");
      router.refresh();
      return true;
    } catch {
      toast.error("Request failed.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function deleteRow(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/hours/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        toast.error(readError(data, "Request failed."));
        return;
      }
      toast.success("Hours row deleted.");
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Operating Hours</h2>
      </div>

      {/* Info callout */}
      <div className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
        <Globe className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Add hours inside a day to limit it. A court with <strong>no rows on a day</strong> is
          treated as open all day; court-specific rows take priority over "All courts" rows.
        </p>
      </div>

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
            onAdd={addRow}
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
  grouped = false,
  onDelete,
}: {
  closure: ClosureRow;
  busy: string | null;
  grouped?: boolean;
  onDelete: (id: string) => void;
}) {
  const past = isPast(closure.endAt);
  const { date, time } = formatClosureRange(closure.startAt, closure.endAt);
  const isGlobal = closure.scope === "global";
  const sameDay = manilaDay(closure.startAt) === manilaDay(closure.endAt);

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
        {(!grouped || !sameDay) && (
          <p className="mt-0.5 text-xs font-medium">{date}</p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{time}</p>
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
  const [open, setOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);

  // Closure form state
  const [cMode, setCMode] = useState<"days" | "hours">("days");
  const [cDays, setCDays] = useState<Date[]>([]);
  const [cCourt, setCCourt] = useState("");
  const [cStart, setCStart] = useState("");
  const [cEnd, setCEnd] = useState("");
  const [cReason, setCReason] = useState("");

  const upcoming = initialClosures.filter((c) => !isPast(c.endAt));
  const past = initialClosures.filter((c) => isPast(c.endAt));

  // Rows arrive ordered by start_at, so consecutive same-day closures group.
  const groups: { day: string; items: ClosureRow[] }[] = [];
  for (const c of upcoming) {
    const day = manilaDay(c.startAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(c);
    else groups.push({ day, items: [c] });
  }

  const who = cCourt
    ? (courts.find((c) => c.id === cCourt)?.name ?? "A court")
    : "All courts";

  const preview = (() => {
    if (cMode === "days") {
      if (cDays.length === 0) return "Pick one or more dates to see the summary.";
      const runs = groupRuns(cDays.map(toDateStr));
      const label = runs
        .map((r) => (r.from === r.to ? fmtDay(r.from) : `${fmtDay(r.from)} – ${fmtDay(r.to)}`))
        .join(", ");
      const single = runs.length === 1 && runs[0].from === runs[0].to;
      return `${who} closed ${single ? "all day on" : "for whole days on"} ${label}.`;
    }
    if (!cStart || !cEnd) return "Pick a start and end time to see the summary.";
    if (new Date(`${cEnd}:00+08:00`) <= new Date(`${cStart}:00+08:00`)) {
      return "The end time must be after the start time.";
    }
    return `${who} closed ${fmtDay(cStart.slice(0, 10))}, ${fmt12(
      cStart.slice(11, 16),
    )} → ${fmt12(cEnd.slice(11, 16))}.`;
  })();

  function reset() {
    setCMode("days");
    setCDays([]);
    setCCourt("");
    setCStart("");
    setCEnd("");
    setCReason("");
  }

  async function addClosure(e: React.FormEvent) {
    e.preventDefault();
    let payloads: { startAt: string; endAt: string }[];
    if (cMode === "days") {
      if (cDays.length === 0) {
        toast.error("Pick at least one date.");
        return;
      }
      // Separate runs become separate closures — the API takes one window.
      payloads = groupRuns(cDays.map(toDateStr)).map((r) => wholeDayRange(r.from, r.to));
    } else {
      if (!cStart || !cEnd) {
        toast.error("Pick a start and end time.");
        return;
      }
      const startAt = new Date(`${cStart}:00+08:00`).toISOString();
      const endAt = new Date(`${cEnd}:00+08:00`).toISOString();
      if (new Date(endAt) <= new Date(startAt)) {
        toast.error("The end time must be after the start time.");
        return;
      }
      payloads = [{ startAt, endAt }];
    }

    setBusy("add");
    try {
      let added = 0;
      for (const p of payloads) {
        const res = await fetch("/api/admin/closures", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            scope: cCourt ? "court" : "global",
            courtId: cCourt || null,
            startAt: p.startAt,
            endAt: p.endAt,
            reason: cReason.trim() || null,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as unknown;
          toast.error(readError(data, "Request failed."));
          if (added > 0) router.refresh();
          return;
        }
        added++;
      }
      toast.success(added === 1 ? "Closure added." : `${added} closures added.`);
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteClosure(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/closures/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        toast.error(readError(data, "Request failed."));
        return;
      }
      toast.success("Closure lifted.");
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
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

        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) reset();
          }}
        >
          <DialogTrigger
            render={
              <Button type="button" size="sm">
                <PlusCircle />
                Add closure
              </Button>
            }
          />
          <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New closure</DialogTitle>
              <DialogDescription>
                Closures override operating hours. "All courts" blocks every court; a
                single court blocks only that court.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={(e) => void addClosure(e)} className="space-y-4">
              {/* Closure type */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={cMode === "days" ? "default" : "outline"}
                  onClick={() => setCMode("days")}
                >
                  Whole day(s)
                </Button>
                <Button
                  type="button"
                  variant={cMode === "hours" ? "default" : "outline"}
                  onClick={() => setCMode("hours")}
                >
                  Specific hours
                </Button>
              </div>

              {/* Courts */}
              <div className="space-y-2">
                <Label>Courts</Label>
                <CourtPicker courts={courts} value={cCourt} onChange={setCCourt} />
              </div>

              {/* When */}
              {cMode === "days" ? (
                <div className="space-y-2">
                  <Label>Closed days</Label>
                  <Calendar
                    mode="multiple"
                    selected={cDays}
                    onSelect={(days) => setCDays(days ?? [])}
                    className="mx-auto rounded-lg border"
                  />
                  <p className="text-xs text-muted-foreground">
                    Pick any number of days. Separate groups of days become separate
                    closures.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="c-start">From</Label>
                    <Input
                      id="c-start"
                      type="datetime-local"
                      value={cStart}
                      onChange={(e) => setCStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-end">To</Label>
                    <Input
                      id="c-end"
                      type="datetime-local"
                      value={cEnd}
                      onChange={(e) => setCEnd(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Reason */}
              <div className="space-y-2">
                <Label htmlFor="c-reason">Reason (optional)</Label>
                <Input
                  id="c-reason"
                  value={cReason}
                  onChange={(e) => setCReason(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. Maintenance"
                />
              </div>

              {/* Live preview */}
              <p className="rounded-lg border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {preview}
              </p>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy !== null}>
                  {busy === "add" ? "Adding…" : "Add closure"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Info callout */}
      <div className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
        <CalendarX className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Closures <strong>always override hours</strong>. A global closure blocks all courts;
          a court closure blocks only that court.
        </p>
      </div>

      {/* Closure list */}
      {upcoming.length === 0 && past.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          No closures scheduled — courts follow regular hours.
        </div>
      ) : (
        <div className="space-y-4">
          {upcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground">No upcoming closures.</p>
          ) : (
            groups.map((g) => (
              <div key={g.day} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold">{fmtDay(g.day)}</h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {relativeDay(g.day)}
                  </Badge>
                  {g.items.length > 1 && (
                    <span className="text-[11px] text-muted-foreground">
                      {g.items.length} closures
                    </span>
                  )}
                </div>
                {g.items.map((c) => (
                  <ClosureCard
                    key={c.id}
                    closure={c}
                    busy={busy}
                    grouped
                    onDelete={deleteClosure}
                  />
                ))}
              </div>
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
                {showPast ? "Hide" : "Show"} {past.length} past closure
                {past.length !== 1 ? "s" : ""}
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
