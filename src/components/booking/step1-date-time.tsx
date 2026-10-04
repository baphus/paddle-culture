"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Calendar,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  Moon,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { MAX_SLOTS_PER_BOOKING } from "@/lib/booking/constants";
import { slotsForDate, timeBandFor } from "@/lib/booking/slots";
import {
  addDaysManilaStr,
  daysInManilaMonth,
  firstWeekdayManila,
  formatManilaLong,
  formatSlotRange,
  manilaTodayStr,
  manilaTomorrowStr,
  maxBookableDateStr,
  monthLabelManila,
  weekdayManila,
  type CourtOption,
} from "@/lib/courts";
import { FALLBACK_RATES, peso, type DisplayRates } from "@/lib/pricing-display";
import DetailsForm, { type DetailsValues } from "./details-form";
import PaymentStep from "./payment-step";
import LandingImage from "@/components/landing/landing-image";

interface AvailabilitySlot {
  index: number;
  start: string;
  state: "free" | "held" | "pending" | "approved";
  bookable: boolean;
}

interface CourtAvailability {
  courtId: string;
  slots: AvailabilitySlot[];
}

export interface HoldState {
  tokens: string[];
  deadlineMs: number;
  expiresAt: string;
  /** Inputs the hold was created for — used to detect stale holds. */
  courtIds: string[];
  slotStarts: string[];
}

type CellState = "open" | "held" | "booked" | "closed" | "past";

const HOLD_ERROR_FRIENDLY: Record<string, string> = {
  OFF_GRID: "That time isn't on the hourly grid. Pick a listed slot.",
  NON_CONSECUTIVE_SLOTS: "Pick consecutive hours with no gaps (e.g. 6–8 AM).",
  SLOT_PAST: "That slot already started. Pick a future time.",
  TOO_MANY_SLOTS: `Max ${MAX_SLOTS_PER_BOOKING} court-hours per booking — fewer hours or courts.`,
  SLOT_UNAVAILABLE: "Someone just took one of those slots. Refresh and pick again.",
  SLOT_CLOSED: "A selected time is closed. Pick another time.",
  COURT_UNAVAILABLE: "A selected court isn't bookable right now.",
  UNKNOWN_COURT: "A selected court no longer exists. Refresh the page.",
  DUPLICATE_SLOT: "You picked the same hour twice.",
};

function friendlyHoldError(code: string | undefined, fallback: string): string {
  return (code && HOLD_ERROR_FRIENDLY[code]) || fallback;
}

function cellState(slot: AvailabilitySlot, now: number): CellState {
  if (slot.state === "held") return "held";
  if (slot.state === "pending" || slot.state === "approved") return "booked";
  if (new Date(slot.start).getTime() <= now) return "past";
  if (!slot.bookable) return "closed";
  return "open";
}

