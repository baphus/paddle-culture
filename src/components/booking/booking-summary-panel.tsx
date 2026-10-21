"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatManilaLong,
  formatSlotRanges,
  formatCountdown,
  type CourtSlotGroup,
} from "@/lib/courts";
import {
  calculatePaddleRentalTotal,
  courtRateForSlot,
  peso,
  type DisplayRates,
} from "@/lib/pricing-display";

export interface SummaryData {
  selectedDate: string | null;
  selectedSlots: string[];
  courtNames: string[];
  slotGroups?: CourtSlotGroup[];
  rates: DisplayRates;
  paddleQty: number;
  ball: boolean;
  isHeld: boolean;
  holdDeadlineMs: number | null;
  canClearSlots?: boolean;
}

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
  if (countdownTimer !== null) clearInterval(countdownTimer);
  countdownTimer = null;
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
    if (countdownListeners.size === 0) {
      currentDeadline = null;
      if (countdownTimer !== null) clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };
}

function useHoldCountdown(deadlineMs: number | null): Countdown {
  useEffect(() => setHoldDeadline(deadlineMs), [deadlineMs]);
  return useSyncExternalStore(
    subscribeHoldCountdown,
    () => countdownSnap,
    () => countdownSnap,
  );
}

const CLEAR_SLOTS_TARGET_ID = "step1-clear";

function clearSlots(): void {
  document.getElementById(CLEAR_SLOTS_TARGET_ID)?.click();
}

interface CourtLine {
  courtName: string;
  hours: number;
  amount: number;
  rateDetails: string[];
}

function summarizeCourtLines(
  selectedSlots: string[],
  courtNames: string[],
  slotGroups: CourtSlotGroup[] | undefined,
  rates: DisplayRates,
): CourtLine[] {
  const groups = (slotGroups ?? []).filter((group) => group.slotStarts.length > 0);
  if (groups.length > 0) {
    return groups.map((group) => {
      const slots = [...group.slotStarts].sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime(),
      );
      const rateRuns: { amount: number; slots: string[] }[] = [];
      for (const slot of slots) {
        const amount = courtRateForSlot(rates, group.courtId, new Date(slot))?.amount ?? rates.morning;
        const previousRun = rateRuns[rateRuns.length - 1];
        const previousSlot = previousRun?.slots[previousRun.slots.length - 1];
        if (
          previousRun?.amount === amount &&
          previousSlot &&
          new Date(slot).getTime() - new Date(previousSlot).getTime() === 3_600_000
        ) {
          previousRun.slots.push(slot);
        } else {
          rateRuns.push({ amount, slots: [slot] });
        }
      }
      return {
        courtName: group.courtName,
        hours: slots.length,
        amount: rateRuns.reduce((sum, run) => sum + run.amount * run.slots.length, 0),
        rateDetails: rateRuns.map(
          (run) => `${formatSlotRanges(run.slots)} · ${peso(run.amount)}/hour`,
        ),
      };
    });
  }

  if (selectedSlots.length === 0) return [];
  const courtCount = Math.max(courtNames.length, 1);
  const amount = selectedSlots.length * rates.morning;
  return courtNames.length > 0
    ? courtNames.map((courtName) => ({
        courtName,
        hours: selectedSlots.length,
        amount,
        rateDetails: [`${formatSlotRanges(selectedSlots)} · ${peso(rates.morning)}/hour`],
      }))
    : [{
        courtName: "Court booking",
        hours: selectedSlots.length * courtCount,
        amount: amount * courtCount,
        rateDetails: [`${formatSlotRanges(selectedSlots)} · ${peso(rates.morning)}/hour`],
      }];
}

