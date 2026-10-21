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
import { clearDraft } from "@/lib/booking/draft";
import { slotsForDate, isOvernightSlot } from "@/lib/booking/slots";
import {
  daysInManilaMonth,
  firstWeekdayManila,
  formatManilaLong,
  formatSlotRange,
  slotDateShort,  manilaTodayStr,
  manilaEarliestBookableStr,
  maxBookableDateStr,
  monthLabelManila,
  weekdayManila,
  type CourtOption,
  type CourtSlotGroup,
} from "@/lib/courts";
import { calculatePaddleRentalTotal, courtRateForSlot, courtRateLabel, FALLBACK_RATES, peso, type DisplayRates } from "@/lib/pricing-display";
import Image from "next/image";
import LandingImage from "@/components/landing/landing-image";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

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

/** dateStr → courtId → slots, as returned for one month. */
type MonthDays = Record<string, Record<string, AvailabilitySlot[]>>;

export interface HoldState {
  tokens: string[];
  deadlineMs: number;
  expiresAt: string;
  /** Inputs the hold was created for — used to detect stale holds. */
  courtIds: string[];
  slotStarts: string[];
  /**
   * Browser-session capability that owns these rows. Lets the customer (and
   * only the customer) restore this exact hold after a refresh — see
   * POST /api/holds/reclaim. Absent on holds created before it existed.
   */
  ownerToken?: string;
}

type CellState = "open" | "held" | "booked" | "closed" | "past";

function cellState(slot: AvailabilitySlot): CellState {
  if (slot.state === "held") return "held";
  if (slot.state === "pending" || slot.state === "approved") return "booked";
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

/** "YYYY-MM" shifted by N months. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = (y as number) * 12 + ((m as number) - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`;
}

export interface Step1DateTimeProps {
  initialCourts: CourtOption[];
  initialRates?: DisplayRates;
  initialSelectedDate?: string | null;
  /**
   * Courts the restored `initialSelectedSlots` were picked on. Used ONLY to
   * rebuild those picks — never to choose which columns the grid shows, which
   * is always the full catalog. Treating it as a column list is what made a
   * refresh after picking one court render a single-column grid.
   */
  initialCourtIds?: string[];
  initialSelectedSlots?: string[];
  initialPaddleQty?: number;
  initialBall?: boolean;
  /** Fires when the customer finishes step 1 — no hold is created here; slots
   * are only reserved later, from the review step's "Continue to Payment". */
  onContinue?: (
    courtIds: string[],
    slotStarts: string[],
    date: string,
    paddleQty: number,
    ball: boolean,
    slotGroups: CourtSlotGroup[],
  ) => void;
  onCancel?: () => void;
  /**
   * Fires when the picks themselves are dropped — a date change, Back out of
   * the grid, Clear, or Cancel. The wizard keeps its own copy of the slots for
   * the summary, so it has to forget them in the same breath or it goes on
   * advertising times the grid no longer has selected.
   */
  onClearSelection?: (opts?: { keepDate?: boolean }) => void;
  /** Fires on every change so the parent can keep its summary data live */
  onLiveUpdate?: (update: {
    courtIds: string[];
    selectedDate: string | null;
    selectedSlots: string[];
    paddleQty: number;
    ball: boolean;
    slotGroups: CourtSlotGroup[];
  }) => void;
}

// Panel order: 0=Date, 1=TimeGrid, 2=Equipment
type Panel = 0 | 1 | 2;

