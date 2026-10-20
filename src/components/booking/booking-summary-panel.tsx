"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Dumbbell,
  MapPin,
  Receipt,
  ReceiptText,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { formatCourtSlotLine, formatManilaLong, formatSlotRanges, formatCountdown, formatCourtSlotGroups, type CourtSlotGroup } from "@/lib/courts";
import { calculatePaddleRentalTotal, courtRateForSlot, peso, type DisplayRates } from "@/lib/pricing-display";

export interface SummaryData {
  /** ISO date string "YYYY-MM-DD", or null if not yet picked */
  selectedDate: string | null;
  /** Sorted ISO timestamps of selected slot starts */
  selectedSlots: string[];
  /** Names of selected courts */
  courtNames: string[];
  /** Per-court slot attribution — drives per-court time lines when the booking
   *  moves between courts. Absent/empty falls back to the collapsed range. */
  slotGroups?: CourtSlotGroup[];
  /** Live display rates for estimate */
  rates: DisplayRates;
  /** Live paddle quantity — updates immediately from step 1 panel 4 */
  paddleQty: number;
  /** Live ball toggle — updates immediately from step 1 panel 4 */
  ball: boolean;
  /** Whether slots are currently held */
  isHeld: boolean;
  /** Hold expiry deadline (ms since epoch), or null when no hold is active */
  holdDeadlineMs: number | null;
  /**
   * Whether the summary should offer "Clear slots". True only while the time
   * grid step is open with picks to drop — the button just clicks step 1's own
   * clear control, so the hold-release confirmation stays in one place.
   */
  canClearSlots?: boolean;
}

// ---- hold countdown ---------------------------------------------------------
// Module-level store so the desktop panel and mobile sheet share one 500ms
// timer + value instead of running an interval each.

interface Countdown {
  remaining: number;
  urgent: boolean;
  label: string;
}

let currentDeadline: number | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
const countdownListeners = new Set<() => void>();
let countdownSnap: Countdown = { remaining: 0, urgent: false, label: "" };

function readCountdown(deadlineMs: number | null): Countdown {
  const remaining = deadlineMs === null ? 0 : Math.max(0, deadlineMs - Date.now());
  return {
    remaining,
    urgent: deadlineMs !== null && remaining < 120_000,
    label: deadlineMs !== null ? formatCountdown(remaining) : "",
  };
}

function emitCountdown() {
  for (const listener of countdownListeners) listener();
}

function setHoldDeadline(deadlineMs: number | null) {
  if (deadlineMs === currentDeadline) return;
  currentDeadline = deadlineMs;
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  countdownSnap = readCountdown(deadlineMs);
  if (deadlineMs !== null) {
    countdownTimer = setInterval(() => {
      const next = readCountdown(currentDeadline);
      if (next.remaining === countdownSnap.remaining) return;
      countdownSnap = next;
      emitCountdown();
    }, 500);
  }
  emitCountdown();
}

function subscribeHoldCountdown(listener: () => void) {
  countdownListeners.add(listener);
  return () => {
    countdownListeners.delete(listener);
    // Reset when the last consumer leaves so a remount re-arms the shared timer.
    if (countdownListeners.size === 0) {
      currentDeadline = null;
      if (countdownTimer !== null) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }
  };
}

function useHoldCountdown(deadlineMs: number | null): Countdown {
  useEffect(() => {
    setHoldDeadline(deadlineMs);
  }, [deadlineMs]);
  return useSyncExternalStore(
    subscribeHoldCountdown,
    () => countdownSnap,
    () => countdownSnap,
  );
}

// ---- helpers ----------------------------------------------------------------

/**
 * "Clear slots" everywhere just presses step 1's own clear control. The hold
 * release and its confirmation live there, so this panel never needs to know
 * about holds or tokens.
 */
const CLEAR_SLOTS_TARGET_ID = "step1-clear";

function clearSlots(): void {
  document.getElementById(CLEAR_SLOTS_TARGET_ID)?.click();
}