const CELL_LABEL: Record<CellState, string> = {
  open: "Open",
  held: "Held",
  booked: "Booked",
  closed: "Closed",
  past: "Past",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function partsOf(dateStr: string): { y: number; m: number } {
  const [y, m] = dateStr.split("-").map(Number);
  return { y: y as number, m: (m as number) - 1 };
}

const CARD = "bg-cream border border-line-warm/60 rounded-2xl p-6 sm:p-7 shadow-sm";

/**
 * Wizard step 1 — play date + time slots (+ live booking summary).
 *
 * Holds ALL active courts for the picked consecutive hours (court choice is
 * step 2, which consumes a subset of these hold tokens). Pairs are capped at
 * MAX_SLOTS_PER_BOOKING, enforced client-side with toast() before POST.
 */
export interface Step1DateTimeProps {
  initialCourts: CourtOption[];
  initialRates?: DisplayRates;
  existingHold?: HoldState | null;
  initialSelectedDate?: string | null;
  initialCourtIds?: string[];
  initialSelectedSlots?: string[];
  onHoldSuccess?: (
    hold: HoldState,
    courtIds: string[],
    slotStarts: string[],
    date: string,
  ) => void;
  onHoldExpired?: () => void;
  onCancel?: () => void;
}

export default function Step1DateTime({
  initialCourts,
  initialRates = FALLBACK_RATES,
  existingHold = null,
  initialSelectedDate = null,
  initialCourtIds,
  initialSelectedSlots,
  onHoldSuccess,
  onHoldExpired,
  onCancel,
}: Step1DateTimeProps) {
  const todayStr = useMemo(() => manilaTodayStr(), []);
  const tomorrowStr = useMemo(() => manilaTomorrowStr(), []);
  const maxStr = useMemo(() => maxBookableDateStr(), []);

  const [courts, setCourts] = useState<CourtOption[]>(initialCourts);
  const [courtIds, setCourtIds] = useState<string[]>(() =>
    initialCourtIds && initialCourtIds.length > 0
      ? initialCourtIds
      : initialCourts.length > 0
        ? [initialCourts[0].id]
        : [],
  );
  const [rates, setRates] = useState<DisplayRates>(initialRates);
  // No date pre-selected: progressive reveal shows ONLY the date card first unless initialSelectedDate is provided.
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelectedDate ?? null);
  const [view, setView] = useState(() => partsOf(initialSelectedDate ?? todayStr));
  const [avail, setAvail] = useState<CourtAvailability[] | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [availFailed, setAvailFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<string[]>(initialSelectedSlots ?? []);
  const [hold, setHold] = useState<HoldState | null>(existingHold ?? null);
  const [holding, setHolding] = useState(false);

  // Carousel state: panel 0 = date, panel 1 = time.
  // Court choice is deliberately first: availability is then calculated for
  // exactly the courts the guest intends to reserve.
  const [panel, setPanel] = useState<0 | 1 | 2>(initialSelectedDate ? 2 : 0);
  const panelHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const selectedRef = useRef<string[]>([]);
  selectedRef.current = selected;
  const carryRef = useRef(false);
  const touchX = useRef<number | null>(null);

  // Refresh the court list live (read-only); keep the server-rendered list as
  // fallback when the DB is unreachable.
  useEffect(() => {
    fetch("/api/courts")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { courts?: CourtOption[] } | null) => {
        if (b?.courts && b.courts.length > 0) {
          setCourts(b.courts);
          setCourtIds((prev) =>
            prev.length > 0
              ? prev.filter((id) => b.courts!.some((c) => c.id === id))
              : [b.courts![0].id],
          );
        }
      })
      .catch(() => {});
  }, []);

  // Refresh display rates live (estimate-only — the server recalculates the
  // authoritative total at submit and never trusts this number).
  useEffect(() => {
    fetch("/api/pricing")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: DisplayRates | null) => {
        if (
          b &&
          [b.morning, b.evening, b.paddle, b.ball].every(
            (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
          )
        ) {
          setRates({
            morning: b.morning,
            evening: b.evening,
            paddle: b.paddle,
            ball: b.ball,
            currency: "PHP",
          });
        }
      })
      .catch(() => {});
  }, []);

  const courtsKey = useMemo(() => [...courtIds].sort().join(","), [courtIds]);

  // Availability read (single grid source: 06:00–03:00+1d from the server).
  useEffect(() => {
    if (courtIds.length === 0 || !selectedDate) {
      setAvail(null);
      setAvailFailed(false);
      return;
    }
    const ids = [...courtIds].sort();
    const ctrl = new AbortController();
    setLoadingAvail(true);
    setAvailFailed(false);
    const qs = new URLSearchParams({ date: selectedDate });
    for (const id of ids) qs.append("courtId", id);
    fetch(`/api/availability?${qs.toString()}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) {
          let msg = "Could not load availability.";
          try {
            const b = (await r.json()) as { error?: { message?: string } };
            if (b.error?.message) msg = b.error.message;
          } catch {}
          throw new Error(msg);
        }
        return r.json() as Promise<{ courts: CourtAvailability[] }>;
      })
      .then((b) => {
        setAvail(b.courts);
        // Date-change carry-over: keep the same slot indices where still open
        // on every court; drop the rest with a toast explanation.
        if (carryRef.current) {
          carryRef.current = false;
          const fresh = new Map(
            b.courts.map((c) => [c.courtId, new Map(c.slots.map((s) => [s.start, s]))]),
          );
          const now = Date.now();
          const prev = selectedRef.current;
          const kept = prev.filter((iso) =>
            ids.every((courtId) => {
              const s = fresh.get(courtId)?.get(iso);
              return !!s && cellState(s, now) === "open";
            }),
          );
          if (kept.length !== prev.length) {
            setSelected(kept);
            toast(
              kept.length === 0
                ? "Those hours aren't open on the new date — pick your time again."
                : "Some hours aren't open on the new date — kept the ones that are.",
            );
          }
        }
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        toast.error(e instanceof Error ? e.message : "Could not load availability.");
        setAvail(null);
        setAvailFailed(true);
      })
      .finally(() => setLoadingAvail(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, courtsKey, retryKey]);

  const slotByCourt = useMemo(() => {
    const m = new Map<string, Map<string, AvailabilitySlot>>();
    for (const c of avail ?? []) {
      m.set(c.courtId, new Map(c.slots.map((s) => [s.start, s])));
    }
    return m;
  }, [avail]);

  // Canonical 21-slot grid for the selected Manila date (single date source:
  // slots + labels both derive from selectedDate; empty until a date is picked).
  const gridSlots = useMemo(
    () => (selectedDate ? slotsForDate(selectedDate).map((s) => s.start.toISOString()) : []),
    [selectedDate],
  );

  const selectedSorted = useMemo(
    () => [...selected].sort((a, b) => new Date(a).getTime() - new Date(b).getTime()),
    [selected],
  );

  function toggleSlot(startIso: string) {
    if (hold) return;
    if (!avail) {
      toast.error("Loading fresh slots — try again in a moment.");
      return;
    }
    if (courtIds.length === 0) {
      toast.error("No courts listed right now — check back soon.");
      return;
    }
    const now = Date.now();
    if (selected.includes(startIso)) {
      setSelected(selected.filter((s) => s !== startIso));
      return;
    }
    // Must be open on EVERY held court (same slots across courts).
    for (const id of courtIds) {
      const slot = slotByCourt.get(id)?.get(startIso);
      const name = courts.find((c) => c.id === id)?.name ?? "Court";
      if (!slot || cellState(slot, now) !== "open") {
        const reason =
          !slot || cellState(slot, now) === "booked" || cellState(slot, now) === "held"
            ? "is already taken"
            : cellState(slot, now) === "past"
              ? "already started (future slots only)"
              : "is closed";
        toast.error(`${name} ${formatSlotRange(startIso)} ${reason}.`);
        return;
      }
    }
    const next = [...selected, startIso].sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );
    if (next.length * courtIds.length > MAX_SLOTS_PER_BOOKING) {
      toast.error(
        `Max ${MAX_SLOTS_PER_BOOKING} court-hours per booking — fewer hours or courts.`,
      );
      return;
    }
    const times = next.map((s) => new Date(s).getTime());
    for (let i = 1; i < times.length; i++) {
      if ((times[i] as number) - (times[i - 1] as number) !== 3_600_000) {
        toast.error("Pick consecutive hours with no gaps (e.g. 6–8 AM).");
        return;
      }
    }
    setSelected(next);
  }

  async function createHold() {
    if (selectedSorted.length === 0) {
      toast.error("Pick at least 1 hour first.");
      return;
    }
    if (courtIds.length === 0) {
      toast.error("No courts listed right now — check back soon.");
      return;
    }
    setHolding(true);
    try {
      const res = await fetch("/api/holds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courtIds: [...courtIds].sort(), slotStarts: selectedSorted }),
      });
      if (!res.ok) {
        let code: string | undefined;
        let msg = "Could not hold those slots.";
        try {
          const b = (await res.json()) as { error?: { code?: string; message?: string } };
          code = b.error?.code;
          if (b.error?.message) msg = b.error.message;
        } catch {}
        toast.error(friendlyHoldError(code, msg));
        return;
      }
      const body = (await res.json()) as {
        holds: Array<{ holdToken: string }>;
        expiresAt: string;
        deadlineMs: number;
      };
      const holdState: HoldState = {
        tokens: body.holds.map((h) => h.holdToken),
        deadlineMs: body.deadlineMs,
        expiresAt: body.expiresAt,
        courtIds: [...courtIds].sort(),
        slotStarts: selectedSorted,
      };
      setHold(holdState);
      toast.success("Slots held — continue to details before the timer ends.");
      if (onHoldSuccess && selectedDate) {
        onHoldSuccess(holdState, courtIds, selectedSorted, selectedDate);
      }
    } catch {
      toast.error("Could not hold those slots. Check your connection and retry.");
    } finally {
      setHolding(false);
    }
  }

  const handleHoldExpired = useCallback(() => {
    setHold(null);
    if (onHoldExpired) onHoldExpired();
    toast.error("Your hold expired — tap “Hold & Continue” again to re-hold your slots.", {
      duration: 8000,
    });
  }, [onHoldExpired]);

  function handleContinueCta() {
    if (hold && onHoldSuccess && selectedDate) {
      onHoldSuccess(hold, courtIds, selectedSorted, selectedDate);
      return;
    }
    void createHold();
  }

  function resetSlots() {
    if (hold) return;
    setSelected([]);
  }

  function startOver() {
    // Client state only: the server hold (if any) expires on its own clock.
    // Clearing the date collapses the wizard back to the date panel alone.
    setHold(null);
    setSelected([]);
    setSelectedDate(null);
    setPanel(0);
  }

  // Keep keyboard/screen-reader focus inside the wizard on panel switches.
  // preventScroll: the carousel must never cause page scroll jumps.
  const panelMounted = useRef(false);
  useEffect(() => {
    if (!panelMounted.current) {
      panelMounted.current = true;
      return;
    }
    panelHeadingRef.current?.focus({ preventScroll: true });
  }, [panel]);

  function goPanel(p: 0 | 1 | 2) {
    if (p === 1 && courtIds.length === 0) {
      toast.error("Choose at least one court first.");
      return;
    }
    if (p === 2 && !selectedDate) {
      toast.error("Pick a play date first.");
      return;
    }
    setPanel(p);
  }

  // ---- Calendar model (single source: `view` drives label + day cells) ----
  const monthLabel = monthLabelManila(view.y, view.m);
  const leadBlanks = firstWeekdayManila(view.y, view.m);
  const daysInMonth = daysInManilaMonth(view.y, view.m);
  const viewKey = `${view.y}-${pad2(view.m + 1)}`;
  const curKey = todayStr.slice(0, 7);
  const maxKey = maxStr.slice(0, 7);
  const prevDisabled = viewKey <= curKey;
  const nextDisabled = viewKey >= maxKey;

  function shiftView(dir: 1 | -1) {
    const m = view.m + dir;
    setView({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  }

  function pickDate(dateStr: string) {
    if (dateStr < todayStr || dateStr > maxStr) return;
    if (dateStr === selectedDate) {
      // Re-tapping the active date just opens the time panel.
      setPanel(2);
      panelHeadingRef.current?.focus({ preventScroll: true });
      return;
    }
    // Carry compatible hours (same slot indices) to the new date; the
    // availability read below verifies them and drops closed ones with a toast.
    const carried = selected
      .map((iso) => gridSlots.indexOf(iso))
      .filter((i) => i >= 0);
    const freshGrid = slotsForDate(dateStr).map((s) => s.start.toISOString());
    const next = carried
      .map((i) => freshGrid[i] as string | undefined)
      .filter((iso): iso is string => !!iso);
    if (hold) {
      setHold(null);
      toast("Date changed — your previous hold was released.");
    }
    carryRef.current = next.length > 0;
    setSelected(next);
    setSelectedDate(dateStr);
    // Drop stale availability so the time panel shows loading, not old data.
    setAvail(null);
    // Keep the month view on the picked date (single source, no label drift).
    setView(partsOf(dateStr));
    // Selecting a date auto-advances to the time panel (no scrolling).
    setPanel(2);
  }

  type DayKind = "past" | "today" | "open" | "selected" | "beyond";
  function dayKind(dateStr: string): DayKind {
    if (dateStr < todayStr) return "past";
    if (dateStr > maxStr) return "beyond";
    if (dateStr === selectedDate) return "selected";
    if (dateStr === todayStr) return "today";
    return "open";
  }

  // Chunk leading blanks + month days into week rows (grid > row > gridcell).
  const weekRows = useMemo<Array<Array<{ key: string; dateStr: string | null }>>>(() => {
    const cells: Array<{ key: string; dateStr: string | null }> = [];
    for (let i = 0; i < leadBlanks; i++) cells.push({ key: `blank-${i}`, dateStr: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ key: `${view.y}-${pad2(view.m + 1)}-${pad2(d)}`, dateStr: `${view.y}-${pad2(view.m + 1)}-${pad2(d)}` });
    }
    while (cells.length % 7 !== 0) cells.push({ key: `trail-${cells.length}`, dateStr: null });
    const rows: Array<Array<{ key: string; dateStr: string | null }>> = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.y, view.m, leadBlanks, daysInMonth]);

  // ---- Slots split: Day 06:00–18:00 vs Night 18:00–03:00+1d ----
  const nowMs = Date.now();
  const daySlots = useMemo(
    () => gridSlots.filter((iso) => timeBandFor(new Date(iso)) !== "evening"),
    [gridSlots],
  );
  const nightSlots = useMemo(
    () => gridSlots.filter((iso) => timeBandFor(new Date(iso)) === "evening"),
    [gridSlots],
  );

  function slotCell(iso: string): { state: CellState; blocked: boolean } {
    // Blocked unless open on EVERY held court; fall back to grid-only past
    // check while availability is loading so the grid still renders.
    if (!avail) {
      return new Date(iso).getTime() <= nowMs
        ? { state: "past", blocked: true }
        : { state: "open", blocked: false };
    }
    for (const id of courtIds) {
      const slot = slotByCourt.get(id)?.get(iso);
      const st = slot ? cellState(slot, nowMs) : "closed";
      if (st !== "open") return { state: st, blocked: true };
    }
    return { state: "open", blocked: false };
  }

  function renderSlotButton(iso: string) {
    const { state, blocked } = slotCell(iso);
    const isSel = selected.includes(iso);
    const label = formatSlotRange(iso);
    const rate = timeBandFor(new Date(iso)) === "evening" ? rates.evening : rates.morning;
    if (blocked) {
      const tag = state === "booked" || state === "held" ? "Booked" : CELL_LABEL[state];
      return (
        <button
          key={iso}
          type="button"
          disabled
          aria-disabled="true"
          title={`${label} — ${CELL_LABEL[state]}`}
          className="flex cursor-not-allowed flex-col rounded-xl border border-line-warm/30 bg-surface-dim/30 p-3 text-left opacity-60"
        >
          <span className="text-xs font-medium text-warm-muted line-through">{label}</span>
          <span className="mt-0.5 text-[10px] font-bold uppercase text-error">{tag}</span>
        </button>
      );
    }
    return (
      <button
        key={iso}
        type="button"
        disabled={!!hold || holding}
        onClick={() => toggleSlot(iso)}
        aria-pressed={isSel}
        aria-disabled={!!hold || holding}
        title={`${label} — ${isSel ? "Selected" : "Open"}`}
        className={cn(
          "flex flex-col rounded-xl border p-3 text-left shadow-xs transition-all",
          isSel
            ? "border-flame bg-flame text-white shadow-sm"
            : "border-line-warm/60 bg-white hover:border-flame/50",
        )}
      >
        <span
          className={cn(
            "flex items-center justify-between text-xs font-bold",
            isSel ? "text-white" : "text-ink",
          )}
        >
          <span>{label}</span>
          {isSel ? <Check className="size-3.5" aria-hidden /> : null}
        </span>
        <span className={cn("mt-0.5 text-[11px]", isSel ? "text-white/90" : "text-warm-muted")}>
          {peso(rate)} / hr
        </span>
      </button>
    );
  }

  // ---- Date label (used in panel subtitle + sr-only status) ----
  const dateLabel = (() => {
    if (!selectedDate) return "Pick a date to see slots";
    const long = formatManilaLong(selectedDate);
    if (selectedDate === tomorrowStr) return `Tomorrow (${long})`;
    if (selectedDate === addDaysManilaStr(todayStr, 2)) return `Day after tomorrow (${long})`;
    return long;
  })();

  const ctaDisabled = selectedSorted.length === 0 || holding || !!hold || courtIds.length === 0;

  return (
    <>
    <div>
      <div className="flex min-w-0 flex-col gap-6">
        <section
          aria-labelledby="wizard-heading"
          className={cn(CARD, !selectedDate && "mx-auto w-full max-w-3xl")}
        >
          {/* Stepper header */}
          <div className="mb-6">
            <div className="flex items-center justify-between gap-3">
              <h1 id="wizard-heading" className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
                {panel === 0 ? "Step 1 of 3 — Courts" : panel === 1 ? "Step 2 of 3 — Date" : "Step 3 of 3 — Time"}
              </h1>
              <nav aria-label="Booking steps" className="flex shrink-0 items-center gap-1.5">
                {([0, 1, 2] as const).map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goPanel(i)}
                    aria-current={panel === i ? "step" : undefined}
                    aria-label={i === 0 ? "Step 1: choose courts" : i === 1 ? "Step 2: pick a date" : "Step 3: pick a time"}
                    className={cn(
                      "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-bold transition-all",
                      panel === i
                        ? "bg-flame text-white shadow-sm"
                        : "border border-line-warm/60 bg-white text-warm-muted hover:border-flame/50 hover:text-ink",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 place-items-center rounded-full text-[11px] font-black",
                        panel === i ? "bg-white/25 text-white" : "bg-oat text-pine",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="hidden sm:inline">{i === 0 ? "Courts" : i === 1 ? "Date" : "Time"}</span>
                  </button>
                ))}
              </nav>
            </div>
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-oat"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={3}
              aria-valuenow={panel + 1}
              aria-label="Booking progress"
            >
              <div className={cn("h-full rounded-full bg-flame transition-all", panel === 0 ? "w-1/3" : panel === 1 ? "w-2/3" : "w-full")} />
            </div>
            <p className="mt-2 text-xs text-warm-muted sm:text-sm">
              {panel === 0
                ? "Choose one or more courts. Times must be free on every court you select."
                : panel === 1
                  ? "Select an active calendar date to view available hours."
                  : `${dateLabel} · times shown are free on every selected court`}
            </p>
          </div>

          {/* Panels: one visible at a time in the same footprint, swipeable */}
          <div
            className="min-h-[480px] sm:min-h-[560px]"
            onTouchStart={(e) => {
              touchX.current = e.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
              touchX.current = null;
              if (Math.abs(dx) < 60) return;
              if (dx < 0) goPanel(panel === 0 ? 1 : 2);
              else setPanel(panel === 2 ? 1 : 0);
            }}
          >
          {panel === 0 ? (
          <div key="panel-courts" className="animate-rise motion-reduce:animate-none">
            <h2 ref={panelHeadingRef} tabIndex={-1} className="text-lg font-extrabold tracking-tight text-ink outline-none sm:text-xl">
              Choose your court{courts.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-sm text-warm-muted">Select every court you need. We will only offer times available on all of them.</p>
            {courts.length === 0 ? (
              <p className="mt-5 rounded-xl border border-line-warm/60 bg-white p-4 text-sm text-warm-muted">No courts listed right now — check back soon.</p>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {courts.map((court, index) => {
                  const isSelected = courtIds.includes(court.id);
                  return (
                    <button
                      key={court.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (hold) return;
                        setCourtIds((current) => current.includes(court.id) ? current.filter((id) => id !== court.id) : [...current, court.id]);
                        setSelected([]);
                        setAvail(null);
                      }}
                      className={cn("overflow-hidden rounded-2xl border-2 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5", isSelected ? "border-flame ring-2 ring-flame/20" : "border-line-warm/60 hover:border-flame/50")}
                    >
                      <LandingImage src={`/images/court-${(index % 2) + 1}.jpg`} alt={`${court.name} court`} label={`${court.name} photo`} className="aspect-[16/8]" imgClassName="object-cover" />
                      <span className="flex items-center justify-between gap-3 p-4">
                        <span><span className="block text-base font-extrabold text-ink">{court.name}</span><span className="mt-0.5 block text-xs font-semibold text-warm-muted">{peso(rates.morning)}/hr day · {peso(rates.evening)}/hr evening</span></span>
                        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border", isSelected ? "border-flame bg-flame text-white" : "border-line-warm text-transparent")}>{isSelected && <Check className="size-4" />}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          ) : panel === 1 ? (
          <div key="panel-date" className="animate-rise motion-reduce:animate-none">
          <div className="rounded-xl border border-line-warm/50 bg-white p-4 shadow-inner sm:p-5">
            <div className="mb-3 flex items-center justify-between border-b border-line-warm/40 pb-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-[22px] text-flame" aria-hidden />
                <h2 ref={panelHeadingRef} tabIndex={-1} className="text-base font-bold text-ink outline-none">{monthLabel}</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={prevDisabled}
                  onClick={() => shiftView(-1)}
                  title="Previous Month"
                  aria-label="Previous month"
                  className="grid size-11 place-items-center rounded-lg border border-line-warm/60 text-warm-muted transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="size-[18px]" aria-hidden />
                </button>
                <button
                  type="button"
                  disabled={nextDisabled}
                  onClick={() => shiftView(1)}
                  title="Next Month"
                  aria-label="Next month"
                  className="grid size-11 place-items-center rounded-lg border border-line-warm/60 text-ink transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="size-[18px]" aria-hidden />
                </button>
              </div>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-bold tracking-wide text-warm-muted uppercase sm:text-[11px] sm:tracking-wider">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            <div role="grid" aria-label={`Choose a play date — ${monthLabel}`} className="grid grid-cols-7 gap-1 sm:gap-2">
              {weekRows.map((row, ri) => (
                <div key={`row-${ri}`} role="row" className="contents">
                    {row.map((cell) => {
                      if (!cell.dateStr) {
                        return (
                          <div key={cell.key} role="gridcell" aria-disabled="true" className="h-12 sm:h-20" />
                        );
                      }
                      const dateStr = cell.dateStr;
                      const kind = dayKind(dateStr);
                      const dayNum = Number(dateStr.slice(8, 10));
                      if (kind === "past" || kind === "beyond") {
                        return (
                          <div
                            key={cell.key}
                            role="gridcell"
                            aria-disabled="true"
                            aria-label={`${formatManilaLong(dateStr)} — unavailable`}
                            className="flex h-12 cursor-not-allowed flex-col justify-between rounded-lg border border-line-warm/20 bg-surface-dim/20 p-1 text-xs text-warm-muted/50 sm:h-20 sm:rounded-xl sm:p-1.5"
                          >
                            <span className="font-medium">{dayNum}</span>
                            {kind === "past" ? (
                              <span className="text-[9px] font-bold uppercase">Past</span>
                            ) : null}
                          </div>
                        );
                      }
                      if (kind === "today") {
                        const isSel = selectedDate === dateStr;
                        return (
                          <div key={cell.key} role="gridcell" aria-selected={isSel}>
                            <button
                              type="button"
                              onClick={() => pickDate(dateStr)}
                              aria-pressed={isSel}
                              aria-label={`${formatManilaLong(dateStr)} — today`}
                              className={cn(
                                "flex h-12 w-full flex-col justify-between rounded-lg border p-1 text-left transition-all sm:h-20 sm:rounded-xl sm:p-1.5",
                                isSel
                                  ? "border-2 border-flame bg-pine text-white shadow-md"
                                  : "border-flame/40 bg-flame-light/30 text-ink hover:bg-flame-light/50",
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <span
                                  className={cn(
                                    "text-sm font-bold sm:text-base",
                                    isSel ? "font-extrabold text-white" : "font-extrabold text-flame",
                                  )}
                                >
                                  {dayNum}
                                </span>
                              </div>
                              <div className="leading-tight">
                                <span className={cn(
                                  "block text-[9px] font-black uppercase tracking-wide",
                                  isSel ? "text-flame" : "text-flame",
                                )}>
                                  Today
                                </span>
                              </div>
                            </button>
                          </div>
                        );
                      }
                      const isSel = kind === "selected";
                      return (
                        <div key={cell.key} role="gridcell" aria-selected={isSel}>
                          <button
                            type="button"
                            onClick={() => pickDate(dateStr)}
                            aria-pressed={isSel}
                            aria-label={`${formatManilaLong(dateStr)}${dateStr === tomorrowStr ? " — tomorrow" : ""}`}
                            className={cn(
                                "flex h-12 w-full flex-col justify-between rounded-lg border p-1 text-left transition-all sm:h-20 sm:rounded-xl sm:p-1.5",
                              isSel
                                ? "border-2 border-flame bg-pine text-white shadow-md"
                                : "border-line-warm/70 bg-white text-ink hover:bg-oat",
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={cn(
                                  "text-sm font-bold sm:text-base",
                                  isSel ? "font-extrabold text-white" : "text-ink",
                                )}
                              >
                                {dayNum}
                              </span>
                            </div>
                            <div className="leading-tight">
                              {isSel ? (
                                <span className="block text-[9px] font-black tracking-wide text-flame uppercase">
                                  Selected
                                </span>
                              ) : (
                                <span className="block text-[9px] font-semibold text-warm-muted">
                                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                                    weekdayManila(dateStr)
                                  ]}
                                </span>
                              )}
                            </div>
                          </button>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-warm/40 pt-3 text-[11px] text-warm-muted">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded border border-flame bg-pine" aria-hidden />
                  Selected Date
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-warm-muted/40" aria-hidden />
                  Unavailable
                </span>
              </div>
            </div>
          </div>
          <p className="sr-only" role="status">
            {selectedDate
              ? `Step ${panel + 1} of 3. Active date ${dateLabel}. ${selectedSorted.length} hours selected.`
              : "No date selected yet. Pick a play date to see time slots."}
          </p>
          </div>
          ) : (
          <div key="panel-time" className="animate-rise motion-reduce:animate-none">
          <div className="rounded-xl border border-line-warm/50 bg-white p-4 shadow-inner sm:p-5">
            {/* Court selection belongs to the first panel; this compact line
                keeps the time step focused on availability. */}
            <p className="mb-5 text-xs font-semibold text-warm-muted">
              {courtIds.length} court{courtIds.length === 1 ? "" : "s"} selected. Change them from the Courts step.
            </p>
            {false && courts.length > 0 && (
              <div className="mb-5 rounded-2xl border border-line-warm/70 bg-cream/40 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-pine uppercase tracking-wider">
                    Select Court(s)
                  </span>
                  <span className="text-[11px] font-semibold text-warm-muted">
                    {courtIds.length === 1
                      ? courts.find((c) => c.id === courtIds[0])?.name ?? "1 Court"
                      : `${courtIds.length} Courts (${peso(rates.morning * courtIds.length)}/hr Day · ${peso(rates.evening * courtIds.length)}/hr Night)`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {courts.map((c) => {
                    const isSelected = courtIds.includes(c.id) && courtIds.length === 1;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          if (hold) return;
                          setCourtIds([c.id]);
                          setSelected([]);
                        }}
                        className={cn(
                          "inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all",
                          isSelected
                            ? "bg-pine text-white shadow-xs"
                            : "border border-line-warm bg-white text-ink hover:bg-cream",
                        )}
                      >
                        <span>{c.name}</span>
                        {isSelected && <Check className="size-3.5" />}
                      </button>
                    );
                  })}
                  {courts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (hold) return;
                        setCourtIds(courts.map((c) => c.id));
                        setSelected([]);
                      }}
                      className={cn(
                        "inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all",
                        courtIds.length === courts.length
                          ? "bg-pine text-white shadow-xs"
                          : "border border-line-warm bg-white text-ink hover:bg-cream",
                      )}
                    >
                      <span>All Courts ({courts.length})</span>
                      {courtIds.length === courts.length && <Check className="size-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="mb-4 flex items-center gap-2">
              <h2
                ref={panelHeadingRef}
                tabIndex={-1}
                id="slots-heading"
                className="text-lg font-extrabold tracking-tight text-ink outline-none sm:text-xl"
              >
                Available Time Slots
              </h2>
            </div>

          {courtIds.length === 0 ? (
            <p className="rounded-xl border border-line-warm/60 bg-white p-4 text-sm text-warm-muted">
              No courts listed right now — check back soon.
            </p>
          ) : loadingAvail && !avail ? (
              <div className="flex min-h-32 items-center justify-center">
                <LoadingAnimation label="Loading available court times" />
              </div>
          ) : availFailed || !avail ? (
            <div className="rounded-xl border border-line-warm/60 bg-white p-4 text-sm">
              <p className="text-warm-muted">Could not load availability for this date.</p>
              <button
                type="button"
                onClick={() => setRetryKey((k) => k + 1)}
                className="mt-2 inline-flex min-h-[44px] items-center font-bold text-flame hover:text-flame-hover hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="mb-7">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-ink">
                    <Sun className="size-[17px] text-flame" aria-hidden />
                    <span>Morning (06:00 AM – 06:00 PM)</span>
                    <span className="font-extrabold text-flame">• {peso(rates.morning)}/hr</span>
                  </div>
                  <span className="text-[11px] font-semibold text-warm-muted">
                    {daySlots.length} Day Slots
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4" role="group" aria-label="Daytime slots">
                  {daySlots.map((iso) => renderSlotButton(iso))}
                </div>
              </div>

              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-ink">
                    <Moon className="size-[17px] text-pine" aria-hidden />
                    <span>Evening (06:00 PM – 03:00 AM)</span>
                    <span className="font-extrabold text-flame">• {peso(rates.evening)}/hr</span>
                  </div>
                  <span className="text-[11px] font-semibold text-warm-muted">
                    {nightSlots.length} Night Slots
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4" role="group" aria-label="Evening and night slots">
                  {nightSlots.map((iso) => renderSlotButton(iso))}
                </div>
              </div>
            </>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line-warm/40 pt-4 text-xs text-warm-muted">
            <div className="flex items-center gap-2">
              <Info className="size-[18px] text-pine" aria-hidden />
              <span>
                Selected:{" "}
                <strong className="font-bold text-pine">
                  {selectedSorted.length} consecutive hour{selectedSorted.length === 1 ? "" : "s"}
                </strong>{" "}
                (Min 1 hr, max 12 hrs)
              </span>
            </div>
            <button
              type="button"
              onClick={resetSlots}
              disabled={hold !== null || selected.length === 0}
              className="inline-flex min-h-[44px] items-center text-xs font-bold text-flame hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
            >
              Reset Time Selection
            </button>
            <a
              href="/"
              className="inline-flex min-h-[44px] items-center text-xs font-semibold text-warm-muted transition-colors hover:text-ink lg:hidden"
            >
              Cancel
            </a>
          </div>
          </div>
          </div>
          )}
          </div>

          {/* Thumb-reachable controls at the card bottom */}
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-line-warm/40 pt-4">
            {panel > 0 ? (
              <button
                type="button"
                onClick={() => setPanel(panel === 1 ? 0 : 1)}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-line-warm/60 bg-white px-5 text-sm font-bold text-pine transition-all hover:bg-oat"
              >
                <ChevronLeft className="size-4" aria-hidden /> Back
              </button>
            ) : (
              <a
                href="/"
                className="inline-flex min-h-[44px] items-center text-xs font-semibold text-warm-muted transition-colors hover:text-ink"
              >
                Cancel
              </a>
            )}
            {panel === 0 ? (
              <button
                type="button"
                onClick={() => goPanel(1)}
                disabled={courtIds.length === 0}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-flame px-5 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              >
                Continue to date <ArrowRight className="size-4" aria-hidden />
              </button>
            ) : panel === 1 ? (
              <button
                type="button"
                onClick={() => goPanel(2)}
                disabled={!selectedDate}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-flame px-5 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              >
                Continue to time <ArrowRight className="size-4" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleContinueCta}
                disabled={ctaDisabled}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-flame px-5 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              >
                {holding ? (
                  <><LoadingAnimation size="compact" label="Holding selected court times" /> Holding…</>
                ) : (
                  <>{hold ? "Continue to Details" : "Hold & Continue"}<ArrowRight className="size-4" aria-hidden /></>
                )}
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
    </>
  );
}
