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
  BookingSummaryDesktop,
  BookingSummaryMobile,
  type SummaryData,
} from "./booking-summary-panel";

type Step = "select" | "details" | "payment" | "done";

interface StepItem {
  id: Step;
  number: number;
  label: string;
  description: string;
  icon: typeof Calendar;
}

const STEPS: StepItem[] = [
  {
    id: "select",
    number: 1,
    label: "Date & Time",
    description: "Choose court & hours",
    icon: Calendar,
  },
  {
    id: "details",
    number: 2,
    label: "Player Details",
    description: "Contact & gear rental",
    icon: User,
  },
  {
    id: "payment",
    number: 3,
    label: "Payment & Proof",
    description: "GCash / Bank transfer",
    icon: CreditCard,
  },
  {
    id: "done",
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [courtIds, setCourtIds] = useState<string[]>(() =>
    initialCourts.length > 0 ? [initialCourts[0].id] : [],
  );
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [details, setDetails] = useState<DetailsValues | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ trackingToken: string; total: string } | null>(null);

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
    setStep("select");
    toast.error("Your hold expired. Please select your slots and hold again.", {
      duration: 8000,
    });
  }, []);

  const handleHoldSuccess = useCallback(
    (newHold: HoldState, newCourtIds: string[], newSlots: string[], date: string) => {
      setHold(newHold);
      setCourtIds(newCourtIds);
      setSelectedSlots(newSlots);
      setSelectedDate(date);
      setIdempotencyKey(crypto.randomUUID());
      setStep("details");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [],
  );

  const releaseHold = useCallback((holdToRelease: HoldState | null) => {
    if (!holdToRelease) return;
    void fetch("/api/holds", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ holdTokens: holdToRelease.tokens }),
    });
  }, []);

  const returnToTimeSlots = useCallback(() => {
    releaseHold(hold);
    setHold(null);
    setStep("select");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [hold, releaseHold]);

  const startOver = () => {
    releaseHold(hold);
    setHold(null);
    setSelectedSlots([]);
    setSelectedDate(null);
    setDetails(null);
    setResult(null);
    setStep("select");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const courtNames = useMemo(
    () => courtIds.map((id) => courts.find((c) => c.id === id)?.name ?? "Court"),
    [courtIds, courts],
  );

  const currentStepIndex = STEPS.findIndex((s) => s.id === step);

  // Summary data fed to the floating panel (steps 1–3 only)
  const summaryData: SummaryData = useMemo(
    () => ({
      selectedDate,
      selectedSlots,
      courtNames,
      rates,
      details,
      isHeld: !!hold,
    }),
    [selectedDate, selectedSlots, courtNames, rates, details, hold],
  );

  // Whether the floating summary panel should be shown
  const showSummaryPanel = step !== "done";

  return (
    <div className="space-y-6">
      {/* Stepper Navigation Indicator */}
      <nav aria-label="Booking flow progress" className="px-4 py-5">
        <div className="flex items-start justify-between">
          {STEPS.map((s, idx) => {
            const isCurrent = s.id === step;
            const isCompleted = idx < currentStepIndex || step === "done";
            const StepIcon = s.icon;
            const isLast = idx === STEPS.length - 1;

            return (
              <div key={s.id} className="relative flex flex-1 flex-col items-center">
                {/* Connector line (right side, skip on last item) */}
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
                    isCurrent
                      ? "text-flame"
                      : isCompleted
                        ? "text-pine"
                        : "text-warm-muted",
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

      {/* Two-column layout for steps 1–3: main content + sticky summary */}
      {showSummaryPanel ? (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
          {/* Main content — 8 cols on desktop */}
          <div className="lg:col-span-8">
            {/* Step 1: Select Date, Time & Court */}
            {step === "select" && (
              <Step1DateTime
                initialCourts={courts}
                initialRates={rates}
                existingHold={hold}
                initialSelectedDate={selectedDate}
                initialCourtIds={courtIds}
                initialSelectedSlots={selectedSlots}
                onHoldSuccess={handleHoldSuccess}
                onHoldExpired={handleHoldExpired}
                onCancel={startOver}
              />
            )}

            {/* Step 2: Player Details & Equipment Rentals */}
            {step === "details" && hold && (
              <div className="animate-rise">
                <DetailsForm
                  maxHours={selectedSlots.length}
                  defaultValues={details ?? undefined}
                  busy={false}
                  onBack={returnToTimeSlots}
                  onSubmit={(vals) => {
                    setDetails(vals);
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
                    setHold(null);
                    setStep("done");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              </div>
            )}
          </div>

          {/* Sticky summary panel — 4 cols on desktop, hidden on mobile */}
          <div className="hidden lg:col-span-4 lg:block lg:sticky lg:top-24 lg:self-start">
            <BookingSummaryDesktop data={summaryData} />
          </div>
        </div>
      ) : null}

      {/* Mobile floating summary — shown on steps 1–3 */}
      {showSummaryPanel && <BookingSummaryMobile data={summaryData} />}

      {/* Step 4: Confirmation — full width, no sidebar */}
      {step === "done" && result && details && (
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
    </div>
  );
}
