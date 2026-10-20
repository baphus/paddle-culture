"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  PlusCircle,
  Trash2,
  CalendarX,
  ChevronDown,
  ChevronUp,
  Globe,
  Save,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import LandingImage from "@/components/landing/landing-image";
import { CourtStatusBadge } from "@/components/admin/status-badge";
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
import {
  DAY_NAMES,
  type ClosureRow,
  type CourtRow,
  type PricingRuleRow,
} from "@/lib/admin/config";
import {
  fmtDay,
  groupRuns,
  manilaDay,
  relativeDay,
  toDateStr,
  wholeDayRange,
} from "@/lib/admin/hours-format";

// ── helpers ───────────────────────────────────────────────────────────────

/** One court, one day, one range, one optional rate (ADR-13). */
type HourRow = {
  id: string;
  courtId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  amount: string | null;
};

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

/** Weekday order for display (0 = Sunday). */
const MON_SUN = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayShort = (day: number) => DAY_SHORT[day] ?? "";

/** Pick a court by its photo; value "" means all courts (closures only). */
function CourtPicker({
  courts,
  value,
  onChange,
  allowAll = true,
}: {
  courts: CourtRow[];
  value: string;
  onChange: (courtId: string) => void;
  allowAll?: boolean;
}) {
  const tile = (selected: boolean) =>
    cn(tileClass, selected && "border-ring bg-accent");
  return (
    <div role="radiogroup" aria-label="Court" className="grid grid-cols-3 gap-2">
      {allowAll ? (
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
      ) : null}
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

// ── hours mutations (used by the per-court modal) ─────────────────────────

function useHoursActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function addRow(
    dayOfWeek: number,
    courtId: string,
    openTime: string,
    closeTime: string,
    amount: string,
    opts?: { successMessage?: string },
  ): Promise<boolean> {
    setBusy("add");
    try {
      const res = await fetch("/api/admin/hours", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courtId, dayOfWeek, openTime, closeTime, amount }),
      });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        // 409s name the row this one overlaps; show the message verbatim.
        toast.error(readError(data, "Request failed."));
        return false;
      }
      toast.success(opts?.successMessage ?? "Hours added.");
      router.refresh();
      return true;
    } catch {
      toast.error("Request failed.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function updateAmount(id: string, amount: string): Promise<boolean> {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/hours/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        toast.error(readError(data, "Request failed."));
        return false;
      }
      toast.success("Rate updated.");
      router.refresh();
      return true;
    } catch {
      toast.error("Request failed.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function deleteRow(id: string): Promise<void> {
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

  return { busy, addRow, updateAmount, deleteRow };
}

// ── pricing vocabulary / ordering ─────────────────────────────────────────

function labelFor(field: string) {
  const map: Record<string, string> = {
    weekday: "Weekday",
    weekend: "Weekend",
    holiday: "Holiday",
    all: "All days",
    morning: "Morning",
    evening: "Evening",
    paddle: "Paddle",
    ball: "Ball",
    slot: "per hour",
    hour: "per hour",
    flat: "one-time",
  };
  return map[field] ?? field.replace(/_/g, " ");
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

/** 24h hour → "6:00 AM". Display only; the payload stays 24h. */
function fmtHour(hour: number) {
  const h = hour % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
}

const selectClass =
  "h-8 w-full rounded-md border bg-background px-1.5 text-xs tabular-nums disabled:opacity-40";

/** Hour-granularity picker; "" means blank. */
function HourSelect({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={selectClass}
    >
      <option value="">—</option>
      {HOUR_OPTIONS.map((h) => (
        <option key={h} value={`${h}:00`}>
          {fmtHour(Number(h))}
        </option>
      ))}
    </select>
  );
}

// ── fields ────────────────────────────────────────────────────────────────

function AmountField({
  label,
  labelWidth = "w-16",
  amount,
  draft,
  busy,
  placeholder,
  onChange,
  onSave,
}: {
  label: string;
  labelWidth?: string;
  amount: string;
  draft: string | undefined;
  busy: boolean;
  placeholder?: string;
  onChange: (val: string) => void;
  onSave: () => void;
}) {
  const current = draft ?? amount;
  const isDirty = current.trim() !== amount;

  return (
    <div className="flex items-center gap-1.5">
      {label ? (
        <span className={cn(labelWidth, "shrink-0 text-xs text-muted-foreground")}>{label}</span>
      ) : null}
      <span className="text-sm font-medium text-muted-foreground">₱</span>
      <Input
        aria-label={label ? `${label} rate` : "Rate"}
        value={current}
        inputMode="decimal"
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-8 w-20 text-right font-semibold tabular-nums",
          isDirty && "border-ring ring-1 ring-ring/30",
        )}
      />
      <Button
        size="icon"
        variant="ghost"
        className={cn("size-7", !isDirty && "invisible")}
        disabled={busy}
        onClick={onSave}
        aria-label="Save rate"
      >
        {busy ? "…" : <Save className="size-3.5" />}
      </Button>
    </div>
  );
}