export default function Step1DateTime({
  initialCourts,
  initialRates = FALLBACK_RATES,
  initialSelectedDate = null,
  initialCourtIds,
  initialSelectedSlots,
  initialPaddleQty = 0,
  initialBall = false,
  onContinue,
  onCancel,
  onClearSelection,
  onLiveUpdate,
}: Step1DateTimeProps) {
  const todayStr = useMemo(() => manilaTodayStr(), []);
  // Floor of the calendar. Same-day booking is allowed, so this is *today* —
  // past hours are filtered per slot by the availability payload, never by
  // disabling the whole day.
  const earliestStr = useMemo(() => manilaEarliestBookableStr(), []);
  const maxStr = useMemo(() => maxBookableDateStr(), []);

  // Courts/rates come from the parent (booking-flow already fetches /api/courts + /api/pricing)
  const courts = initialCourts;
  // Every active court is a column, always. The grid used to take its column
  // list from a restored draft (which holds the courts the customer *picked*),
  // so a reload after picking one court re-drew the table with just that
  // column and the others silently vanished. Visibility is not a preference
  // here — it is the catalog.
  const courtIds = useMemo(() => courts.map((c) => c.id), [courts]);
  const rates = initialRates;
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelectedDate ?? null);
  const [view, setView] = useState(() => partsOf(initialSelectedDate ?? todayStr));
  // Month cache: "courtIdsKey|YYYY-MM" → dateStr → per-court slot lists.
  // One fetch fills a whole month, so switching days within it costs nothing.
  const [monthCache, setMonthCache] = useState<Map<string, MonthDays>>(() => new Map());
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [availFailed, setAvailFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  // selected: Set of "courtId|slotIso" pairs — each cell is independent.
  // A restored draft is trusted only for ISOs that are actually on the grid of
  // its own selected date: a draft written by an older client (or for another
  // date) could otherwise POST an instant no visible cell represents, and the
  // server would answer OFF_GRID with no way for the user to see why.
  const [selected, setSelected] = useState<string[]>(() => {
    const restored = initialSelectedSlots ?? [];
    const grid = new Set(
      initialSelectedDate
        ? slotsForDate(initialSelectedDate).map((s) => s.start.toISOString())
        : [],
    );
    const courtIds =
      initialCourtIds && initialCourtIds.length > 0
        ? initialCourtIds
        : initialCourts.map((c) => c.id);
    return restored
      .filter((iso) => grid.has(new Date(iso).toISOString()) || grid.size === 0)
      .flatMap((iso) => courtIds.map((cId) => `${cId}|${new Date(iso).toISOString()}`));
  });
  // Holds are never created in step 1 — the customer's picks are just local
  // selection state here. Slots are reserved later, from the review step.
  const [paddleQty, setPaddleQty] = useState<number>(initialPaddleQty);
  const [ball, setBall] = useState<boolean>(initialBall);

  // Panel: 0=Date, 1=TimeGrid, 2=Equipment
  const [panel, setPanel] = useState<Panel>(() => {
    if (initialSelectedDate) return 1;
    return 0;
  });
  const [previewCourtId, setPreviewCourtId] = useState<string | null>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // Unique slot ISOs across all selected (court, slot) pairs
  const selectedSlotIsos = useMemo(() => {
    const isos = new Set(selected.map((pair) => pair.split("|")[1] as string));
    return [...isos].sort();
  }, [selected]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Distinct courts actually booked — the summary counts these, not the whole
  // grid's column set (`courtIds`), which always holds every court.
  const selectedCourtIds = useMemo(() => {
    const ids = new Set(selected.map((pair) => pair.split("|")[0] as string));
    return [...ids];
  }, [selected]);

  // Which hours belong to which court — step 1 is the only place that knows,
  // so the summary can't infer it from the flat `slotStarts` alone.
  const slotGroups = useMemo<CourtSlotGroup[]>(() => {
    const byCourt = new Map<string, string[]>();
    for (const pair of selected) {
      const [courtId, iso] = pair.split("|") as [string, string];
      const existing = byCourt.get(courtId);
      if (existing) existing.push(iso);
      else byCourt.set(courtId, [iso]);
    }
    return [...byCourt].map(([courtId, isos]) => ({
      courtId,
      courtName: courts.find((c) => c.id === courtId)?.name ?? "Court",
      slotStarts: isos.sort(),
    }));
  }, [selected, courts]);

  // Notify parent of live state changes — passes unique slot ISOs for summary
  useEffect(() => {
    onLiveUpdate?.({ courtIds: selectedCourtIds, selectedDate, selectedSlots: selectedSlotIsos, paddleQty, ball, slotGroups });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourtIds, selectedDate, selectedSlotIsos, paddleQty, ball, slotGroups]);

  const courtsKey = useMemo(() => [...courtIds].sort().join(","), [courtIds]);

  const selectedMonth = selectedDate ? selectedDate.slice(0, 7) : null;
  const cacheKey = selectedMonth ? `${courtsKey}|${selectedMonth}` : null;

  /** Fetch one month (courts × month) and store it. Resolves to its days. */
  const fetchMonth = useCallback(
    async (month: string, ids: string[], signal?: AbortSignal): Promise<MonthDays> => {
      const qs = new URLSearchParams({ month });
      for (const id of ids) qs.append("courtId", id);
      const r = await fetch(`/api/availability/month?${qs.toString()}`, {
        signal,
        cache: "no-store",
      });
      if (!r.ok) {
        let msg = "Could not load availability.";
        try {
          const b = (await r.json()) as { error?: { message?: string } };
          if (b.error?.message) msg = b.error.message;
        } catch {}
        throw new Error(msg);
      }
      const b = (await r.json()) as { days: MonthDays };
      return b.days;
    },
    [],
  );

  // Availability: one request per month. Switching days inside the month is a
  // pure cache read, so the day arrows cost zero requests.
  useEffect(() => {
    if (courtIds.length === 0 || !selectedMonth || !cacheKey) return;
    const ids = [...courtIds].sort();
    if (monthCache.has(cacheKey)) {
      // Already cached (or fresh from prefetch) — nothing to do.
      setAvailFailed(false);
      return;
    }
    const ctrl = new AbortController();
    setLoadingAvail(true);
    setAvailFailed(false);
    fetchMonth(selectedMonth, ids, ctrl.signal)
      .then((days) => {
        setMonthCache((prev) => new Map(prev).set(cacheKey, days));
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        toast.error(e instanceof Error ? e.message : "Could not load availability.");
        setAvailFailed(true);
      })
      .finally(() => setLoadingAvail(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, courtsKey, retryKey]);

  // Warm the neighbouring months once the current one lands, so crossing a
  // month boundary is instant. Failures are silent — the visible month wins.
  // Keyed on the current month being present, not on the whole cache, so a
  // prefetch completing can't re-trigger this.
  const currentCached = cacheKey !== null && monthCache.has(cacheKey);
  useEffect(() => {
    if (!selectedMonth || !currentCached) return;
    const ids = [...courtIds].sort();
    const minMonth = earliestStr.slice(0, 7);
    const maxMonth = maxStr.slice(0, 7);
    for (const adj of [shiftMonth(selectedMonth, 1), shiftMonth(selectedMonth, -1)]) {
      if (adj < minMonth || adj > maxMonth) continue;
      const adjKey = `${courtsKey}|${adj}`;
      void fetchMonth(adj, ids)
        .then((adjDays) =>
          setMonthCache((p) => (p.has(adjKey) ? p : new Map(p).set(adjKey, adjDays))),
        )
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, courtsKey, currentCached]);

  // Today's slice of the cache — the grid renders from this.
  const avail = useMemo<CourtAvailability[] | null>(() => {
    if (!cacheKey || !selectedDate) return null;
    const days = monthCache.get(cacheKey);
    const forDate = days?.[selectedDate];
    if (!forDate) return null;
    return Object.entries(forDate).map(([courtId, slots]) => ({ courtId, slots }));
  }, [monthCache, cacheKey, selectedDate]);

  // A cached month can go stale while the tab is hidden — drop it on refocus.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const prefix = `${courtsKey}|`;
      setMonthCache((prev) => {
        const next = new Map(prev);
        for (const k of next.keys()) if (k.startsWith(prefix)) next.delete(k);
        return next;
      });
      setRetryKey((k) => k + 1);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [courtsKey]);

  // Cell state per "courtId|slotIso" — computed once per availability payload
  const cellStates = useMemo(() => {
    const m = new Map<string, CellState>();
    for (const c of avail ?? []) {
      for (const s of c.slots) m.set(`${c.courtId}|${s.start}`, cellState(s));
    }
    return m;
  }, [avail]);

  const courtIndexById = useMemo(
    () => new Map(courts.map((c, i) => [c.id, i])),
    [courts],
  );

  const gridSlots = useMemo(
    () => (selectedDate ? slotsForDate(selectedDate).map((s) => s.start.toISOString()) : []),
    [selectedDate],
  );

  // Keep focus on panel change
  const panelMounted = useRef(false);
  useEffect(() => {
    if (!panelMounted.current) { panelMounted.current = true; return; }
    panelHeadingRef.current?.focus({ preventScroll: true });
  }, [panel]);

  function goPanel(p: Panel) {
    if (p === 1 && !selectedDate) { toast.error("Pick a play date first."); return; }
    if (p === 2 && selected.length === 0) { toast.error("Pick at least 1 time slot first."); return; }
    setPanel(p);
  }

  function panelSteps() {
    return (
      <nav aria-label="Booking steps" className="flex shrink-0 items-center gap-1.5">
        {([0, 1, 2] as const).map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => goPanel(i)}
            aria-current={panel === i ? "step" : undefined}
            aria-label={
              i === 0 ? "Step 1: pick a date" :
              i === 1 ? "Step 2: pick times" :
              "Step 3: equipment"
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
            <span className="hidden sm:inline">{i === 0 ? "Date" : i === 1 ? "Time" : "Gear"}</span>
          </button>
        ))}
      </nav>
    );
  }

  // Slot state for a given court+slot combination
  function slotStateForCourt(iso: string, courtId: string): CellState {
    if (!avail) {
      // While loading: past slots grey out, future ones show as open
      return new Date(iso).getTime() <= Date.now() ? "past" : "open";
    }
    return cellStates.get(`${courtId}|${iso}`) ?? "closed";
  }

  // Whether a specific (court, slot) cell is selected
  function isCellSelected(iso: string, courtId: string): boolean {
    return selectedSet.has(`${courtId}|${iso}`);
  }

  // Toggle a specific (court, slot) cell
  function toggleCell(iso: string, courtId: string) {
    if (!avail) { toast.error("Loading fresh slots — try again in a moment."); return; }
    const key = `${courtId}|${iso}`;
    if (selected.includes(key)) {
      setSelected(selected.filter((s) => s !== key));
      return;
    }
    // Check this specific cell is open
    const cs = slotStateForCourt(iso, courtId);
    if (cs !== "open") {
      const name = courts.find((c) => c.id === courtId)?.name ?? "Court";
      const reason =
        cs === "booked" || cs === "held"
          ? "is already taken"
          : cs === "past"
            ? "already started (future slots only)"
            : "is closed";
      toast.error(`${name} ${formatSlotRange(iso)} ${reason}.`);
      return;
    }
    const next = [...selected, key];
    if (next.length > MAX_SLOTS_PER_BOOKING) {
      toast.error(`Max ${MAX_SLOTS_PER_BOOKING} court-hours per booking.`);
      return;
    }
    setSelected(next);
  }

  // Calendar model
  // Calendar model
  const monthLabel = monthLabelManila(view.y, view.m);
  const leadBlanks = firstWeekdayManila(view.y, view.m);
  const daysInMonth = daysInManilaMonth(view.y, view.m);
  const viewKey = `${view.y}-${pad2(view.m + 1)}`;
  const maxKey = maxStr.slice(0, 7);
  const prevDisabled = viewKey <= earliestStr.slice(0, 7);
  const nextDisabled = viewKey >= maxKey;

  function shiftView(dir: 1 | -1) {
    const m = view.m + dir;
    setView({ y: view.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 });
  }

  /**
   * Move to another date with a clean slate. Picks are never carried across:
   * the same hour on another day is a different slot, and quietly keeping it
   * booked people into a time they had not looked at.
   */
  function applyDateChange(dateStr: string, stayOnTimeGrid: boolean) {
    const hadPicks = selected.length > 0;
    setSelected([]);
    setSelectedDate(dateStr);
    setView(partsOf(dateStr));
    if (!stayOnTimeGrid) setPanel(1);
    if (hadPicks) {
      // The new day stays — only the old day's hours are gone.
      onClearSelection?.({ keepDate: true });
      toast(`Date changed — pick your times for ${formatManilaLong(dateStr)}.`);
    }
  }

  function pickDate(dateStr: string, stayOnTimeGrid = false) {
    if (dateStr < earliestStr || dateStr > maxStr) return;
    if (dateStr === selectedDate) {
      if (!stayOnTimeGrid) setPanel(1);
      return;
    }
    applyDateChange(dateStr, stayOnTimeGrid);
  }

  /** End the attempt when the customer cancels. */
  function resetAll(next?: () => void) {
    setSelected([]);
    setSelectedDate(null);
    setPaddleQty(0);
    setBall(false);
    onClearSelection?.();
    next?.();
  }

  /**
   * Drop only the picked slots, keeping the date and equipment. Used when the
   * date changes: the picks belonged to the old day, the rest still applies.
   */
  function clearSelection(next?: () => void) {
    if (selected.length === 0) {
      next?.();
      return;
    }
    setSelected([]);
    onClearSelection?.();
    next?.();
  }

  function handleCancel() {
    // Cancel always ends the attempt cleanly: everything is dropped (so the
    // summary and the saved draft don't bring it back) and the tab's draft
    // cleared before we leave. No hold exists in step 1 by definition.
    resetAll(() => {
      clearDraft();
      if (onCancel) { onCancel(); return; }
      window.location.href = "/";
    });
  }

  /** Return to the date panel. */
  function backToDates() {
    setPanel(0);
  }

  function backPanel() {
    setPanel((panel - 1) as Panel);
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

  // No "selected" kind: the calendar no longer marks the chosen day, so
  // yesterday's pick can't read as a live selection while you browse.
  // Today is NOT a special kind any more — same-day booking is allowed, so it
  // goes through the same open path as any other future day. Hours that have
  // already started render as unavailable in the time grid instead.
  type DayKind = "past" | "open" | "beyond";
  function dayKind(dateStr: string): DayKind {
    if (dateStr > maxStr) return "beyond";
    if (dateStr < earliestStr) return "past";
    return "open";
  }

  const ctaDisabled = selected.length === 0 || courtIds.length === 0;

  // ── Panel 2: Time Grid ─────────────────────────────────────────────
  // Renders a scrollable table: rows = time slots, columns = each selected court
  // Each cell shows the availability state for that (court, slot) pair.

  // ── Render ─────────────────────────────────────────────────────────

  // Panel 1 (time grid) is fullscreen — rendered separately from the card wrapper
  if (panel === 1) {
    const previewCourt = previewCourtId ? courts.find((c) => c.id === previewCourtId) ?? null : null;
    const previewIndex = previewCourt ? (courtIndexById.get(previewCourt.id) ?? 0) : 0;
    return (
      <div className="flex flex-col">
        <Dialog open={previewCourt !== null} onOpenChange={(open) => { if (!open) setPreviewCourtId(null); }}>
          {previewCourt && (
            <DialogContent className="max-w-lg overflow-hidden p-0">
              <div className="relative">
                <LandingImage
                  src={`/images/court-${(previewIndex % 2) + 1}.jpg`}
                  alt={`${previewCourt.name} court`}
                  label={`${previewCourt.name} photo`}
                  className="aspect-[16/10]"
                  imgClassName="object-cover"
                />
                <span className="absolute top-3 left-3 inline-flex items-center rounded-full bg-pine px-3 py-1 text-[11px] font-bold text-white shadow">
                  Covered
                </span>
                <span className="absolute right-3 bottom-3 inline-flex items-center rounded-full bg-flame px-3 py-1 text-[11px] font-bold whitespace-nowrap text-white shadow">
                  Starts from {peso(Math.min(...rates.courtRates.filter((r) => r.courtId === previewCourt.id).map((r) => r.amount), rates.morning))}/hr
                </span>
              </div>
              <div className="p-5">
                <DialogTitle className="text-lg font-extrabold text-ink">{previewCourt.name}</DialogTitle>
                <p className="mt-1 text-sm font-semibold text-warm-muted">
                  Rates follow this court&apos;s configured hours.
                </p>
              </div>
            </DialogContent>
          )}
        </Dialog>
        {/* Sticky top bar */}
        <div className="sticky top-0 z-20 bg-cream border-b border-line-warm/60 shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <button
              type="button"
              onClick={backToDates}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-xl border border-line-warm/60 bg-white px-3 text-sm font-bold text-pine transition-all hover:bg-oat"
            >
              <ArrowLeft className="size-4" aria-hidden /> Back
            </button>
            {panelSteps()}
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
          {availFailed ? (
            <div className="p-6 text-center">
              <p className="text-sm text-warm-muted">Could not load availability for this date.</p>
              <button
                type="button"
                onClick={() => {
                  // Drop the failed month so the effect refetches it.
                  setMonthCache((prev) => {
                    const next = new Map(prev);
                    if (cacheKey) next.delete(cacheKey);
                    return next;
                  });
                  setRetryKey((k) => k + 1);
                }}
                className="mt-3 inline-flex min-h-[44px] items-center font-bold text-flame hover:underline"
              >
                Retry
              </button>
            </div>
          ) : !avail ? (
            <div className="flex min-h-64 items-center justify-center py-16">
              <LoadingAnimation label="Loading court availability" />
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
                  {/* Court column headers — every active court, always. */}
                  {courts.map((court) => (
                      <th
                        key={court.id}
                        scope="col"
                        className="py-3 px-2 text-center text-xs font-extrabold text-ink"
                      >
                        <button
                          type="button"
                          onClick={() => setPreviewCourtId(court.id)}
                          aria-label={`Preview ${court.name}`}
                          className="mx-auto flex min-h-[44px] min-w-[44px] flex-col items-center gap-1 rounded-lg px-1 transition-colors hover:bg-oat/60 focus-visible:outline-2 focus-visible:outline-flame"
                        >
                          <div className="size-8 rounded-lg overflow-hidden border border-line-warm/60 bg-oat pointer-events-none">
                            <LandingImage
                              src={`/images/court-${((courtIndexById.get(court.id) ?? 0) % 2) + 1}.jpg`}
                              alt={court.name}
                              label={`${court.name} photo`}
                              className="w-full h-full"
                              imgClassName="object-cover"
                            />
                          </div>
                          <span className="leading-tight max-w-[72px] truncate underline decoration-dotted underline-offset-2">{court.name}</span>
                        </button>
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {gridSlots.map((iso, idx) => {
                  const overnight = isOvernightSlot(new Date(iso));
                  const rowHasSelection = courtIds.some((id) => isCellSelected(iso, id));
                  const allClosed = courtIds.every((id) => {
                    const cs = slotStateForCourt(iso, id);
                    return cs === "past" || cs === "closed" || cs === "booked" || cs === "held";
                  });

                  return (
                    <Fragment key={iso}>
                      <tr
                        className={cn(
                          "border-b border-line-warm/30 transition-colors",
                          rowHasSelection ? "bg-flame/5" : allClosed ? "opacity-60" : "hover:bg-oat/40",
                        )}
                      >
                        {/* Time label */}
                        <td className="py-2.5 pl-4 pr-2 text-left">
                          <span
                            className={cn(
                              "text-xs font-semibold leading-snug",
                              rowHasSelection ? "text-flame font-bold" : "text-ink",
                            )}
                          >
                            {formatSlotRange(iso).split("–").join("→")}
                            {overnight && (
                              <span className="ml-1 align-middle text-[9px] font-bold uppercase tracking-wide text-warm-muted/80">
                                ({slotDateShort(iso)})
                              </span>
                            )}
                          </span>
                        </td>
                        {/* Court cells */}
                        {courts.map((court) => {
                          const cs = slotStateForCourt(iso, court.id);
                            const isSel = isCellSelected(iso, court.id);
                          const configuredRate = courtRateForSlot(rates, court.id, new Date(iso));
                          const rateLabel = configuredRate
                            ? `${peso(configuredRate.amount)}/hr, ${courtRateLabel(configuredRate)}`
                            : "Rate unavailable";
                          return (
                              <td key={court.id} className="py-2 px-2 text-center">
                                {cs === "past" || cs === "closed" ? (
                                  <div className="flex items-center justify-center" aria-label="Unavailable">
                                    <div className="size-8 rounded-full border-2 border-line-warm/20 bg-surface-dim/10 flex items-center justify-center">
                                      <X className="size-3.5 text-warm-muted/40" strokeWidth={2.5} />
                                    </div>
                                  </div>
                                ) : cs === "booked" || cs === "held" ? (
                                  <div className="flex items-center justify-center" aria-label="Booked">
                                    <div className="size-8 rounded-full border-2 border-line-warm/30 bg-surface-dim/20 flex items-center justify-center">
                                      <X className="size-3.5 text-warm-muted/50" strokeWidth={2.5} />
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => toggleCell(iso, court.id)}
                                    aria-pressed={isSel}
                                    aria-label={`${formatSlotRange(iso)}${overnight ? ` (${slotDateShort(iso)} next day)` : ""} - ${rateLabel} - ${isSel ? "Selected" : "Available"}`}
                                    title={rateLabel}
                                    className={cn(
                                      "flex items-center justify-center mx-auto rounded-full border-2 size-8 transition-all",
                                      isSel
                                        ? "border-flame bg-flame text-white shadow-sm scale-110"
                                        : "border-flame/40 bg-flame/5 hover:bg-flame/15 hover:border-flame/70",
                                    )}
                                  >
                                    {isSel && <Check className="size-3.5" strokeWidth={3} />}
                                  </button>
                                )}
                              </td>
                            );
                          })}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Main panel actions flow naturally after the time grid. */}
        <div className="flex flex-col gap-2 border-t border-line-warm/60 bg-white/95 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            {selected.length === 0 ? (
              <span className="text-warm-muted">Tap a cell to select a slot</span>
            ) : (
              <span className="font-bold text-ink">
                <span className="text-flame">{selected.length}</span> court-hour{selected.length !== 1 ? "s" : ""} selected
              </span>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => clearSelection()}
                id="step1-clear"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-line-warm/70 bg-white px-3 text-sm font-bold text-warm-muted transition-all hover:bg-oat hover:text-ink sm:px-4"
              >
                <X className="size-4" aria-hidden />
                <span className="sm:hidden">Clear</span>
                <span className="hidden sm:inline">Clear slots</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => goPanel(2)}
              disabled={ctaDisabled}
              id="step1-advance"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-flame px-6 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
            >
              <><span className="sm:hidden">Gear</span><span className="hidden sm:inline">Continue to Equipment</span><ArrowRight className="size-4" /></>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Panels 0, 2 (card layout) ──────────────────────────────────
  return (
    <div className="bg-cream border border-line-warm/60 rounded-2xl p-5 sm:p-7 shadow-sm">
      {/* Stepper header */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h1
            className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl"
          >
            {panel === 2
              ? "Optional equipment"
              : panel === 0
                ? "Pick a date"
                : "Pick your times"}
          </h1>
          {/* Step dots */}
          {panelSteps()}
        </div>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-oat"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={panel + 1}
          aria-label="Booking progress"
        >
          <div
            className={cn(
              "h-full rounded-full bg-flame transition-all",
              panel === 0 ? "w-1/3" : panel === 2 ? "w-full" : "w-2/3",
            )}
          />
        </div>
        <p className="mt-2 text-xs text-warm-muted sm:text-sm">
          {panel === 2
            ? "Optional: add paddles or a ball set to your booking."
            : panel === 0
              ? "Select an available date to begin booking."
              : "Tap a cell to pick a time under the court you want."}
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

                      const isToday = dateStr === todayStr;
                      return (
                        <div key={cell.key} role="gridcell">
                          <button
                            type="button"
                            onClick={() => pickDate(dateStr)}
                            aria-label={isToday ? `${formatManilaLong(dateStr)} — today` : formatManilaLong(dateStr)}
                            className={cn(
                              "flex h-11 w-full flex-col justify-between rounded-lg border bg-white p-1 text-left text-ink transition-all hover:bg-oat sm:h-16 sm:rounded-xl sm:p-1.5",
                              isToday ? "border-flame/50 bg-flame-light/20" : "border-line-warm/70",
                            )}
                          >
                            <span className={cn("text-sm font-bold sm:text-base", isToday && "font-extrabold text-flame")}>
                              {dayNum}
                            </span>
                            <span className="block text-[9px] font-bold uppercase tracking-wide leading-tight text-warm-muted/70">
                              {isToday
                                ? "Today"
                                : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekdayManila(dateStr)]}
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
                  <span className="size-2 rounded-full bg-warm-muted/40" aria-hidden />
                  Unavailable
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Panel 2: Equipment ── */}
        {panel === 2 && (
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
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-line-warm/60 bg-gradient-to-br from-oat via-cream to-flame-light sm:size-20 sm:rounded-xl">
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
                      <span className="mt-1 inline-flex rounded-full bg-flame/10 px-2.5 py-0.5 text-xs font-extrabold text-flame">
                        {peso(rates.paddle)} / paddle / hour
                      </span>
                      <span className="mt-1 block text-[11px] text-warm-muted">
                        High-grade carbon fiber paddles
                      </span>
                      {paddleQty > 0 && selected.length > 0 && (
                        <span className="mt-1 block text-xs font-bold text-flame">
                          = {peso(calculatePaddleRentalTotal(rates.paddle, paddleQty, selected.length))} total
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <label htmlFor="paddle-quantity" className="text-xs font-semibold text-warm-muted">Quantity</label>
                    <button
                      type="button"
                      onClick={() => setPaddleQty((quantity) => Math.max(0, quantity - 1))}
                      disabled={paddleQty <= 0}
                      aria-label="Decrease paddle quantity"
                      className="grid size-11 place-items-center rounded-xl border border-line-warm bg-white text-lg font-bold text-ink disabled:opacity-40"
                    >
                      −
                    </button>
                    <input id="paddle-quantity" type="number" inputMode="numeric" min={0} max={50} step={1} value={paddleQty}
                      onChange={(event) => {
                        const value = event.currentTarget.valueAsNumber;
                        if (Number.isFinite(value)) setPaddleQty(Math.min(50, Math.max(0, Math.floor(value))));
                        else if (event.currentTarget.value === "") setPaddleQty(0);
                      }}
                      className="h-11 w-20 rounded-xl border border-line-warm bg-white px-2 text-center text-base font-bold text-ink" />
                    <button
                      type="button"
                      onClick={() => setPaddleQty((quantity) => Math.min(50, quantity + 1))}
                      disabled={paddleQty >= 50}
                      aria-label="Increase paddle quantity"
                      className="grid size-11 place-items-center rounded-xl border border-line-warm bg-white text-lg font-bold text-ink disabled:opacity-40"
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
                <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-line-warm/60 bg-gradient-to-br from-oat via-cream to-flame-light sm:size-20 sm:rounded-xl">
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
                    <span className="text-sm font-bold text-ink">Pickleball Balls</span>
                    <span className="shrink-0 rounded-full bg-flame/10 px-2.5 py-0.5 text-xs font-extrabold text-flame">
                      {peso(rates.ball)} / booking
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-warm-muted">
                    One-time rental fee per booking. Official tournament-grade outdoor pickleball balls.
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
            onClick={backPanel}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-line-warm/60 bg-white px-5 text-sm font-bold text-pine transition-all hover:bg-oat"
          >
            <ChevronLeft className="size-4" aria-hidden /> Back
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex min-h-[44px] items-center text-xs font-semibold text-warm-muted transition-colors hover:text-ink"
          >
            Cancel
          </button>
        )}

        {panel === 0 && (
          <button
            type="button"
            id="step1-advance"
            onClick={() => {
              if (!selectedDate) { toast.error("Pick a date first."); return; }
              goPanel(1);
            }}
            disabled={!selectedDate}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-flame px-5 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
          >
            Pick times <ArrowRight className="size-4" aria-hidden />
          </button>
        )}

        {panel === 2 && (
          <button
            type="button"
            id="step1-advance"
            onClick={() => {
              if (!selectedDate) return;
              onContinue?.(selectedCourtIds, selectedSlotIsos, selectedDate, paddleQty, ball, slotGroups);
            }}
            disabled={!selectedDate || selected.length === 0}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-flame px-5 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
          >
            Continue to Details <ArrowRight className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
