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
    // Best-effort release: the server still expires holds on its own clock if
    // the request is interrupted, but navigating back should free them now.
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

  // Live estimate for payment step
  const estimate = useMemo(() => {
    let courtTotal = 0;
    for (const iso of selectedSlots) {
      const d = new Date(iso);
      const isEvening = d.getUTCHours() >= 10 || d.getUTCHours() < 19; // UTC for Manila 18:00+
      const rate = isEvening ? rates.evening : rates.morning;
      courtTotal += rate * courtIds.length;
    }
    let gearTotal = 0;
    if (details) {
      if (details.paddleQty > 0) {
        const hours = details.paddleHours ?? selectedSlots.length;
        gearTotal += details.paddleQty * hours * rates.paddle;
      }
      if (details.ball) {
        gearTotal += rates.ball;
      }
    }
    return courtTotal + gearTotal;
  }, [selectedSlots, courtIds.length, rates, details]);

  const currentStepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="space-y-6">
      {/* Stepper Navigation Indicator */}
      <nav aria-label="Booking flow progress" className="rounded-2xl border border-line-warm/60 bg-white p-3 shadow-xs">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {STEPS.map((s, idx) => {
            const isCurrent = s.id === step;
            const isCompleted = idx < currentStepIndex || step === "done";
            const StepIcon = s.icon;

            return (
              <div
                key={s.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all",
                  isCurrent
                    ? "bg-flame text-white shadow-xs"
                    : isCompleted
                      ? "bg-oat/50 text-pine"
                      : "text-warm-muted opacity-60",
                )}
              >
                <div
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-black",
                    isCurrent
                      ? "bg-white/20 text-white"
                      : isCompleted
                        ? "bg-pine text-white"
                        : "bg-cream text-warm-muted",
                  )}
                >
                  {isCompleted && !isCurrent ? <Check className="size-4" /> : s.number}
                </div>
                <div className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-xs font-extrabold leading-tight",
                      isCurrent ? "text-white" : isCompleted ? "text-pine" : "text-ink",
                    )}
                  >
                    {s.label}
                  </span>
                  <span
                    className={cn(
                      "hidden truncate text-[10px] leading-tight sm:block",
                      isCurrent ? "text-white/80" : "text-warm-muted",
                    )}
                  >
                    {s.description}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Active Hold Banner for Details and Payment steps */}
      {hold && (step === "details" || step === "payment") && (
        <HoldTimerBar deadlineMs={hold.deadlineMs} onExpired={handleHoldExpired} />
      )}

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
            estimate={estimate}
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

      {/* Step 4: Confirmation & Instant Tracking Pass */}
      {step === "done" && result && details && (
        <ConfirmationStep
          trackingToken={result.trackingToken}
          total={result.total}
          courtNames={courtNames}
          slotStarts={selectedSlots}
          dateStr={selectedDate}
          details={details}
          onBookAnother={startOver}
        />
      )}
    </div>
  );
}