function useSummary(data: SummaryData) {
  const courtLines = useMemo(
    () => summarizeCourtLines(data.selectedSlots, data.courtNames, data.slotGroups, data.rates),
    [data.selectedSlots, data.courtNames, data.slotGroups, data.rates],
  );
  const courtTotal = courtLines.reduce((sum, line) => sum + line.amount, 0);
  // Rentals bill per booked court-hour, so hours on every selected court count.
  const courtHours = courtLines.reduce((sum, line) => sum + line.hours, 0);
  const paddleTotal = data.paddleQty > 0
    ? calculatePaddleRentalTotal(data.rates.paddle, data.paddleQty, courtHours)
    : 0;
  const ballTotal = data.ball ? data.rates.ball : 0;
  return {
    courtLines,
    courtTotal,
    paddleTotal,
    ballTotal,
    courtHours,
    total: courtTotal + paddleTotal + ballTotal,
    duration: `${data.selectedSlots.length} hour${data.selectedSlots.length === 1 ? "" : "s"}`,
  };
}

export interface SummaryAdvance {
  targetId: string;
  label: string;
  disabled: boolean;
}

function HoldCountdown({ deadlineMs, urgent, label }: {
  deadlineMs: number;
  urgent: boolean;
  label: string;
}) {
  return (
    <p
      role="timer"
      aria-live="polite"
      className={cn("flex items-center gap-2 text-xs font-semibold", urgent ? "text-error" : "text-amber-800")}
    >
      <Timer className="size-3.5 shrink-0" aria-hidden />
      <span>Hold expires in {label}</span>
    </p>
  );
}

