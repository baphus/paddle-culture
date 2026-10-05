"use client";

import { useEffect, useRef, useState } from "react";
import {
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { formatManilaLong, formatSlotRange, formatCountdown } from "@/lib/courts";
import { peso, type DisplayRates } from "@/lib/pricing-display";
import { timeBandFor } from "@/lib/booking/slots";

export interface SummaryData {
  /** ISO date string "YYYY-MM-DD", or null if not yet picked */
  selectedDate: string | null;
  /** Sorted ISO timestamps of selected slot starts */
  selectedSlots: string[];
  /** Names of selected courts */
  courtNames: string[];
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
}

// ---- hold countdown hook ----------------------------------------------------

function useHoldCountdown(deadlineMs: number | null): {
  remaining: number;
  urgent: boolean;
  label: string;
} {
  const [remaining, setRemaining] = useState(() =>
    deadlineMs !== null ? Math.max(0, deadlineMs - Date.now()) : 0,
  );

  useEffect(() => {
    if (deadlineMs === null) {
      setRemaining(0);
      return;
    }
    setRemaining(Math.max(0, deadlineMs - Date.now()));
    const id = setInterval(() => {
      setRemaining(Math.max(0, deadlineMs - Date.now()));
    }, 500);
    return () => clearInterval(id);
  }, [deadlineMs]);

  const urgent = deadlineMs !== null && remaining < 120_000;
  const label = deadlineMs !== null ? formatCountdown(remaining) : "";
  return { remaining, urgent, label };
}

// ---- helpers ----------------------------------------------------------------

function computeBreakdown(
  selectedSlots: string[],
  courtCount: number,
  rates: DisplayRates,
  paddleQty: number,
  ball: boolean,
): {
  dayCount: number;
  nightCount: number;
  courtTotal: number;
  paddleTotal: number;
  ballTotal: number;
  total: number;
  breakdown: string;
  rangeLabel: string;
  durationLabel: string;
} {
  const sorted = [...selectedSlots].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  let dayCount = 0;
  let nightCount = 0;
  for (const iso of sorted) {
    if (timeBandFor(new Date(iso)) === "evening") nightCount++;
    else dayCount++;
  }
  const perCourt = dayCount * rates.morning + nightCount * rates.evening;
  const courtTotal = perCourt * Math.max(courtCount, 1);

  const paddleHours = sorted.length; // equals booked court hours
  const paddleTotal = paddleQty > 0 ? paddleQty * paddleHours * rates.paddle : 0;
  const ballTotal = ball ? rates.ball : 0;
  const total = courtTotal + paddleTotal + ballTotal;

  const breakdown =
    sorted.length === 0
      ? "No hours selected"
      : [
          dayCount > 0 && nightCount > 0
            ? `${dayCount}h Day + ${nightCount}h Night`
            : dayCount > 0
              ? `${dayCount} hr${dayCount === 1 ? "" : "s"} @ ${peso(rates.morning)}/hr`
              : `${nightCount} hr${nightCount === 1 ? "" : "s"} @ ${peso(rates.evening)}/hr`,
          courtCount > 1 ? `× ${courtCount} courts` : null,
        ]
          .filter(Boolean)
          .join(" ");

  const rangeLabel =
    sorted.length === 0
      ? "No time selected"
      : `${formatSlotRange(sorted[0]!).split("–")[0]?.trim()} – ${formatSlotRange(sorted[sorted.length - 1]!).split("–")[1]?.trim()}`;

  const durationLabel =
    sorted.length === 0
      ? "Select at least 1 hour"
      : `${sorted.length} Hour${sorted.length === 1 ? "" : "s"}`;

  return { dayCount, nightCount, courtTotal, paddleTotal, ballTotal, total, breakdown, rangeLabel, durationLabel };
}

// ---- Desktop sticky panel ---------------------------------------------------

export function BookingSummaryDesktop({ data }: { data: SummaryData }) {
  const { selectedDate, selectedSlots, courtNames, rates, paddleQty, ball, isHeld, holdDeadlineMs } = data;
  const { courtTotal, paddleTotal, ballTotal, total, breakdown, rangeLabel, durationLabel } =
    computeBreakdown(selectedSlots, courtNames.length, rates, paddleQty, ball);

  const { urgent, label: countdownLabel } = useHoldCountdown(holdDeadlineMs);

  const hasSlots = selectedSlots.length > 0;
  const hasDate = !!selectedDate;
  const courtLabel = courtNames.length > 0 ? courtNames.join(", ") : "No court selected";
  const dateLabel = hasDate ? formatManilaLong(selectedDate!) : "No date selected";
  const paddleHours = selectedSlots.length;

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
            <span className="block truncate text-sm font-bold text-ink">
              {hasSlots ? rangeLabel : "No time selected"}
            </span>
            {hasSlots && (
              <span className="block text-[10px] font-medium text-warm-muted">{durationLabel}</span>
            )}
          </div>
        </div>

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

export function BookingSummaryMobile({ data }: { data: SummaryData }) {
  const [open, setOpen] = useState(false);
  const { selectedDate, selectedSlots, courtNames, rates, paddleQty, ball, isHeld, holdDeadlineMs } = data;

  const { courtTotal, paddleTotal, ballTotal, total, breakdown, rangeLabel, durationLabel } =
    computeBreakdown(selectedSlots, courtNames.length, rates, paddleQty, ball);

  const { urgent, label: countdownLabel } = useHoldCountdown(holdDeadlineMs);

  const hasSlots = selectedSlots.length > 0;
  const hasDate = !!selectedDate;
  const hasAny = hasDate || hasSlots || courtNames.length > 0;

  if (!hasAny) return null;

  const courtLabel = courtNames.length > 0 ? courtNames.join(", ") : "—";
  const dateLabel = hasDate ? formatManilaLong(selectedDate!) : "—";
  const paddleHours = selectedSlots.length;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          aria-hidden
          onClick={() => setOpen(false)}
        />
      )}

      {/* Bottom sheet */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 lg:hidden transition-transform duration-300",
          open ? "translate-y-0" : "translate-y-[calc(100%-56px)]",
        )}
      >
        <div
          className={cn(
            "mx-auto max-w-lg rounded-t-2xl border-t shadow-[0_-8px_32px_rgba(66,48,45,0.18)]",
            isHeld && holdDeadlineMs !== null && urgent
              ? "border-error/40 bg-error/10"
              : isHeld && holdDeadlineMs !== null
                ? "border-amber-200 bg-amber-50"
                : "border-line-warm/60 bg-cream",
          )}
        >
          {/* Collapsed pill — always visible */}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-summary-body"
            className="flex w-full items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div
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
              </div>
              {/* Show countdown in pill when held */}
              {isHeld && holdDeadlineMs !== null ? (
                <div role="timer" aria-live="polite" className="min-w-0">
                  <p className={cn("text-sm font-bold leading-tight", urgent ? "text-error" : "text-amber-800")}>
                    Hold expires in{" "}
                    <strong className={cn("font-extrabold", urgent ? "text-error" : "text-amber-700")}>
                      {countdownLabel}
                    </strong>
                  </p>
                  {hasSlots && (
                    <p className="text-[11px] text-warm-muted">
                      {durationLabel} · <span className="font-extrabold text-flame">{peso(total)}</span>
                    </p>
                  )}
                </div>
              ) : hasSlots ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink leading-tight">{rangeLabel}</p>
                  <p className="text-[11px] text-warm-muted">
                    {durationLabel} ·{" "}
                    <span className="font-extrabold text-flame">{peso(total)}</span>
                  </p>
                </div>
              ) : (
                <p className="truncate text-sm font-semibold text-ink">Booking Summary</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isHeld && holdDeadlineMs === null && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  Held
                </span>
              )}
              {open ? (
                <ChevronDown className="size-4 text-warm-muted" aria-hidden />
              ) : (
                <ChevronUp className="size-4 text-warm-muted" aria-hidden />
              )}
            </div>
          </button>

          {/* Expanded body */}
          <div
            id="mobile-summary-body"
            hidden={!open}
            className="border-t border-line-warm/40 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
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
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="size-3.5 shrink-0 text-flame" />
                  <span className="font-semibold text-warm-muted">Time:</span>
                  <span className="font-bold text-ink">{rangeLabel} ({durationLabel})</span>
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

            {/* Cost breakdown */}
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

      {/* Spacer */}
      <div className="h-14 lg:hidden" aria-hidden />
    </>
  );
}
