"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Check,
  CreditCard,
  Receipt,
  Sparkles,
  Timer,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { formatCountdown, type CourtOption } from "@/lib/courts";
import { FALLBACK_RATES, type DisplayRates } from "@/lib/pricing-display";
import { cn } from "@/lib/utils";
import ConfirmationStep from "./confirmation-step";
import DetailsForm, { type DetailsValues } from "./details-form";
import PaymentStep from "./payment-step";
import Step1DateTime, { type HoldState } from "./step1-date-time";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  BookingSummaryDesktop,
  BookingSummaryMobile,
  type SummaryAdvance,
  type SummaryData,
} from "./booking-summary-panel";

type Step = "select" | "details" | "payment" | "confirmation";

interface StepItem {
  id: Step;
  number: number;
  label: string;
  description: string;
  icon: typeof Calendar;
}

const STEPS_LOCAL: StepItem[] = [
  {
    id: "select",
    number: 1,
    label: "Book",
    description: "Choose court & hours",
    icon: Calendar,
  },
  {
    id: "details",
    number: 2,
    label: "Details",
    description: "Contact info",
    icon: User,
  },
  {
    id: "payment",
    number: 3,
    label: "Payment",
    description: "GCash / Bank transfer",
    icon: CreditCard,
  },
  {
    id: "confirmation",
    number: 4,
    label: "Confirmed",
    description: "Tracking pass & code",
    icon: Receipt,
  },
];