function SummaryLines({ data, compact = false }: { data: SummaryData; compact?: boolean }) {
  const summary = useSummary(data);
  const dateLabel = data.selectedDate ? formatManilaLong(data.selectedDate) : "—";
  const courtLabel = data.courtNames.length > 0 ? data.courtNames.join(", ") : "—";

  return (
    <div className="space-y-2 text-xs">
      <div className="flex justify-between gap-4">
        <span className="text-warm-muted">Date</span>
        <span className="text-right font-medium text-ink">{dateLabel}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-warm-muted">Court{data.courtNames.length === 1 ? "" : "s"}</span>
        <span className="text-right font-medium text-ink">{courtLabel}</span>
      </div>

      {data.selectedSlots.length > 0 && (
        <div className="space-y-2 border-t border-line-warm/70 pt-2">
          {summary.courtLines.map((line, index) => (
            <div key={`${line.courtName}-${index}`}>
              <div className="flex justify-between gap-3 font-semibold text-ink">
                <span>{line.courtName} · {line.hours} hour{line.hours === 1 ? "" : "s"}</span>
                <span className="shrink-0 tabular-nums">{peso(line.amount)}</span>
              </div>
              {line.rateDetails.map((detail) => (
                <p key={detail} className="mt-0.5 text-[11px] leading-4 text-warm-muted">{detail}</p>
              ))}
            </div>
          ))}
          {data.paddleQty > 0 && (
            <div className="flex justify-between gap-3">
              <span className="text-ink">
                Paddle rental · {data.paddleQty} × {summary.courtHours} hour{summary.courtHours === 1 ? "" : "s"}
                {!compact && <span className="mt-0.5 block text-[11px] text-warm-muted">{peso(data.rates.paddle)} per paddle per hour</span>}
              </span>
              <span className="shrink-0 tabular-nums text-ink">{peso(summary.paddleTotal)}</span>
            </div>
          )}
          {data.ball && (
            <div className="flex justify-between gap-3">
              <span className="text-ink">Ball set · one booking</span>
              <span className="shrink-0 tabular-nums text-ink">{peso(summary.ballTotal)}</span>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-line-warm/70 pt-2 font-bold text-ink">
            <span>Estimated total</span>
            <span className="shrink-0 tabular-nums">{peso(summary.total)}</span>
          </div>
        </div>
      )}
      {data.selectedSlots.length === 0 && (
        <p className="border-t border-line-warm/70 pt-2 text-center text-warm-muted">
          Select courts, date &amp; time to see your estimate
        </p>
      )}
    </div>
  );
}

export function BookingSummaryDesktop({ data }: { data: SummaryData }) {
  const { urgent, label } = useHoldCountdown(data.holdDeadlineMs);
  const hasAny = !!data.selectedDate || data.selectedSlots.length > 0 || data.courtNames.length > 0;
  if (!hasAny) return null;

  return (
    <aside aria-label="Booking summary" className="rounded-2xl border border-line-warm/70 bg-white p-4">
      <div className="flex items-center justify-between gap-3 border-b border-line-warm/70 pb-2">
        <h2 className="text-sm font-bold text-ink">Booking summary</h2>
        {data.isHeld && data.holdDeadlineMs !== null && (
          <HoldCountdown deadlineMs={data.holdDeadlineMs} urgent={urgent} label={label} />
        )}
      </div>
      <div className="py-3">
        <SummaryLines data={data} />
      </div>
      {data.canClearSlots && (
        <button type="button" onClick={clearSlots} className="border-t border-line-warm/70 pt-2 text-xs font-semibold text-warm-muted underline underline-offset-2 hover:text-ink">
          <X className="mr-1 inline size-3" aria-hidden />Clear slots
        </button>
      )}
    </aside>
  );
}

export function BookingSummaryMobile({ data, advance }: { data: SummaryData; advance: SummaryAdvance | null }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const summary = useSummary(data);
  const { urgent, label } = useHoldCountdown(data.holdDeadlineMs);
  const hasAny = !!data.selectedDate || data.selectedSlots.length > 0 || data.courtNames.length > 0;
  if (!hasAny) return null;

  return (
    <>
      {mounted && createPortal(
        <>
          {open && <button type="button" className="fixed inset-0 z-[60] bg-black/30 lg:hidden" aria-label="Close booking summary" onClick={() => setOpen(false)} />}
          <div className="fixed inset-x-0 bottom-0 z-[70] px-3 pb-[env(safe-area-inset-bottom)] lg:hidden">
            <div className="mx-auto mb-3 max-w-lg rounded-2xl border border-line-warm bg-white px-3 py-2 shadow-md">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="mobile-summary-body" className="min-h-10 min-w-0 flex-1 text-left">
                  {data.isHeld && data.holdDeadlineMs !== null ? (
                    <span className={cn("block text-xs font-semibold", urgent ? "text-error" : "text-amber-800")}>Hold expires in {label}</span>
                  ) : (
                    <span className="block truncate text-xs font-semibold text-ink">{data.selectedSlots.length > 0 ? `${summary.duration} · ${peso(summary.total)}` : "Booking summary"}</span>
                  )}
                  <span className="block text-[10px] text-warm-muted">{open ? "Hide summary" : "View summary"}</span>
                </button>
                {data.canClearSlots && (
                  <button type="button" onClick={clearSlots} className="min-h-9 px-2 text-[11px] font-semibold text-warm-muted underline underline-offset-2">Clear</button>
                )}
                {advance && (
                  <button type="button" onClick={() => document.getElementById(advance.targetId)?.click()} disabled={advance.disabled} aria-label={advance.label} className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-flame px-3 text-[11px] font-semibold text-white disabled:opacity-50">
                    {advance.label === "Continue to Details" ? "Details" : advance.label === "Submit Booking" ? "Submit" : advance.label === "Payment" ? "Pay" : advance.label}
                    <ArrowRight className="size-3" aria-hidden />
                  </button>
                )}
              </div>
              <div id="mobile-summary-body" hidden={!open} className="border-t border-line-warm/70 py-3">
                {data.isHeld && data.holdDeadlineMs !== null && <div className="mb-3"><HoldCountdown deadlineMs={data.holdDeadlineMs} urgent={urgent} label={label} /></div>}
                <SummaryLines data={data} />
              </div>
            </div>
          </div>
          <div className="h-16 lg:hidden" aria-hidden />
        </>,
        document.body,
      )}
    </>
  );
}
