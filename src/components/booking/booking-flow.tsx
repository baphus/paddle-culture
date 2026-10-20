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
import { formatCountdown, type CourtOption, type CourtSlotGroup } from "@/lib/courts";
import { FALLBACK_RATES, type DisplayRates } from "@/lib/pricing-display";
import { cn } from "@/lib/utils";
import { clearDraft, loadDraft, newOwnerToken, saveDraft, type BookingDraft } from "@/lib/booking/draft";
import { HOLD_GRACE_MINUTES } from "@/lib/booking/constants";
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

  // Restore an interrupted booking before first paint. Reading sessionStorage
  // in a lazy initialiser (not an effect) means a returning customer never
  // sees step 1 flash past before landing back on payment. Remember that we
  // restored, so a leftover step-1 selection hint shows and the draft is
  // flagged once.
  const [restoredDraft] = useState<BookingDraft | null>(() =>
    typeof window === "undefined" ? null : loadDraft(),
  );
  // A draft may only re-enter the flow at or beyond the details step if it
  // carries everything those steps render. Anything less falls back to the
  // booking grid (with the details kept), never to a blank screen.
  const restoredStep: Step = (() => {
    const d = restoredDraft;
    if (!d) return "select";
    if (d.step === "payment" && d.hold && d.details && d.idempotencyKey) return "payment";
    if (d.step === "details" && d.hold) return "details";
    return "select";
  })();
  const [resumedNotice, setResumedNotice] = useState<string | null>(() => {
    const d = restoredDraft;
    if (!d?.details) return null;
    if (restoredStep !== "select") return "We restored your booking — nothing was lost.";
    return "Welcome back — your details are saved. Re-confirm your slots to continue.";
  });

  // Wizard state
  const [step, setStep] = useState<Step>(restoredStep);
  const [hold, setHold] = useState<HoldState | null>(restoredDraft?.hold ?? null);
  const [confirmBack, setConfirmBack] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    restoredDraft?.selectedDate ?? null,
  );
  const [courtIds, setCourtIds] = useState<string[]>(() => {
    // The draft's courtIds are "courts actually booked" (the summary names
    // them). Drop any id the catalog no longer lists, so a deactivated or
    // renamed court can't produce a phantom "Court" entry.
    const known = new Set(initialCourts.map((c) => c.id));
    const restored = (restoredDraft?.courtIds ?? []).filter((id) => known.has(id));
    if (restored.length > 0) return restored;
    return initialCourts.length > 0 ? [initialCourts[0].id] : [];
  });
  const [selectedSlots, setSelectedSlots] = useState<string[]>(
    restoredDraft?.selectedSlots ?? [],
  );
  // Per-court slot attribution — kept for display only (summary + invoice);
  // pricing and hold/submit payloads stay keyed off the flat arrays above.
  const [slotGroups, setSlotGroups] = useState<CourtSlotGroup[]>(
    restoredDraft?.slotGroups ?? [],
  );
  // Equipment — live from step 1 panel 4, pre-fills DetailsForm
  const [livePaddleQty, setLivePaddleQty] = useState(restoredDraft?.paddleQty ?? 0);
  const [liveBall, setLiveBall] = useState(restoredDraft?.ball ?? false);
  const [details, setDetails] = useState<DetailsValues | null>(restoredDraft?.details ?? null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(
    restoredDraft?.idempotencyKey ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    trackingToken: string;
    trackingCode: string;
    total: string;
    emailDeferred?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<{ trackingToken: string; total: string } | null>(null);
  // Stable per-tab capability that ties this browsing session to its holds.
  // Stable across reloads is the whole point — it is what a refreshed page
  // uses to reclaim its own slots.
  const [ownerToken] = useState<string>(() => restoredDraft?.ownerToken ?? newOwnerToken());
  // Latest step for callbacks created once (the hold timer's onExpired).
  const stepRef = useRef<Step>(step);
  stepRef.current = step;

  // Keep the draft in step with the wizard. sessionStorage is per-tab and dies
  // with it; a reload (the banking-app round trip) is exactly what it survives.
  // Confirmation is deliberately not persisted: a completed booking must not
  // resurrect a stale wizard.
  useEffect(() => {
    if (step === "confirmation") {
      clearDraft();
      return;
    }
    saveDraft({
      v: 1,
      ownerToken,
      step,
      hold,
      selectedDate,
      courtIds,
      selectedSlots,
      slotGroups,
      paddleQty: livePaddleQty,
      ball: liveBall,
      details,
      idempotencyKey,
    });
  }, [
    step,
    ownerToken,
    hold,
    selectedDate,
    courtIds,
    selectedSlots,
    slotGroups,
    livePaddleQty,
    liveBall,
    details,
    idempotencyKey,
  ]);

  // Refresh courts and pricing live. The page already SSR'd both, so only
  // fetch when the server handed us the empty/failed fallback — otherwise
  // these two requests on every mount buy nothing.
  const needsCourtRefresh = initialCourts.length === 0;
  // Value compare, not reference — a genuinely loaded rate card never equals
  // the fallback on all four fields.
  const needsRateRefresh =
    initialRates.morning === FALLBACK_RATES.morning &&
    initialRates.evening === FALLBACK_RATES.evening &&
    initialRates.paddle === FALLBACK_RATES.paddle &&
    initialRates.ball === FALLBACK_RATES.ball;

  useEffect(() => {
    if (!needsCourtRefresh) return;
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
  }, [needsCourtRefresh]);

  useEffect(() => {
    if (!needsRateRefresh) return;
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
            courtRates: b.courtRates ?? [],
            currency: "PHP",
          });
        }
      })
      .catch(() => {});
  }, [needsRateRefresh]);

  /** Refresh the hold after POST /api/holds/reclaim handed it back. */
  const handleHoldReclaimed = useCallback(
    (refreshed: { tokens: string[]; deadlineMs: number; expiresAt: string }) => {
      setHold((prev) =>
        prev
          ? {
              ...prev,
              tokens: refreshed.tokens,
              deadlineMs: refreshed.deadlineMs,
              expiresAt: refreshed.expiresAt,
            }
          : prev,
      );
      // A revived hold has brand-new tokens. The old idempotency key belonged
      // to a submit attempt against the dead tokens; reusing it could return a
      // prior result (or IDEMPOTENCY_IN_PROGRESS) for what is now a different
      // hold. Mint a fresh key so this attempt is its own submission.
      setIdempotencyKey(crypto.randomUUID());
      setError(null);
    },
    [],
  );

  // A draft can be restored with a hold that has already lapsed — the customer
  // was away longer than the 10-minute window. Try to revive it silently on
  // mount (same rules as the explicit button) so they land back on payment with
  // working slots instead of an error banner. If that fails they still keep
  // their details and land on step 1 with a plain explanation.
  const restoredRan = useRef(false);
  useEffect(() => {
    if (restoredRan.current) return;
    restoredRan.current = true;
    const restoredHold = restoredDraft?.hold;
    if (!restoredHold || !restoredDraft?.details) return;
    if (new Date(restoredHold.expiresAt).getTime() > Date.now()) return;
    if (stepRef.current === "select") return;
    setStep("payment");
    void fetch("/api/holds/reclaim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerToken: restoredDraft.ownerToken }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { code?: string } }
            | null;
          const code = body?.error?.code;
          setHold(null);
          setError(
            code === "SLOT_TAKEN"
              ? "Someone else took one of your slots while you were away. Please pick a different time."
              : "Your slots were released while you were away. Please pick your times again — if you've already sent the payment, contact us with your reference.",
          );
          setStep("select");
          return;
        }
        const body = (await res.json()) as {
          holds: { holdToken: string }[];
          expiresAt: string;
          deadlineMs: number;
        };
        handleHoldReclaimed({
          tokens: body.holds.map((h) => h.holdToken),
          deadlineMs: body.deadlineMs,
          expiresAt: body.expiresAt,
        });
        toast.success("Welcome back — your slots are held again. Finish your booking below.", {
          duration: 8000,
        });
      })
      .catch(() => {
        // Offline: leave the payment step up; the restore button is there.
      });
  }, [restoredDraft, handleHoldReclaimed]);

  /**
   * Step 1 reset its attempt (Back, Cancel, Clear, date change). The wizard
   * mirrors that state for the summary, so it has to drop it here too — a
   * summary still listing a date and a total after someone hit Back would offer
   * to book hours they just walked away from. An empty court list is what makes
   * the summary disappear entirely.
   */
  const handleClearSelection = useCallback(
    (opts?: { keepDate?: boolean }) => {
      setSelectedSlots([]);
      setSlotGroups([]);
      setCourtIds([]);
      if (opts?.keepDate) return;
      setSelectedDate(null);
      setLivePaddleQty(0);
      setLiveBall(false);
    },
    [],
  );

  const handleHoldExpired = useCallback(() => {
    // On the payment step the customer is mid-payment: money may already be on
    // its way. Do NOT wipe their hold and dump them at step 1 — the payment
    // step shows a "hold my slots again" restore instead (POST
    // /api/holds/reclaim), which keeps their details, proof and timer alive.
    if (stepRef.current === "payment") {
      toast.error("Your hold ran out. Restore your slots to finish — we kept your payment proof.", {
        duration: 8000,
      });
      return;
    }
    setHold(null);
    handleClearSelection();
    setError("Your hold expired. Please select your slots and hold again.");
    toast.error("Your hold expired. Please select your slots and hold again.", {
      duration: 8000,
    });
    setStep("select");
  }, [handleClearSelection]);

  const handleHoldSuccess = useCallback(
    (newHold: HoldState, newCourtIds: string[], newSlots: string[], date: string, paddleQty = 0, ball = false, groups: CourtSlotGroup[] = []) => {
      setError(null);
      setHold(newHold);
      setCourtIds(newCourtIds);
      setSelectedSlots(newSlots);
      setSlotGroups(groups);
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
    (update: { courtIds: string[]; selectedDate: string | null; selectedSlots: string[]; paddleQty: number; ball: boolean; slotGroups: CourtSlotGroup[] }) => {
      setCourtIds(update.courtIds);
      setSelectedDate(update.selectedDate);
      setSelectedSlots(update.selectedSlots);
      setSlotGroups(update.slotGroups);
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
    handleClearSelection();
    setStep("select");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [hold, handleClearSelection]);

  const startOver = () => {
    releaseHold(hold);
    clearDraft();
    setResumedNotice(null);
    setHold(null);
    setSelectedSlots([]);
    setSlotGroups([]);
    setSelectedDate(null);
    setLivePaddleQty(0);
    setLiveBall(false);
    setDetails(null);
    setIdempotencyKey(null);
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
      slotGroups,
      rates,
      paddleQty: livePaddleQty,
      ball: liveBall,
      isHeld: !!hold,
      holdDeadlineMs: hold?.deadlineMs ?? null,
      canClearSlots: step === "select" && selectedSlots.length > 0,
    }),
    [selectedDate, selectedSlots, courtNames, slotGroups, rates, livePaddleQty, liveBall, hold, step],
  );

  const showSummaryPanel = step !== "confirmation";
  // Summary exists once there's a date, courts or slots to talk about. Both
  // summary surfaces check the same things; this keeps the desktop grid in step.
  const hasSummaryContent =
    !!selectedDate || selectedSlots.length > 0 || courtNames.length > 0;

  // Mobile sheet Continue — clicks the step's own CTA by id, so the real
  // hold/validation/submit path (including disabled states) always runs.
  const summaryAdvance: SummaryAdvance | null =
    step === "select"
      ? {
          targetId: "step1-advance",
          label: hold ? "Continue to Details" : "Continue",
          disabled: selectedSlots.length === 0,
        }
      : step === "details"
        ? { targetId: "details-advance", label: "Payment", disabled: false }
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

      {resumedNotice && !error && (
        <p
          role="status"
          className="rounded-2xl border border-pine/30 bg-oat/60 px-4 py-3 text-xs sm:text-sm font-semibold text-pine"
        >
          {resumedNotice}
        </p>
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
          {/* Main content — 8 cols beside the summary, full width without it */}
          <div className={cn("lg:col-span-8", !hasSummaryContent && "lg:col-span-12")}>
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
                ownerToken={ownerToken}
                onHoldSuccess={handleHoldSuccess}
                onHoldExpired={handleHoldExpired}
                onCancel={startOver}
                onClearSelection={handleClearSelection}
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
                  ownerToken={hold.ownerToken ?? ownerToken}
                  summary={{
                    courtNames,
                    slotStarts: selectedSlots,
                    idempotencyKey,
                    holdDeadlineMs: hold.deadlineMs,
                    reclaimableUntilMs:
                      new Date(hold.expiresAt).getTime() + HOLD_GRACE_MINUTES * 60_000,
                  }}
                  details={details}
                  busy={submitting}
                  setBusy={setSubmitting}
                  onBack={() => {
                    setStep("details");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  onHoldExpired={handleHoldExpired}
                  onHoldReclaimed={handleHoldReclaimed}
                  onSuccess={(res) => {
                    setResult(res);
                    setPaymentData(res);
                    setHold(null);
                    setStep("confirmation");
                    clearDraft();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              </div>
            )}
          </div>

          {/* Sticky summary panel — desktop only. When it has nothing to show
              (fresh visit, or a Back just cleared the attempt) the main column
              takes the full width instead of leaving an empty 4-col gutter. */}
          {hasSummaryContent ? (
            <div className="hidden lg:col-span-4 lg:block lg:sticky lg:top-24 lg:self-start">
              <BookingSummaryDesktop data={summaryData} />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Mobile floating summary — steps 1–3 */}
      {showSummaryPanel && <BookingSummaryMobile data={summaryData} advance={summaryAdvance} />}

      {/* Step 4: Confirmation */}
      {step === "confirmation" && result && details && (
        <ConfirmationStep
          trackingToken={result.trackingToken}
          trackingCode={result.trackingCode}
          total={result.total}
          emailDeferred={result.emailDeferred ?? false}
          courtNames={courtNames}
          slotStarts={selectedSlots}
          slotGroups={slotGroups}
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
