"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
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
import Image from "next/image";
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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function partsOf(dateStr: string): { y: number; m: number } {
  const [y, m] = dateStr.split("-").map(Number);
  return { y: y as number, m: (m as number) - 1 };
}

export interface Step1DateTimeProps {
  initialCourts: CourtOption[];
  initialRates?: DisplayRates;
  existingHold?: HoldState | null;
  initialSelectedDate?: string | null;
  initialCourtIds?: string[];
  initialSelectedSlots?: string[];
  initialPaddleQty?: number;
  initialBall?: boolean;
  onHoldSuccess?: (
    hold: HoldState,
    courtIds: string[],
    slotStarts: string[],
    date: string,
    paddleQty: number,
    ball: boolean,
  ) => void;
  onHoldExpired?: () => void;
  onCancel?: () => void;
  /** Fires on every change so the parent can keep its summary data live */
  onLiveUpdate?: (update: {
    courtIds: string[];
    selectedDate: string | null;
    selectedSlots: string[];
    paddleQty: number;
    ball: boolean;
  }) => void;
}

// Panel order: 0=Date, 1=Courts, 2=TimeGrid, 3=Equipment
type Panel = 0 | 1 | 2 | 3;

export default function Step1DateTime({
  initialCourts,
  initialRates = FALLBACK_RATES,
  existingHold = null,
  initialSelectedDate = null,
  initialCourtIds,
  initialSelectedSlots,
  initialPaddleQty = 0,
  initialBall = false,
  onHoldSuccess,
  onHoldExpired,
  onCancel,
  onLiveUpdate,
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
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelectedDate ?? null);
  const [view, setView] = useState(() => partsOf(initialSelectedDate ?? todayStr));
  const [avail, setAvail] = useState<CourtAvailability[] | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [availFailed, setAvailFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [selected, setSelected] = useState<string[]>(initialSelectedSlots ?? []);
  const [hold, setHold] = useState<HoldState | null>(existingHold ?? null);
  const [holding, setHolding] = useState(false);

  const [paddleQty, setPaddleQty] = useState<number>(initialPaddleQty);
  const [ball, setBall] = useState<boolean>(initialBall);

  // Panel: 0=Date, 1=Courts, 2=TimeGrid, 3=Equipment
  const [panel, setPanel] = useState<Panel>(() => {
    if (initialSelectedDate && (initialCourtIds?.length ?? 0) > 0) return 2;
    if (initialSelectedDate) return 1;
    return 0;
  });
  const panelHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const selectedRef = useRef<string[]>([]);
  selectedRef.current = selected;
  const carryRef = useRef(false);

  // Notify parent of live state changes
  useEffect(() => {
    onLiveUpdate?.({ courtIds, selectedDate, selectedSlots: selected, paddleQty, ball });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtIds, selectedDate, selected, paddleQty, ball]);

  // Refresh court list live
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

  // Refresh display rates live
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
          setRates({ morning: b.morning, evening: b.evening, paddle: b.paddle, ball: b.ball, currency: "PHP" });
        }
      })
      .catch(() => {});
  }, []);

  const courtsKey = useMemo(() => [...courtIds].sort().join(","), [courtIds]);

  // Availability fetch when date or courts change
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

  const gridSlots = useMemo(
    () => (selectedDate ? slotsForDate(selectedDate).map((s) => s.start.toISOString()) : []),
    [selectedDate],
  );

  const selectedSorted = useMemo(
    () => [...selected].sort((a, b) => new Date(a).getTime() - new Date(b).getTime()),
    [selected],
  );

  // Keep focus on panel change
  const panelMounted = useRef(false);
  useEffect(() => {
    if (!panelMounted.current) { panelMounted.current = true; return; }
    panelHeadingRef.current?.focus({ preventScroll: true });
  }, [panel]);

  function goPanel(p: Panel) {
    if (p === 1 && !selectedDate) { toast.error("Pick a play date first."); return; }
    if (p === 2 && !selectedDate) { toast.error("Pick a play date first."); return; }
    if (p === 2 && courtIds.length === 0) { toast.error("Choose at least one court first."); return; }
    if (p === 3 && selectedSorted.length === 0) { toast.error("Pick at least 1 time slot first."); return; }
    setPanel(p);
  }

  // Slot state for a given court+slot combination
  function slotStateForCourt(iso: string, courtId: string): CellState {
    if (!avail) return new Date(iso).getTime() <= Date.now() ? "past" : "open";
    const slot = slotByCourt.get(courtId)?.get(iso);
    if (!slot) return "closed";
    return cellState(slot, Date.now());
  }

  // Whether a slot is selected (selected = chosen on ALL courts, intersection)
  function isSlotSelected(iso: string): boolean {
    return selected.includes(iso);
  }

  // Toggle slot — must be open on every selected court
  function toggleSlot(startIso: string) {
    if (hold) return;
    if (!avail) { toast.error("Loading fresh slots — try again in a moment."); return; }
    if (courtIds.length === 0) { toast.error("No courts listed right now."); return; }
    const now = Date.now();
    if (selected.includes(startIso)) {
      setSelected(selected.filter((s) => s !== startIso));
      return;
    }
    for (const id of courtIds) {
      const slot = slotByCourt.get(id)?.get(startIso);
      const name = courts.find((c) => c.id === id)?.name ?? "Court";
      if (!slot || cellState(slot, now) !== "open") {
        const cs = slot ? cellState(slot, now) : "closed";
        const reason =
          cs === "booked" || cs === "held"
            ? "is already taken"
            : cs === "past"
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
      toast.error(`Max ${MAX_SLOTS_PER_BOOKING} court-hours per booking.`);
      return;
    }
    setSelected(next);
  }

  async function createHold() {
    if (selectedSorted.length === 0) { toast.error("Pick at least 1 hour first."); return; }
    if (courtIds.length === 0) { toast.error("No courts listed right now."); return; }
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
      toast.success("Slots held — add equipment or continue to details.");
      setPanel(3);
    } catch {
      toast.error("Could not hold those slots. Check your connection and retry.");
    } finally {
      setHolding(false);
    }
  }

  const handleHoldExpired = useCallback(() => {
    setHold(null);
    if (onHoldExpired) onHoldExpired();
    toast.error('Your hold expired — tap "Hold & Continue" again.', { duration: 8000 });
  }, [onHoldExpired]);

  function handleContinueCta() {
    if (hold && onHoldSuccess && selectedDate) {
      onHoldSuccess(hold, courtIds, selectedSorted, selectedDate, paddleQty, ball);
      return;
    }
    void createHold();
  }

  // Calendar model
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
      setPanel(1);
      return;
    }
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
    setAvail(null);
    setView(partsOf(dateStr));
    setPanel(1); // go to court selection after date pick
  }

  // Shift selected date by +/- days (for the date nav in the time grid panel)
  function shiftDate(dir: 1 | -1) {
    if (!selectedDate) return;
    const next = addDaysManilaStr(selectedDate, dir);
    if (next < todayStr || next > maxStr) return;
    pickDate(next);
  }

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

  type DayKind = "past" | "today" | "open" | "selected" | "beyond";
  function dayKind(dateStr: string): DayKind {
    if (dateStr < todayStr) return "past";
    if (dateStr > maxStr) return "beyond";
    if (dateStr === selectedDate) return "selected";
    if (dateStr === todayStr) return "today";
    return "open";
  }

  const dateLabel = (() => {
    if (!selectedDate) return "Pick a date";
    const long = formatManilaLong(selectedDate);
    if (selectedDate === todayStr) return `Today · ${long}`;
    if (selectedDate === tomorrowStr) return `Tomorrow · ${long}`;
    return long;
  })();

  const ctaDisabled = selectedSorted.length === 0 || holding || !!hold || courtIds.length === 0;

  // ── Panel 2: Time Grid ─────────────────────────────────────────────
  // Renders a scrollable table: rows = time slots, columns = each selected court
  // Each cell shows the availability state for that (court, slot) pair.

  function TimeGridCell({
    iso,
    courtId,
  }: {
    iso: string;
    courtId: string;
  }) {
    const cs = slotStateForCourt(iso, courtId);
    const isSel = isSlotSelected(iso);
    const isOpen = cs === "open";

    // When loading, show subtle placeholder
    if (loadingAvail && !avail) {
      return (
        <div className="flex items-center justify-center">
          <div className="size-8 rounded-full border-2 border-line-warm/30 bg-surface-dim/20 animate-pulse" />
        </div>
      );
    }

    if (cs === "past" || cs === "closed") {
      return (
        <div className="flex items-center justify-center" aria-label="Unavailable">
          <div className="size-8 rounded-full border-2 border-line-warm/20 bg-surface-dim/10 flex items-center justify-center">
            <X className="size-3.5 text-warm-muted/40" strokeWidth={2.5} />
          </div>
        </div>
      );
    }

    if (cs === "booked" || cs === "held") {
      return (
        <div className="flex items-center justify-center" aria-label="Booked">
          <div className="size-8 rounded-full border-2 border-line-warm/30 bg-surface-dim/20 flex items-center justify-center">
            <X className="size-3.5 text-warm-muted/50" strokeWidth={2.5} />
          </div>
        </div>
      );
    }

    // Open or selected
    return (
      <button
        type="button"
        disabled={!!hold || holding}
        onClick={() => toggleSlot(iso)}
        aria-pressed={isSel}
        aria-label={`${formatSlotRange(iso)} — ${isSel ? "Selected" : "Available"}`}
        className={cn(
          "flex items-center justify-center mx-auto rounded-full border-2 size-8 transition-all",
          isSel
            ? "border-flame bg-flame text-white shadow-sm scale-110"
            : "border-flame/40 bg-flame/5 hover:bg-flame/15 hover:border-flame/70",
          (!!hold || holding) && "cursor-not-allowed opacity-60",
        )}
      >
        {isSel && <Check className="size-3.5" strokeWidth={3} />}
      </button>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  // Panel 2 (time grid) is fullscreen — rendered separately from the card wrapper
  if (panel === 2) {
    return (
      <div className="flex flex-col">
        {/* Sticky top bar */}
        <div className="sticky top-0 z-20 bg-cream border-b border-line-warm/60 shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setPanel(1)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-xl border border-line-warm/60 bg-white px-3 text-sm font-bold text-pine transition-all hover:bg-oat"
            >
              <ArrowLeft className="size-4" aria-hidden /> Courts
            </button>

            {/* Date navigator */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => shiftDate(-1)}
                disabled={!selectedDate || selectedDate <= todayStr}
                aria-label="Previous day"
                className="grid size-9 place-items-center rounded-lg border border-line-warm/60 text-warm-muted transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setPanel(0)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line-warm/60 bg-white px-3 py-1.5 text-xs font-bold text-ink hover:bg-oat transition-colors"
              >
                <span>{dateLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => shiftDate(1)}
                disabled={!selectedDate || selectedDate >= maxStr}
                aria-label="Next day"
                className="grid size-9 place-items-center rounded-lg border border-line-warm/60 text-ink transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>

            {/* Selection count + CTA */}
            <button
              type="button"
              onClick={handleContinueCta}
              disabled={ctaDisabled}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-flame px-4 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
            >
              {holding ? (
                <LoadingAnimation size="compact" label="Holding slots" />
              ) : (
                <>
                  <span className="hidden sm:inline">Hold</span>
                  {selectedSorted.length > 0 && (
                    <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[11px] font-extrabold">
                      {selectedSorted.length}h
                    </span>
                  )}
                  <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </button>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-4 pb-2.5 text-[11px] font-semibold text-warm-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-3.5 rounded-full border-2 border-flame bg-flame inline-block" />
              Selected
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3.5 rounded-full border-2 border-flame/40 bg-flame/5 inline-block" />
              Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3.5 rounded-full border-2 border-line-warm/30 bg-surface-dim/20 inline-block" />
              Unavailable
            </span>
          </div>
        </div>

        {/* Scrollable grid */}
        <div className="overflow-x-auto overflow-y-auto flex-1" style={{ maxHeight: "calc(100vh - 220px)", minHeight: 400 }}>
          {loadingAvail && !avail ? (
            <div className="flex min-h-64 items-center justify-center py-16">
              <LoadingAnimation label="Loading court availability" />
            </div>
          ) : availFailed ? (
            <div className="p-6 text-center">
              <p className="text-sm text-warm-muted">Could not load availability for this date.</p>
              <button
                type="button"
                onClick={() => setRetryKey((k) => k + 1)}
                className="mt-3 inline-flex min-h-[44px] items-center font-bold text-flame hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <table className="w-full min-w-[320px] border-collapse text-sm">
              <thead>
                <tr className="sticky top-0 z-10 bg-cream border-b border-line-warm/60">
                  {/* TIME column header */}
                  <th
                    scope="col"
                    className="w-28 min-w-[96px] py-3 pl-4 pr-2 text-left text-[11px] font-extrabold uppercase tracking-wider text-warm-muted"
                  >
                    TIME
                  </th>
                  {/* Court column headers */}
                  {courts
                    .filter((c) => courtIds.includes(c.id))
                    .map((court) => (
                      <th
                        key={court.id}
                        scope="col"
                        className="py-3 px-2 text-center text-xs font-extrabold text-ink"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <div className="size-8 rounded-lg overflow-hidden border border-line-warm/60 bg-oat">
                            <LandingImage
                              src={`/images/court-${(courts.findIndex((c) => c.id === court.id) % 2) + 1}.jpg`}
                              alt={court.name}
                              label={`${court.name} photo`}
                              className="w-full h-full"
                              imgClassName="object-cover"
                            />
                          </div>
                          <span className="leading-tight max-w-[72px] truncate">{court.name}</span>
                        </div>
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {gridSlots.map((iso, idx) => {
                  const isEvening = timeBandFor(new Date(iso)) === "evening";
                  const showBand =
                    idx === 0 ||
                    (isEvening &&
                      timeBandFor(new Date(gridSlots[idx - 1] as string)) !== "evening");
                  const isSel = isSlotSelected(iso);
                  const allClosed = courtIds.every((id) => {
                    const cs = slotStateForCourt(iso, id);
                    return cs === "past" || cs === "closed" || cs === "booked" || cs === "held";
                  });

                  return (
                    <Fragment key={iso}>
                      {showBand && (
                        <tr className="bg-oat/60">
                          <td
                            colSpan={courtIds.length + 1}
                            className="px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-warm-muted"
                          >
                            {isEvening ? "Evening · ₱200/hr" : "Morning · ₱150/hr"}
                          </td>
                        </tr>
                      )}
                      <tr
                        className={cn(
                          "border-b border-line-warm/30 transition-colors",
                          isSel ? "bg-flame/5" : allClosed ? "opacity-60" : "hover:bg-oat/40",
                        )}
                      >
                        {/* Time label */}
                        <td className="py-2.5 pl-4 pr-2 text-left">
                          <span
                            className={cn(
                              "text-xs font-semibold leading-snug",
                              isSel ? "text-flame font-bold" : "text-ink",
                            )}
                          >
                            {formatSlotRange(iso).split("–").join("→")}
                          </span>
                        </td>
                        {/* Court cells */}
                        {courts
                          .filter((c) => courtIds.includes(c.id))
                          .map((court) => (
                            <td key={court.id} className="py-2 px-2 text-center">
                              <TimeGridCell iso={iso} courtId={court.id} />
                            </td>
                          ))}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Bottom bar: selection summary + CTA */}
        <div className="sticky bottom-0 z-20 border-t border-line-warm/60 bg-white/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-sm">
            {selectedSorted.length === 0 ? (
              <span className="text-warm-muted">Tap a slot to select it</span>
            ) : (
              <span className="font-bold text-ink">
                <span className="text-flame">{selectedSorted.length}</span> hour{selectedSorted.length !== 1 ? "s" : ""} selected
                {courtIds.length > 1 && (
                  <span className="ml-1 text-warm-muted font-normal">× {courtIds.length} courts</span>
                )}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleContinueCta}
            disabled={ctaDisabled}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-flame px-6 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
          >
            {holding ? (
              <><LoadingAnimation size="compact" label="Holding slots" /> Holding…</>
            ) : hold ? (
              <>Continue to Equipment <ArrowRight className="size-4" /></>
            ) : (
              <>Hold &amp; Continue <ArrowRight className="size-4" /></>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Panels 0, 1, 3 (card layout) ──────────────────────────────────
  return (
    <div className="bg-cream border border-line-warm/60 rounded-2xl p-5 sm:p-7 shadow-sm">
      {/* Stepper header */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h1
            className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl"
          >
            {panel === 0
              ? "Pick a date"
              : panel === 1
                ? "Choose your courts"
                : "Optional equipment"}
          </h1>
          {/* Step dots */}
          <nav aria-label="Booking steps" className="flex shrink-0 items-center gap-1.5">
            {([0, 1, 2, 3] as const).map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => goPanel(i)}
                aria-current={panel === i ? "step" : undefined}
                aria-label={
                  i === 0 ? "Step 1: pick a date" :
                  i === 1 ? "Step 2: choose courts" :
                  i === 2 ? "Step 3: pick times" :
                  "Step 4: equipment"
                }
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
                <span className="hidden sm:inline">
                  {i === 0 ? "Date" : i === 1 ? "Courts" : i === 2 ? "Time" : "Gear"}
                </span>
              </button>
            ))}
          </nav>
        </div>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-oat"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={4}
          aria-valuenow={panel + 1}
          aria-label="Booking progress"
        >
          <div
            className={cn(
              "h-full rounded-full bg-flame transition-all",
              panel === 0 ? "w-1/4" : panel === 1 ? "w-2/4" : "w-full",
            )}
          />
        </div>
        <p className="mt-2 text-xs text-warm-muted sm:text-sm">
          {panel === 0
            ? "Select an available date to begin booking."
            : panel === 1
              ? "Select every court you need — only slots open on all courts will appear."
              : "Optional: add paddles or a ball set to your booking."}
        </p>
      </div>

      {/* Panels */}
      <div className="min-h-[420px] sm:min-h-[500px]">

        {/* ── Panel 0: Date Picker ── */}
        {panel === 0 && (
          <div className="animate-rise motion-reduce:animate-none">
            <div className="rounded-xl border border-line-warm/50 bg-white p-4 shadow-inner sm:p-5">
              {/* Month nav */}
              <div className="mb-3 flex items-center justify-between border-b border-line-warm/40 pb-4">
                <h2
                  ref={panelHeadingRef}
                  tabIndex={-1}
                  className="text-base font-bold text-ink outline-none"
                >
                  {monthLabel}
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={prevDisabled}
                    onClick={() => shiftView(-1)}
                    aria-label="Previous month"
                    className="grid size-11 place-items-center rounded-lg border border-line-warm/60 text-warm-muted transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="size-[18px]" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={nextDisabled}
                    onClick={() => shiftView(1)}
                    aria-label="Next month"
                    className="grid size-11 place-items-center rounded-lg border border-line-warm/60 text-ink transition-colors hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="size-[18px]" aria-hidden />
                  </button>
                </div>
              </div>

              {/* Day-of-week headers */}
              <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-bold tracking-wide text-warm-muted uppercase sm:text-[11px]">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>

              {/* Day cells */}
              <div role="grid" aria-label={`Choose a play date — ${monthLabel}`} className="grid grid-cols-7 gap-1 sm:gap-2">
                {weekRows.map((row, ri) => (
                  <div key={`row-${ri}`} role="row" className="contents">
                    {row.map((cell) => {
                      if (!cell.dateStr) {
                        return <div key={cell.key} role="gridcell" aria-disabled="true" className="h-11 sm:h-16" />;
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
                            className="flex h-11 cursor-not-allowed flex-col justify-between rounded-lg border border-line-warm/20 bg-surface-dim/20 p-1 text-xs text-warm-muted/50 sm:h-16 sm:rounded-xl sm:p-1.5"
                          >
                            <span className="font-medium">{dayNum}</span>
                          </div>
                        );
                      }

                      const isSel = kind === "selected";
                      const isToday = kind === "today";

                      return (
                        <div key={cell.key} role="gridcell" aria-selected={isSel}>
                          <button
                            type="button"
                            onClick={() => pickDate(dateStr)}
                            aria-pressed={isSel}
                            aria-label={`${formatManilaLong(dateStr)}${isToday ? " — today" : ""}`}
                            className={cn(
                              "flex h-11 w-full flex-col justify-between rounded-lg border p-1 text-left transition-all sm:h-16 sm:rounded-xl sm:p-1.5",
                              isSel
                                ? "border-2 border-flame bg-pine text-white shadow-md"
                                : isToday
                                  ? "border-flame/40 bg-flame-light/30 text-ink hover:bg-flame-light/50"
                                  : "border-line-warm/70 bg-white text-ink hover:bg-oat",
                            )}
                          >
                            <span
                              className={cn(
                                "text-sm font-bold sm:text-base",
                                isSel ? "text-white font-extrabold" : isToday ? "text-flame font-extrabold" : "text-ink",
                              )}
                            >
                              {dayNum}
                            </span>
                            <span
                              className={cn(
                                "block text-[9px] font-bold uppercase tracking-wide leading-tight",
                                isSel ? "text-flame" : isToday ? "text-flame" : "text-warm-muted/70 font-semibold",
                              )}
                            >
                              {isSel ? "Selected" : isToday ? "Today" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekdayManila(dateStr)]}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line-warm/40 pt-3 text-[11px] text-warm-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded border border-flame bg-pine" aria-hidden />
                  Selected
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-warm-muted/40" aria-hidden />
                  Unavailable
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Panel 1: Court Selection ── */}
        {panel === 1 && (
          <div className="animate-rise motion-reduce:animate-none">
            <h2
              ref={panelHeadingRef}
              tabIndex={-1}
              className="mb-1 text-base font-extrabold tracking-tight text-ink outline-none sm:text-lg"
            >
              {courts.length === 1 ? "Your court" : "Choose your courts"}
            </h2>
            {selectedDate && (
              <p className="mb-4 text-xs font-semibold text-warm-muted">
                {dateLabel} · Tap a court to select it.
              </p>
            )}
            {courts.length === 0 ? (
              <p className="mt-5 rounded-xl border border-line-warm/60 bg-white p-4 text-sm text-warm-muted">
                No courts listed right now — check back soon.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {courts.map((court, index) => {
                  const isSelected = courtIds.includes(court.id);
                  return (
                    <button
                      key={court.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (hold) return;
                        setCourtIds((current) =>
                          current.includes(court.id)
                            ? current.filter((id) => id !== court.id)
                            : [...current, court.id],
                        );
                        setSelected([]);
                        setAvail(null);
                      }}
                      className={cn(
                        "overflow-hidden rounded-2xl border-2 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5",
                        isSelected
                          ? "border-flame ring-2 ring-flame/20"
                          : "border-line-warm/60 hover:border-flame/50",
                      )}
                    >
                      <LandingImage
                        src={`/images/court-${(index % 2) + 1}.jpg`}
                        alt={`${court.name} court`}
                        label={`${court.name} photo`}
                        className="aspect-[16/8]"
                        imgClassName="object-cover"
                      />
                      <span className="flex items-center justify-between gap-3 p-4">
                        <span>
                          <span className="block text-base font-extrabold text-ink">{court.name}</span>
                          <span className="mt-0.5 block text-xs font-semibold text-warm-muted">
                            {peso(rates.morning)}/hr day · {peso(rates.evening)}/hr evening
                          </span>
                        </span>
                        <span
                          className={cn(
                            "grid size-7 shrink-0 place-items-center rounded-full border",
                            isSelected ? "border-flame bg-flame text-white" : "border-line-warm text-transparent",
                          )}
                        >
                          {isSelected && <Check className="size-4" />}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Panel 3: Equipment ── */}
        {panel === 3 && (
          <div className="animate-rise motion-reduce:animate-none">
            <h2
              ref={panelHeadingRef}
              tabIndex={-1}
              className="text-base font-extrabold tracking-tight text-ink outline-none sm:text-lg"
            >
              Equipment Rentals <span className="text-sm font-semibold text-warm-muted">(Optional)</span>
            </h2>
            <p className="mt-1 text-sm text-warm-muted">
              Add paddles or a ball set — the summary updates instantly.
            </p>
            <div className="mt-5 space-y-4">
              {/* Paddle Rentals */}
              <div className="rounded-2xl border border-line-warm/60 bg-cream/40 p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-line-warm/60 bg-gradient-to-br from-oat via-cream to-flame-light sm:size-20">
                      <Image
                        src="/images/paddle.jpg"
                        alt="Paddle rental"
                        width={96}
                        height={96}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <span className="block text-sm font-bold text-ink">Paddle Rentals</span>
                      <span className="block text-xs text-warm-muted">
                        {peso(rates.paddle)} per paddle per hour · High-grade carbon fiber paddles
                      </span>
                      {paddleQty > 0 && selectedSorted.length > 0 && (
                        <span className="mt-1 block text-xs font-bold text-flame">
                          = {peso(paddleQty * selectedSorted.length * rates.paddle)} total
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPaddleQty((q) => Math.max(0, q - 1))}
                      disabled={paddleQty <= 0}
                      className="flex size-10 items-center justify-center rounded-xl border border-line-warm bg-white text-base font-bold text-ink transition-all hover:bg-cream disabled:opacity-40"
                      aria-label="Decrease paddles"
                    >
                      −
                    </button>
                    <span className="min-w-8 text-center text-base font-extrabold text-ink">{paddleQty}</span>
                    <button
                      type="button"
                      onClick={() => setPaddleQty((q) => Math.min(50, q + 1))}
                      disabled={paddleQty >= 50}
                      className="flex size-10 items-center justify-center rounded-xl border border-line-warm bg-white text-base font-bold text-ink transition-all hover:bg-cream disabled:opacity-40"
                      aria-label="Increase paddles"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Ball set toggle */}
              <label
                htmlFor="ball-toggle"
                className={cn(
                  "flex cursor-pointer items-center gap-3.5 rounded-2xl border p-4 sm:p-5 transition-all select-none",
                  ball ? "border-flame bg-flame-light/30 shadow-xs" : "border-line-warm/60 bg-cream/40 hover:bg-cream/70",
                )}
              >
                <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-line-warm/60 bg-gradient-to-br from-oat via-cream to-flame-light sm:size-20">
                  <Image
                    src="/images/Pickleball.jpg"
                    alt="Ball set"
                    width={96}
                    height={96}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-ink">Add Pickleball Ball Set</span>
                    <span className="rounded-full bg-flame/10 px-2.5 py-0.5 text-xs font-extrabold text-flame">
                      +{peso(rates.ball)} flat
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-warm-muted">
                    One-time fee per booking. Official tournament-grade outdoor pickleball balls.
                  </p>
                </div>
                <input
                  id="ball-toggle"
                  type="checkbox"
                  checked={ball}
                  onChange={(e) => setBall(e.target.checked)}
                  className="ml-auto size-5 shrink-0 self-center rounded-md border-line-warm accent-flame"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="mt-6 flex items-center justify-between gap-3 border-t border-line-warm/40 pt-4">
        {panel > 0 ? (
          <button
            type="button"
            onClick={() => setPanel((panel - 1) as Panel)}
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

        {panel === 0 && (
          <button
            type="button"
            onClick={() => {
              if (!selectedDate) { toast.error("Pick a date first."); return; }
              goPanel(1);
            }}
            disabled={!selectedDate}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-flame px-5 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
          >
            Choose courts <ArrowRight className="size-4" aria-hidden />
          </button>
        )}

        {panel === 1 && (
          <button
            type="button"
            onClick={() => goPanel(2)}
            disabled={courtIds.length === 0}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-flame px-5 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
          >
            Pick times <ArrowRight className="size-4" aria-hidden />
          </button>
        )}

        {panel === 3 && (
          <button
            type="button"
            onClick={() => {
              if (!hold || !selectedDate) return;
              onHoldSuccess?.(hold, courtIds, selectedSorted, selectedDate, paddleQty, ball);
            }}
            disabled={!hold || !selectedDate}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-flame px-5 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
          >
            Continue to Details <ArrowRight className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