function computeBreakdown(
  selectedSlots: string[],
  courtCount: number,
  slotGroups: CourtSlotGroup[] | undefined,
  rates: DisplayRates,
  paddleQty: number,
  ball: boolean,
): {
  courtTotal: number;
  paddleTotal: number;
  ballTotal: number;
  total: number;
  breakdown: string;
  rangeLabel: string;
  durationLabel: string;
} {
  const sorted = [...selectedSlots].sort();
  const groups = (slotGroups ?? []).filter((group) => group.slotStarts.length > 0);
  const configuredCourtTotal = groups.reduce((sum, group) => {
    return (
      sum +
      group.slotStarts.reduce((groupTotal, iso) => {
        const rate = courtRateForSlot(rates, group.courtId, new Date(iso));
        return groupTotal + (rate?.amount ?? rates.morning);
      }, 0)
    );
  }, 0);
  const courtTotal =
    groups.length > 0
      ? configuredCourtTotal
      : sorted.length * rates.morning * Math.max(courtCount, 1);

  const paddleHours = sorted.length; // equals booked court hours
  const paddleTotal =
    paddleQty > 0 ? calculatePaddleRentalTotal(rates.paddle, paddleQty, paddleHours) : 0;
  const ballTotal = ball ? rates.ball : 0;
  const total = courtTotal + paddleTotal + ballTotal;

  const breakdown =
    sorted.length === 0
      ? "No hours selected"
      : [
          `${sorted.length} court hour${sorted.length === 1 ? "" : "s"} at configured rates`,
          courtCount > 1 ? `× ${courtCount} courts` : null,
        ]
          .filter(Boolean)
          .join(" ");

  const rangeLabel =
    sorted.length === 0 ? "No time selected" : formatSlotRanges(sorted);

  const durationLabel =
    sorted.length === 0
      ? "Select at least 1 hour"
      : `${sorted.length} Hour${sorted.length === 1 ? "" : "s"}`;

  return { courtTotal, paddleTotal, ballTotal, total, breakdown, rangeLabel, durationLabel };
}

// ---- Desktop sticky panel ---------------------------------------------------

/** Advance control for the mobile sheet — reuses the step's own CTA via its
 *  element id, so hold/validation/payment logic is never duplicated here. */
export interface SummaryAdvance {
  /** id of the step's real advance button (clicked programmatically) */
  targetId: string;
  label: string;
  disabled: boolean;
}