function HoldTimerBar({
  deadlineMs,
  onExpired,
}: {
  deadlineMs: number;
  onExpired: () => void;
}) {
  const [remaining, setRemaining] = useState(() => deadlineMs - Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const interval = setInterval(() => {
      const rem = deadlineMs - Date.now();
      setRemaining(rem);
      if (rem <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpired();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [deadlineMs, onExpired]);

  const urgent = remaining < 120_000;

  return (
    <div
      role="timer"
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs sm:text-sm font-semibold transition-all",
        urgent
          ? "border-error/40 bg-error/10 text-error animate-pulse"
          : "border-line-warm/80 bg-white/90 text-ink shadow-xs",
      )}
    >
      <div className="flex items-center gap-2">
        <Timer className={cn("size-4", urgent ? "text-error" : "text-flame")} />
        <span>
          Slots held! Complete your booking in{" "}
          <strong className={cn("font-extrabold", urgent ? "text-error" : "text-flame")}>
            {formatCountdown(remaining)}
          </strong>
        </span>
      </div>
      <span className="text-[11px] font-normal text-warm-muted">
        We never submit automatically · your selection is protected while timer runs
      </span>
    </div>
  );
}

export default function BookingFlow({
  initialCourts,
  initialRates = FALLBACK_RATES,
}: {
  initialCourts: CourtOption[];
  initialRates?: DisplayRates;
}) {
  const [courts, setCourts] = useState<CourtOption[]>(initialCourts);
  const [rates, setRates] = useState<DisplayRates>(initialRates);

  // Wizard state
  const [step, setStep] = useState<Step>("select");
  const [hold, setHold] = useState<HoldState | null>(null);
  const [confirmBack, setConfirmBack] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [courtIds, setCourtIds] = useState<string[]>(() =>
    initialCourts.length > 0 ? [initialCourts[0].id] : [],
  );
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  // Equipment — live from step 1 panel 4, pre-fills DetailsForm
  const [livePaddleQty, setLivePaddleQty] = useState(0);
  const [liveBall, setLiveBall] = useState(false);
  const [details, setDetails] = useState<DetailsValues | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ trackingToken: string; total: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<{ trackingToken: string; total: string } | null>(null);

  // Refresh courts and pricing live
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

  const handleHoldExpired = useCallback(() => {
    setHold(null);
    setError("Your hold expired. Please select your slots and hold again.");
    setStep("select");
    toast.error("Your hold expired. Please select your slots and hold again.", {
      duration: 8000,
    });
  }, []);

  const handleHoldSuccess = useCallback(
    (newHold: HoldState, newCourtIds: string[], newSlots: string[], date: string, paddleQty = 0, ball = false) => {
      setError(null);
      setHold(newHold);
      setCourtIds(newCourtIds);
      setSelectedSlots(newSlots);
      setSelectedDate(date);
      setLivePaddleQty(paddleQty);
      setLiveBall(ball);
      setIdempotencyKey(crypto.randomUUID());
      setStep("details");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [],
  );

  /** Called on every live change in step 1 — keeps summary in sync before hold */
  const handleLiveUpdate = useCallback(
    (update: { courtIds: string[]; selectedDate: string | null; selectedSlots: string[]; paddleQty: number; ball: boolean }) => {
      setCourtIds(update.courtIds);
      setSelectedDate(update.selectedDate);
      setSelectedSlots(update.selectedSlots);
      setLivePaddleQty(update.paddleQty);
      setLiveBall(update.ball);
    },
    [],
  );

  const releaseHold = useCallback((holdToRelease: HoldState | null) => {
    if (!holdToRelease) return;
    void fetch("/api/holds", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ holdTokens: holdToRelease.tokens }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  // Going back to step 1 releases the hold — confirm first, then await the
  // release so the remounted step-1 availability read can't race it.
  const returnToTimeSlots = useCallback(() => {
    if (!hold) {
      setStep("select");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setConfirmBack(true);
  }, [hold]);

  const confirmReturnToTimeSlots = useCallback(async () => {
    setConfirmBack(false);
    if (hold) {
      try {
        await fetch("/api/holds", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ holdTokens: hold.tokens }),
          keepalive: true,
        });
      } catch {}
    }
    setHold(null);
    setStep("select");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [hold]);

  const startOver = () => {
    releaseHold(hold);
    setHold(null);
    setSelectedSlots([]);
    setSelectedDate(null);
    setLivePaddleQty(0);
    setLiveBall(false);
    setDetails(null);
    setResult(null);
    setError(null);
    setPaymentData(null);
    setStep("select");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const courtNames = useMemo(
    () => courtIds.map((id) => courts.find((c) => c.id === id)?.name ?? "Court"),
    [courtIds, courts],
  );

  const currentStepIndex = STEPS_LOCAL.findIndex((s) => s.id === step);

  // Summary data — always live, no waiting for step transitions
  const summaryData: SummaryData = useMemo(
    () => ({
      selectedDate,
      selectedSlots,
      courtNames,
      rates,
      paddleQty: livePaddleQty,
      ball: liveBall,
      isHeld: !!hold,
      holdDeadlineMs: hold?.deadlineMs ?? null,
    }),
    [selectedDate, selectedSlots, courtNames, rates, livePaddleQty, liveBall, hold],
  );

  const showSummaryPanel = step !== "confirmation";

  // Mobile sheet Continue — clicks the step's own CTA by id, so the real
  // hold/validation/submit path (including disabled states) always runs.
  const summaryAdvance: SummaryAdvance | null =
    step === "select"
      ? {
          targetId: "step1-advance",
          label: hold ? "Continue to Details" : "Hold & Continue",
          disabled: selectedSlots.length === 0,
        }
      : step === "details"
        ? { targetId: "details-advance", label: "Continue to Payment", disabled: false }
        : step === "payment"
          ? { targetId: "payment-advance", label: "Submit Booking", disabled: false }
          : null;

  return (
    <div className="space-y-6">
      {/* Stepper Navigation Indicator */}
      <nav aria-label="Booking flow progress" className="px-4 py-5">
        <div className="flex items-start justify-between">
          {STEPS_LOCAL.map((s, idx) => {
            const isCurrent = s.id === step;
            const isCompleted = idx < currentStepIndex || step === "confirmation";
            const StepIcon = s.icon;
            const isLast = idx === STEPS_LOCAL.length - 1;

            return (
              <div key={s.id} className="relative flex flex-1 flex-col items-center">
                {/* Connector line */}
                {!isLast && (
                  <div
                    className={cn(
                      "absolute top-5 left-1/2 h-0.5 w-full -translate-y-1/2 transition-colors",
                      isCompleted ? "bg-pine" : "bg-line-warm/60",
                    )}
                    aria-hidden="true"
                  />
                )}
                {/* Circle */}
                <div
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "relative z-10 flex size-10 items-center justify-center rounded-full border-2 transition-all",
                    isCurrent
                      ? "border-flame bg-flame text-white shadow-md"
                      : isCompleted
                        ? "border-pine bg-pine text-white"
                        : "border-line-warm/60 bg-cream text-warm-muted",
                  )}
                >
                  {isCompleted && !isCurrent ? (
                    <Check className="size-4" strokeWidth={3} />
                  ) : (
                    <StepIcon className="size-4" />
                  )}
                </div>
                {/* Label */}
                <span
                  className={cn(
                    "mt-2 text-center text-[11px] font-bold leading-tight",
                    isCurrent ? "text-flame" : isCompleted ? "text-pine" : "text-warm-muted",
                  )}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Active Hold Banner for Details and Payment steps */}
      {hold && (step === "details" || step === "payment") && (
        <HoldTimerBar deadlineMs={hold.deadlineMs} onExpired={handleHoldExpired} />
      )}

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-error/40 bg-error/10 px-4 py-3 text-xs sm:text-sm font-semibold text-error"
        >
          {error}
        </p>
      )}

      {/* Two-column layout for steps 1–3 */}
      {showSummaryPanel ? (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
          {/* Main content — 8 cols on desktop */}
          <div className="lg:col-span-8">
            {/* Step 1: Book (Courts → Date → Time → Equipment) */}
            {step === "select" && (
              <Step1DateTime
                initialCourts={courts}
                initialRates={rates}
                existingHold={hold}
                initialSelectedDate={selectedDate}
                initialCourtIds={courtIds}
                initialSelectedSlots={selectedSlots}
                initialPaddleQty={livePaddleQty}
                initialBall={liveBall}
                onHoldSuccess={handleHoldSuccess}
                onHoldExpired={handleHoldExpired}
                onCancel={startOver}
                onLiveUpdate={handleLiveUpdate}
              />
            )}

            {/* Step 2: Player Details (equipment pre-filled from step 1) */}
            {step === "details" && hold && (
              <div className="animate-rise">
                <DetailsForm
                  maxHours={selectedSlots.length}
                  defaultValues={
                    details ?? {
                      fullName: "",
                      email: "",
                      phone: "",
                      paddleQty: livePaddleQty,
                      paddleHours: null,
                      ball: liveBall,
                    }
                  }
                  busy={false}
                  onBack={returnToTimeSlots}
                  onSubmit={(vals) => {
                    setDetails(vals);
                    // Keep live equipment in sync with any edits made in step 2
                    setLivePaddleQty(vals.paddleQty);
                    setLiveBall(vals.ball);
                    setStep("payment");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              </div>
            )}

            {/* Step 3: Payment & Proof Upload */}
            {step === "payment" && hold && details && idempotencyKey && (
              <div className="animate-rise">
                <PaymentStep
                  holdTokens={hold.tokens}
                  summary={{
                    courtNames,
                    slotStarts: selectedSlots,
                    idempotencyKey,
                  }}
                  details={details}
                  busy={submitting}
                  setBusy={setSubmitting}
                  onBack={() => {
                    setStep("details");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  onHoldExpired={handleHoldExpired}
                  onSuccess={(res) => {
                    setResult(res);
                    setPaymentData(res);
                    setHold(null);
                    setStep("confirmation");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              </div>
            )}
          </div>

          {/* Sticky summary panel — desktop only */}
          <div className="hidden lg:col-span-4 lg:block lg:sticky lg:top-24 lg:self-start">
            <BookingSummaryDesktop data={summaryData} />
          </div>
        </div>
      ) : null}

      {/* Mobile floating summary — steps 1–3 */}
      {showSummaryPanel && <BookingSummaryMobile data={summaryData} advance={summaryAdvance} />}

      {/* Step 4: Confirmation */}
      {step === "confirmation" && result && details && (
        <ConfirmationStep
          trackingToken={result.trackingToken}
          total={result.total}
          courtNames={courtNames}
          slotStarts={selectedSlots}
          dateStr={selectedDate}
          details={details}
          rates={rates}
          onBookAnother={startOver}
        />
      )}

      <Dialog open={confirmBack} onOpenChange={(open) => { if (!open) setConfirmBack(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Release your hold?</DialogTitle>
          <DialogDescription>
            Going back to pick times releases your current hold — you&apos;ll need to select those slots again.
          </DialogDescription>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmBack(false)}>
              Stay
            </Button>
            <Button
              className="bg-flame text-white hover:bg-flame-hover"
              onClick={() => void confirmReturnToTimeSlots()}
            >
              Release &amp; go back
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