// ── one hours row in the merged court editor ──────────────────────────────

/** "{6:00 AM – 10:00 PM} · ₱150" with an inline amount editor and delete. */
function EditableHourRow({
  row,
  busy,
  onDelete,
  onSaveAmount,
}: {
  row: HourRow;
  busy: string | null;
  onDelete: (id: string) => void;
  onSaveAmount: (id: string, amount: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const amount = row.amount ?? "";

  return (
    <div className="space-y-1 rounded-md bg-muted px-2 py-1.5">
      <div className="flex items-center justify-between gap-1">
        <p className="min-w-0 truncate text-[11px] tabular-nums">
          {fmt12(row.openTime)} – {fmt12(row.closeTime)}
          {" · "}
          {row.amount === null ? (
            <span className="text-muted-foreground italic">no rate yet</span>
          ) : (
            <span className="font-semibold">₱{row.amount}</span>
          )}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={busy !== null}
          onClick={() => onDelete(row.id)}
          title="Remove this hours row"
          aria-label="Remove this hours row"
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          {busy === row.id ? <span className="text-[10px]">…</span> : <Trash2 />}
        </Button>
      </div>
      <AmountField
        label=""
        amount={amount}
        draft={draft}
        busy={busy === row.id}
        placeholder="Set a rate"
        onChange={setDraft}
        onSave={() => {
          const value = (draft ?? amount).trim();
          if (!value) {
            toast.error("Set a rate — hours without a price can't be booked.");
            return;
          }
          void onSaveAmount(row.id, value);
        }}
      />
    </div>
  );
}

// ── add hours & rate modal (nested over the court editor) ─────────────────

function AddHoursModal({
  dayIndex,
  dayLabel,
  busy,
  onAdd,
  onClose,
}: {
  dayIndex: number;
  dayLabel: string;
  busy: string | null;
  onAdd: (
    dayOfWeek: number,
    openTime: string,
    closeTime: string,
    amount: string,
  ) => Promise<boolean>;
  onClose: () => void;
}) {
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const hasTimes = from !== "" && until !== "";
  const sameTime = hasTimes && from === until;
  const overnight = hasTimes && until < from;
  const hasRate = amount.trim() !== "";
  const canSave = hasTimes && hasRate && !sameTime;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    const ok = await onAdd(dayIndex, from, until, amount.trim());
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-hours-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onKeyDown={(e) => {
        // Keep Escape/keys from reaching the edit modal underneath.
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <h2 id="add-hours-modal-title" className="min-w-0 truncate text-sm font-medium">
            Add hours &amp; rate — {dayLabel}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="space-y-4 p-5">
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <HourSelect label={`${dayLabel} from`} value={from} onChange={setFrom} />
              <span className="text-xs text-muted-foreground">to</span>
              <HourSelect label={`${dayLabel} until`} value={until} onChange={setUntil} />
            </div>
            {overnight ? (
              <p className="text-xs text-muted-foreground">
                Runs past midnight — {fmt12(from)} to {fmt12(until)} covers the overnight hours.
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Label className="w-16 shrink-0">Rate (₱)</Label>
            <Input
              aria-label={`${dayLabel} rate`}
              value={amount}
              inputMode="decimal"
              required
              autoFocus
              placeholder="150"
              onChange={(e) => setAmount(e.target.value)}
              className="h-8 max-w-32 text-right font-semibold tabular-nums"
            />
          </div>

          {sameTime ? (
            <p className="text-xs text-muted-foreground">
              Open and close times must differ.
            </p>
          ) : !hasRate ? (
            <p className="text-xs text-muted-foreground">
              Set a rate — hours without a price can&apos;t be booked.
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || saving || busy !== null}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── merged court editor ───────────────────────────────────────────────────

function EditCourtModal({
  court,
  hours,
  onClose,
}: {
  court: CourtRow;
  hours: HourRow[];
  onClose: () => void;
}) {
  const { busy, addRow, updateAmount, deleteRow } = useHoursActions();
  const [addDay, setAddDay] = useState<number | null>(null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-court-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 id="edit-court-modal-title" className="min-w-0 truncate text-sm font-medium">
              Edit — {court.name}
            </h2>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-3 text-xs text-muted-foreground">
            One row is one day's hours and rate. A different rate period is just
            another row.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {DAY_NAMES.map((day, i) => {
              const rows = hours
                .filter((h) => h.courtId === court.id && h.dayOfWeek === i)
                .sort((a, b) => a.openTime.localeCompare(b.openTime));
              const isToday = new Date().getDay() === i;

              return (
                <div
                  key={day}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border p-3",
                    isToday && "border-ring/50 bg-accent/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {day.slice(0, 3)}
                    </span>
                    {isToday && (
                      <Badge variant="secondary" className="text-[10px]">
                        Today
                      </Badge>
                    )}
                  </div>

                  {rows.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">No hours yet</p>
                  ) : (
                    rows.map((row) => (
                      <EditableHourRow
                        key={row.id}
                        row={row}
                        busy={busy}
                        onDelete={deleteRow}
                        onSaveAmount={updateAmount}
                      />
                    ))
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="mt-auto w-full justify-center text-muted-foreground"
                    onClick={() => setAddDay(i)}
                  >
                    <PlusCircle />
                    Add hours &amp; rate
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {addDay !== null ? (
        <AddHoursModal
          dayIndex={addDay}
          dayLabel={DAY_NAMES[addDay] ?? ""}
          busy={busy}
          onAdd={(dayOfWeek, openTime, closeTime, amount) =>
            addRow(dayOfWeek, court.id, openTime, closeTime, amount, {
              successMessage: `${DAY_NAMES[dayOfWeek]} hours added.`,
            })
          }
          onClose={() => setAddDay(null)}
        />
      ) : null}
    </div>
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

// ── card chrome ───────────────────────────────────────────────────────────

function RateCard({
  title,
  image,
  headerExtra,
  summary,
  footer,
  children,
}: {
  title: string;
  image?: { src: string; alt: string };
  headerExtra?: ReactNode;
  summary: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground">
      {image ? (
        <LandingImage src={image.src} alt={image.alt} className="h-32 w-full shrink-0" />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <p className="min-w-0 truncate text-sm font-medium">{title}</p>
        {headerExtra}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 flex items-center justify-between border-t px-5 py-3 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
        aria-expanded={open}
      >
        {summary}
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>

      {open ? children : null}
      {open && footer ? (
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">{footer}</p>
      ) : null}
    </div>
  );
}

// ── cards view ────────────────────────────────────────────────────────────

type HourLine = { days: string; text: string };

/** One line per run of consecutive days sharing the same hours + rates. */
function courtHourLines(hours: HourRow[], courtId: string): HourLine[] {
  const perDay = MON_SUN.map((day) => {
    const rows = hours
      .filter((h) => h.courtId === courtId && h.dayOfWeek === day)
      .sort((a, b) => a.openTime.localeCompare(b.openTime));
    return rows
      .map(
        (r) =>
          `${fmt12(r.openTime)}–${fmt12(r.closeTime)} · ${
            r.amount === null ? "no rate yet" : `₱${r.amount}`
          }`,
      )
      .join(", ");
  });

  const runs: { first: number; last: number; text: string; at: number }[] = [];
  perDay.forEach((text, i) => {
    if (text === "") return;
    const day = MON_SUN[i] as number;
    const last = runs[runs.length - 1];
    if (last && last.text === text && last.at === i - 1) {
      last.last = day;
      last.at = i;
    } else {
      runs.push({ first: day, last: day, text, at: i });
    }
  });

  return runs.map((r) => ({
    days: r.first === r.last ? dayShort(r.first) : `${dayShort(r.first)}–${dayShort(r.last)}`,
    text: r.text,
  }));
}

function CardsView({
  courts,
  rules,
  hours,
}: {
  courts: CourtRow[];
  rules: PricingRuleRow[];
  hours: HourRow[];
}) {
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<CourtRow | null>(null);

  const rentalRules = useMemo(
    () =>
      rules
        .filter((r) => r.itemType === "paddle" || r.itemType === "ball")
        .sort((a, b) => a.itemType.localeCompare(b.itemType)),
    [rules],
  );

  const changeAmount = (draftKey: string, val: string) =>
    setAmounts((m) => ({ ...m, [draftKey]: val }));

  const rentalDirty = rentalRules.filter((r) => {
    const draft = amounts[`global|${r.id}`];
    return draft !== undefined && draft.trim() !== r.amount;
  }).length;

  async function saveRental(rule: PricingRuleRow, draftKey: string) {
    const amount = (amounts[draftKey] ?? rule.amount).trim();
    if (amount === rule.amount) {
      toast.info("No change to save.");
      return;
    }
    setBusy(draftKey);
    try {
      const res = await fetch(`/api/admin/pricing/${rule.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(data.error?.message ?? "Pricing update failed.");
        return;
      }
      // Clear the draft so it no longer shows as dirty
      setAmounts((m) => {
        const next = { ...m };
        delete next[draftKey];
        return next;
      });
      toast.success(`Rate updated to ₱${parseFloat(amount).toFixed(2)}.`);
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function flip(court: CourtRow) {
    const next = court.status === "active" ? "inactive" : "active";
    setBusy(court.id);
    try {
      const res = await fetch(`/api/admin/courts/${court.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(data.error?.message ?? "Court update failed.");
        return;
      }
      toast.success(next === "active" ? "Court activated." : "Court deactivated.");
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">Courts</h2>
          <p className="text-xs text-muted-foreground">
            Each row sets a court's hours and rate for one day. Inactive courts
            are hidden from booking but retain all history.
          </p>
        </div>

        {courts.length > 0 ? (
          <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {courts.map((court, i) => {
              const lines = courtHourLines(hours, court.id);

              return (
                <RateCard
                  key={court.id}
                  title={court.name}
                  image={{
                    src: `/images/court-${(i % 2) + 1}.jpg`,
                    alt: `${court.name} photo`,
                  }}
                  headerExtra={
                    <>
                      <CourtStatusBadge status={court.status} />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => flip(court)}
                      >
                        {busy === court.id
                          ? "Saving…"
                          : court.status === "active"
                            ? "Deactivate"
                            : "Activate"}
                      </Button>
                    </>
                  }
                  summary={
                    <span className="line-clamp-2">
                      {lines.length > 0
                        ? lines.map((l) => `${l.days} ${l.text}`).join(" · ")
                        : "No open hours yet"}
                    </span>
                  }
                >
                  <div className="space-y-2 border-t px-5 py-4">
                    {lines.length > 0 ? (
                      <div className="space-y-1.5">
                        {lines.map((line, j) => (
                          <p key={`${line.days}-${j}`} className="text-sm">
                            <span className="font-medium">{line.days}</span>
                            <span className="text-muted-foreground"> {line.text}</span>
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No open hours yet — click Edit to add.
                      </p>
                    )}

                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditing(court)}>
                        Edit
                      </Button>
                    </div>
                  </div>
                </RateCard>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No courts found.
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">Paddle &amp; ball</h2>
          <p className="text-xs text-muted-foreground">
            Prices paddle/ball rental per booked hour.
          </p>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <RateCard
            title="Paddle & ball"
            summary={
              <span>
                {rentalRules.length} rate{rentalRules.length !== 1 ? "s" : ""}
                {rentalDirty > 0 ? (
                  <span className="ml-2 font-medium text-foreground">
                    {rentalDirty} unsaved
                  </span>
                ) : null}
              </span>
            }
          >
            {rentalRules.length > 0 ? (
              <div className="space-y-2 px-5 pb-5">
                {rentalRules.map((rule) => {
                  const draftKey = `global|${rule.id}`;
                  const scoped = rule.dayType !== "all" || rule.timeBand !== "all";
                  return (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{labelFor(rule.itemType)}</p>
                        <p className="text-xs text-muted-foreground">
                          {labelFor(rule.unit)}
                          {scoped
                            ? ` · ${labelFor(rule.dayType)} ${labelFor(rule.timeBand)}`
                            : ""}
                        </p>
                      </div>
                      <AmountField
                        label={labelFor(rule.timeBand)}
                        amount={rule.amount}
                        draft={amounts[draftKey]}
                        busy={busy === draftKey}
                        onChange={(val) => changeAmount(draftKey, val)}
                        onSave={() => saveRental(rule, draftKey)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="px-5 pb-5 text-xs text-muted-foreground">
                No paddle or ball rates found.
              </p>
            )}
          </RateCard>
        </div>
      </section>

      {editing ? (
        <EditCourtModal
          court={editing}
          hours={hours}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

// ── root export ───────────────────────────────────────────────────────────

export default function HoursManager({
  hours,
  closures,
  courts,
  rules,
}: {
  hours: HourRow[];
  closures: ClosureRow[];
  courts: CourtRow[];
  rules: PricingRuleRow[];
}) {
  return (
    <div className="space-y-10">
      <CardsView courts={courts} rules={rules} hours={hours} />

      <div className="border-t" />
      <ClosuresSection initialClosures={closures} courts={courts} />
    </div>
  );
}