export function BookingSummaryDesktop({ data }: { data: SummaryData }) {
  const { selectedDate, selectedSlots, courtNames, slotGroups, rates, paddleQty, ball, isHeld, holdDeadlineMs, canClearSlots } = data;
  const { courtTotal, paddleTotal, ballTotal, total, breakdown, rangeLabel, durationLabel } = useMemo(
    () => computeBreakdown(selectedSlots, courtNames.length, slotGroups, rates, paddleQty, ball),
    [selectedSlots, courtNames, slotGroups, rates, paddleQty, ball],
  );

  const { urgent, label: countdownLabel } = useHoldCountdown(holdDeadlineMs);

  const hasSlots = selectedSlots.length > 0;
  const hasDate = !!selectedDate;
  const courtLabel = courtNames.length > 0 ? courtNames.join(", ") : "No court selected";
  const dateLabel = hasDate ? formatManilaLong(selectedDate!) : "No date selected";
  const paddleHours = selectedSlots.length;
  // Non-empty only when the booking changes courts — otherwise `rangeLabel` is exact.
  const courtSlotLines = formatCourtSlotGroups(slotGroups ?? []);
  const slotLines = (slotGroups ?? []).flatMap((group) =>
    group.slotStarts
      .slice()
      .sort()
      .map((iso) => ({
        label: formatCourtSlotLine(group.courtName, iso),
        amount: courtRateForSlot(rates, group.courtId, new Date(iso))?.amount ?? rates.morning,
      })),
  );

  // Nothing picked yet (or a Back just cleared the attempt) — the summary has
  // nothing to summarise, so it stays out of the way rather than sitting there
  // as an empty card. Matches the mobile sheet, which also hides itself.
  const hasAny = hasDate || hasSlots || courtNames.length > 0;
  if (!hasAny) return null;

  return (
    <aside
      aria-label="Booking summary"
      className="flex flex-col gap-4 rounded-2xl border border-line-warm/70 bg-cream p-5 shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line-warm/40 pb-3">
        <h2 className="text-base font-extrabold tracking-tight text-ink">Booking Summary</h2>
        <div className="grid size-8 place-items-center rounded-full bg-live text-pine">
          <ReceiptText className="size-[18px]" aria-hidden />
        </div>
      </div>

      {/* Hold countdown timer */}
      {isHeld && holdDeadlineMs !== null && (
        <div
          role="timer"
          aria-live="polite"
          className={cn(
            "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all",
            urgent
              ? "border-error/40 bg-error/10 text-error animate-pulse"
              : "border-amber-200 bg-amber-50 text-amber-800",
          )}
        >
          <Timer className={cn("size-4 shrink-0", urgent ? "text-error" : "text-amber-600")} aria-hidden />
          <div className="min-w-0">
            <span className="block font-bold">
              Hold expires in{" "}
              <strong className={cn("font-extrabold", urgent ? "text-error" : "text-amber-700")}>
                {countdownLabel}
              </strong>
            </span>
            <span className="block text-[10px] font-normal opacity-75">
              Complete your booking before time runs out
            </span>
          </div>
        </div>
      )}

      {/* Held badge (no deadline shown) */}
      {isHeld && holdDeadlineMs === null && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <Sparkles className="size-3.5 shrink-0" />
          <span>Slots held — complete before timer expires</span>
        </div>
      )}

      {/* Detail rows */}
      <div className="flex flex-col gap-2.5">
        {/* Court */}
        <div className="flex items-start gap-3 rounded-xl border border-line-warm/60 bg-white p-3 shadow-xs">
          <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-flame-light text-flame">
            <MapPin className="size-3.5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-warm-muted">
              Court
            </span>
            <span className="block truncate text-sm font-bold text-ink">{courtLabel}</span>
          </div>
        </div>

        {/* Date */}
        <div className="flex items-start gap-3 rounded-xl border border-line-warm/60 bg-white p-3 shadow-xs">
          <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-flame-light text-flame">
            <Calendar className="size-3.5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-warm-muted">
              Date
            </span>
            <span className="block truncate text-sm font-bold text-ink">{dateLabel}</span>
          </div>
        </div>

        {/* Time */}
        <div className="flex items-start gap-3 rounded-xl border border-line-warm/60 bg-white p-3 shadow-xs">
          <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-flame-light text-flame">
            <Clock className="size-3.5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-warm-muted">
              Time
            </span>
            {courtSlotLines.length > 0 ? (
              courtSlotLines.map((line) => (
                <span key={line} className="block text-sm font-bold text-ink">
                  {line}
                </span>
              ))
            ) : (
              <span className="block truncate text-sm font-bold text-ink">
                {hasSlots ? rangeLabel : "No time selected"}
              </span>
            )}
            {hasSlots && (
              <span className="block text-[10px] font-medium text-warm-muted">{durationLabel}</span>
            )}
          </div>
        </div>

        {/* Clear slots — drops every pick, same control as the time grid */}
        {canClearSlots && (
          <button
            type="button"
            onClick={clearSlots}
            className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-line-warm/70 bg-white px-3 text-xs font-bold text-warm-muted transition-all hover:bg-oat hover:text-ink"
          >
            <X className="size-3.5" aria-hidden /> Clear slots
          </button>
        )}

        {/* Equipment — live from step 1 panel 4 */}
        {(paddleQty > 0 || ball) && (
          <div className="flex items-start gap-3 rounded-xl border border-flame/30 bg-flame-light/20 p-3 shadow-xs">
            <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-flame-light text-flame">
              <Dumbbell className="size-3.5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-warm-muted">
                Equipment
              </span>
              {paddleQty > 0 && (
                <span className="mt-1 flex items-center gap-2 text-xs font-semibold text-ink">
                  <span className="relative size-7 shrink-0 overflow-hidden rounded-lg border border-line-warm/60 bg-gradient-to-br from-oat via-cream to-flame-light">
                    <Image
                      src="/images/paddle.jpg"
                      alt="Paddle rental"
                      width={28}
                      height={28}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </span>
                  {paddleQty} × Paddle ({paddleHours}h)
                </span>
              )}
              {ball && (
                <span className="mt-1 flex items-center gap-2 text-xs font-semibold text-ink">
                  <span className="relative size-7 shrink-0 overflow-hidden rounded-lg border border-line-warm/60 bg-gradient-to-br from-oat via-cream to-flame-light">
                    <Image
                      src="/images/Pickleball.jpg"
                      alt="Ball set"
                      width={28}
                      height={28}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </span>
                  Ball set (flat)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cost breakdown — always shown when slots selected */}
      {hasSlots && (
        <div className="rounded-xl border border-line-warm/70 bg-oat/60 p-3.5">
          <div className="space-y-1.5 text-xs">
            {slotLines.length > 0 ? (
              <>
                <div className="flex justify-between font-semibold text-ink">
                  <span>{slotLines.length} slot{slotLines.length === 1 ? "" : "s"} booked</span>
                  <span>{peso(courtTotal)}</span>
                </div>
                {slotLines.map((line) => (
                  <div key={`${line.label}-${line.amount}`} className="flex justify-between gap-3 text-warm-muted">
                    <span>{line.label}</span>
                    <span className="shrink-0 font-semibold text-ink">{peso(line.amount)}</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="flex justify-between text-warm-muted">
                <span>{breakdown}</span>
                <span className="font-semibold text-ink">{peso(courtTotal)}</span>
              </div>
            )}
            {paddleQty > 0 && (
              <div className="flex items-center justify-between gap-2 text-warm-muted">
                <span className="flex items-center gap-1.5">
                  <span className="relative size-6 shrink-0 overflow-hidden rounded-md border border-line-warm/60 bg-gradient-to-br from-oat via-cream to-flame-light">
                    <Image
                      src="/images/paddle.jpg"
                      alt="Paddle rental"
                      width={24}
                      height={24}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </span>
                  {paddleQty} × Paddle × {paddleHours}h
                </span>
                <span className="font-semibold text-ink">{peso(paddleTotal)}</span>
              </div>
            )}
            {ball && (
              <div className="flex items-center justify-between gap-2 text-warm-muted">
                <span className="flex items-center gap-1.5">
                  <span className="relative size-6 shrink-0 overflow-hidden rounded-md border border-line-warm/60 bg-gradient-to-br from-oat via-cream to-flame-light">
                    <Image
                      src="/images/Pickleball.jpg"
                      alt="Ball set"
                      width={24}
                      height={24}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </span>
                  Ball set
                </span>
                <span className="font-semibold text-ink">{peso(ballTotal)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-line-warm/50 pt-2">
              <span className="text-xs font-bold text-ink">Estimated Total</span>
              <span className="text-xl font-extrabold text-flame">{peso(total)}</span>
            </div>
          </div>
        </div>
      )}
      {/* Empty state */}
      {!hasSlots && (
        <p className="text-center text-xs text-warm-muted">
          Select courts, date &amp; time to see your estimate
        </p>
      )}

      <p className="flex items-center justify-center gap-1.5 text-center text-[10px] text-warm-muted">
        <Timer className="size-3 shrink-0 text-flame" aria-hidden />
        <span>10-min hold applies when you proceed</span>
      </p>
    </aside>
  );
}

// ---- Mobile bottom sheet ----------------------------------------------------

export function BookingSummaryMobile({ data, advance }: { data: SummaryData; advance: SummaryAdvance | null }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  const { selectedDate, selectedSlots, courtNames, slotGroups, rates, paddleQty, ball, isHeld, holdDeadlineMs, canClearSlots } = data;

  const { courtTotal, paddleTotal, ballTotal, total, breakdown, rangeLabel, durationLabel } = useMemo(
    () => computeBreakdown(selectedSlots, courtNames.length, slotGroups, rates, paddleQty, ball),
    [selectedSlots, courtNames, slotGroups, rates, paddleQty, ball],
  );

  const { urgent, label: countdownLabel } = useHoldCountdown(holdDeadlineMs);

  const hasSlots = selectedSlots.length > 0;
  const hasDate = !!selectedDate;
  const hasAny = hasDate || hasSlots || courtNames.length > 0;

  if (!hasAny) return null;

  const courtLabel = courtNames.length > 0 ? courtNames.join(", ") : "—";
  const dateLabel = hasDate ? formatManilaLong(selectedDate!) : "—";
  const paddleHours = selectedSlots.length;
  const courtSlotLines = formatCourtSlotGroups(slotGroups ?? []);

  return (
    <>
      {mounted && createPortal(
        <>
      {/* Backdrop for the expanded mobile summary. */}
      {open && (
        <div
          className="fixed inset-0 z-[60] m-0 bg-black/40 lg:hidden"
          aria-hidden
          onClick={() => setOpen(false)}
        />
      )}

      {/* Floating pill — sits above the bottom edge; expands into the summary body */}
      <div className="fixed inset-x-0 bottom-0 z-[70] m-0 px-3 pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div
          className={cn(
            "mx-auto mb-3 max-w-lg overflow-hidden rounded-2xl border shadow-[0_8px_32px_rgba(66,48,45,0.22)]",
            isHeld && holdDeadlineMs !== null && urgent
              ? "border-error/40 bg-error/10"
              : isHeld && holdDeadlineMs !== null
                ? "border-amber-200 bg-amber-50"
                : "border-line-warm/60 bg-cream",
          )}
        >
          {/* Pill row — tap the left side to expand, the right-side CTA advances the step */}
          <div className="flex items-center gap-1.5 py-2 pl-3 pr-2">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="mobile-summary-body"
              className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left"
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-white",
                  isHeld && holdDeadlineMs !== null && urgent ? "bg-error" : "bg-flame",
                )}
              >
                {isHeld && holdDeadlineMs !== null ? (
                  <Timer className="size-3.5" aria-hidden />
                ) : (
                  <Receipt className="size-3.5" aria-hidden />
                )}
              </span>
              {/* Show countdown in pill when held */}
              <span className="min-w-0 flex-1">
                {isHeld && holdDeadlineMs !== null ? (
                  <span role="timer" aria-live="polite" className="block min-w-0">
                    <span className={cn("block text-sm font-bold leading-tight", urgent ? "text-error" : "text-amber-800")}>
                      Hold expires in{" "}
                      <strong className={cn("font-extrabold", urgent ? "text-error" : "text-amber-700")}>
                        {countdownLabel}
                      </strong>
                    </span>
                    {hasSlots && (
                      <span className="block text-[11px] text-warm-muted">
                        {durationLabel} · <span className="font-extrabold text-flame">{peso(total)}</span>
                      </span>
                    )}
                  </span>
                ) : hasSlots ? (
                  <span className="block min-w-0">
                    <span className="block truncate text-sm font-bold text-ink leading-tight">{rangeLabel}</span>
                    <span className="block text-[11px] text-warm-muted">
                      {durationLabel} ·{" "}
                      <span className="font-extrabold text-flame">{peso(total)}</span>
                    </span>
                  </span>
                ) : (
                  <span className="block truncate text-sm font-semibold text-ink">Booking Summary</span>
                )}
                {!open && (
                  <span className="mt-0.5 block text-[10px] font-semibold text-warm-muted">
                    Tap to view summary
                  </span>
                )}
              </span>
              {isHeld && holdDeadlineMs === null && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  Held
                </span>
              )}
              {open ? (
                <ChevronDown className="size-4 shrink-0 text-warm-muted" aria-hidden />
              ) : (
                <ChevronUp className="size-4 shrink-0 text-warm-muted" aria-hidden />
              )}
            </button>

            {/* Clear — compact so the step CTA keeps its room on a 360px phone */}
            {canClearSlots && (
              <button
                type="button"
                onClick={clearSlots}
                className="inline-flex min-h-[36px] shrink-0 items-center justify-center gap-0.5 rounded-xl border border-line-warm/70 bg-white px-2 text-[11px] font-bold text-warm-muted transition-all hover:bg-oat hover:text-ink"
              >
                <X className="size-3" aria-hidden />
                <span>Clear</span>
              </button>
            )}

            {/* Step CTA — always visible; fires the step's own button so hold/
                validation/payment logic is never duplicated here */}
            {advance && (
              <button
                type="button"
                onClick={() => document.getElementById(advance.targetId)?.click()}
                disabled={advance.disabled}
                aria-label={advance.label}
                className="inline-flex min-h-[36px] shrink-0 items-center justify-center gap-0.5 rounded-xl bg-flame px-2 text-[11px] font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
              >
                <span>{
                  advance.label === "Continue to Details"
                    ? "Details"
                    : advance.label === "Submit Booking"
                      ? "Submit"
                      : advance.label === "Payment"
                        ? "Pay"
                        : advance.label
                }</span>
                <ArrowRight className="size-3" aria-hidden />
              </button>
            )}
          </div>

          {/* Expanded body */}
          <div
            id="mobile-summary-body"
            hidden={!open}
            className="border-t border-line-warm/40 px-4 pb-4 pt-4"
          >
            {/* Timer row */}
            {isHeld && holdDeadlineMs !== null && (
              <div
                role="timer"
                aria-live="polite"
                className={cn(
                  "mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold",
                  urgent
                    ? "border-error/40 bg-error/10 text-error animate-pulse"
                    : "border-amber-200 bg-amber-50 text-amber-800",
                )}
              >
                <Timer className={cn("size-3.5 shrink-0", urgent ? "text-error" : "text-amber-600")} aria-hidden />
                <span>
                  Hold expires in{" "}
                  <strong className={cn("font-extrabold", urgent ? "text-error" : "text-amber-700")}>
                    {countdownLabel}
                  </strong>
                </span>
              </div>
            )}

            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs">
                <MapPin className="size-3.5 shrink-0 text-flame" />
                <span className="font-semibold text-warm-muted">Court:</span>
                <span className="font-bold text-ink">{courtLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Calendar className="size-3.5 shrink-0 text-flame" />
                <span className="font-semibold text-warm-muted">Date:</span>
                <span className="font-bold text-ink">{dateLabel}</span>
              </div>
              {hasSlots && (
                <div className="flex items-start gap-2 text-xs">
                  <Clock className="mt-0.5 size-3.5 shrink-0 text-flame" />
                  <span className="font-semibold text-warm-muted">Time:</span>
                  <span className="font-bold text-ink">
                    {courtSlotLines.length > 0
                      ? courtSlotLines.join("; ")
                      : `${rangeLabel} (${durationLabel})`}
                  </span>
                </div>
              )}
              {(paddleQty > 0 || ball) && (
                <div className="flex items-start gap-2 text-xs">
                  <Dumbbell className="mt-0.5 size-3.5 shrink-0 text-flame" />
                  <span className="font-semibold text-warm-muted">Gear:</span>
                  <span className="font-bold text-ink">
                    {[
                      paddleQty > 0 && `${paddleQty}× paddle (${paddleHours}h)`,
                      ball && "ball set",
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              )}
            </div>

            {canClearSlots && (
              <button
                type="button"
                onClick={clearSlots}
                className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-line-warm/70 bg-white px-3 text-xs font-bold text-warm-muted transition-all hover:bg-oat hover:text-ink"
              >
                <X className="size-3.5" aria-hidden /> Clear slots
              </button>
            )}
            {hasSlots && (
              <div className="mt-4 rounded-xl border border-line-warm/60 bg-white p-3 text-xs">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-warm-muted">
                    <span>{breakdown}</span>
                    <span className="font-semibold text-ink">{peso(courtTotal)}</span>
                  </div>
                  {paddleQty > 0 && (
                    <div className="flex items-center justify-between gap-2 text-warm-muted">
                      <span className="flex items-center gap-1.5">
                        <span className="relative size-6 shrink-0 overflow-hidden rounded-md border border-line-warm/60 bg-gradient-to-br from-oat via-cream to-flame-light">
                          <Image
                            src="/images/paddle.jpg"
                            alt="Paddle rental"
                            width={24}
                            height={24}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        </span>
                        {paddleQty} × Paddle × {paddleHours}h
                      </span>
                      <span className="font-semibold text-ink">{peso(paddleTotal)}</span>
                    </div>
                  )}
                  {ball && (
                    <div className="flex items-center justify-between gap-2 text-warm-muted">
                      <span className="flex items-center gap-1.5">
                        <span className="relative size-6 shrink-0 overflow-hidden rounded-md border border-line-warm/60 bg-gradient-to-br from-oat via-cream to-flame-light">
                          <Image
                            src="/images/Pickleball.jpg"
                            alt="Ball set"
                            width={24}
                            height={24}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        </span>
                        Ball set
                      </span>
                      <span className="font-semibold text-ink">{peso(ballTotal)}</span>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between border-t border-line-warm/50 pt-2">
                    <span className="font-bold text-ink">Estimated Total</span>
                    <span className="text-lg font-extrabold text-flame">{peso(total)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

        </>,
        document.body,
      )}

      {/* Keep page content clear of the fixed mobile summary. */}
      <div className="h-24 lg:hidden" aria-hidden />
    </>
  );
}
