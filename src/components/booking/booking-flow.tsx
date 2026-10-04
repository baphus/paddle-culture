"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MAX_SLOTS_PER_BOOKING } from "@/lib/booking/constants";
import { timeBandFor } from "@/lib/booking/slots";
import {
  formatCountdown,
  formatSlotRange,
  manilaTodayStr,
  maxBookableDateStr,
  type CourtOption,
} from "@/lib/courts";
import DetailsForm, { type DetailsValues } from "./details-form";
import PaymentStep from "./payment-step";

// Frozen rate card (ADR-02) — client ESTIMATE only; the server recalculates
// the authoritative total at submit and never trusts this number.
const RATE_MORNING = 150;
const RATE_EVENING = 200;
const RATE_PADDLE_PER_HOUR = 25;
const RATE_BALL_FLAT = 15;

type Step = "select" | "details" | "payment" | "done";

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

interface HoldState {
  tokens: string[];
  deadlineMs: number;
  expiresAt: string;
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

function estimateTotal(
  slotStarts: string[],
  courtCount: number,
  paddleQty: number,
  paddleHours: number | null,
  ball: boolean,
): number {
  let total = 0;
  for (const s of slotStarts) {
    total += (timeBandFor(new Date(s)) === "evening" ? RATE_EVENING : RATE_MORNING) * courtCount;
  }
  if (paddleQty > 0) total += RATE_PADDLE_PER_HOUR * paddleQty * (paddleHours ?? slotStarts.length);
  if (ball) total += RATE_BALL_FLAT;
  return total;
}

// Hand-written hold countdown (ADR-10: no countdown lib). Cosmetic only —
// the server enforces expires_at on every read. Never auto-submits: on
// expiry it releases UI state and asks the user to re-hold.
function HoldCountdown({
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
    const t = setInterval(() => {
      const r = deadlineMs - Date.now();
      setRemaining(r);
      if (r <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpired();
      }
    }, 500);
    return () => clearInterval(t);
  }, [deadlineMs, onExpired]);
  const urgent = remaining < 120_000;
  return (
    <span className={urgent ? "font-semibold text-destructive" : "font-semibold"}>
      Hold expires in {formatCountdown(remaining)}
    </span>
  );
}

export default function BookingFlow({ initialCourts }: { initialCourts: CourtOption[] }) {
  const today = useMemo(() => manilaTodayStr(), []);
  const maxDate = useMemo(() => maxBookableDateStr(), []);
  const [courts, setCourts] = useState<CourtOption[]>(initialCourts);
  const [date, setDate] = useState(today);
  const [courtIds, setCourtIds] = useState<string[]>(() => initialCourts.map((c) => c.id));
  const [avail, setAvail] = useState<CourtAvailability[] | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [hold, setHold] = useState<HoldState | null>(null);
  const [holding, setHolding] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [details, setDetails] = useState<DetailsValues | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ trackingToken: string; total: string } | null>(null);

  // Refresh the court list live (read-only); keep the server-rendered list
  // as fallback when the DB is unreachable.
  useEffect(() => {
    fetch("/api/courts")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { courts?: CourtOption[] } | null) => {
        if (b?.courts && b.courts.length > 0) {
          setCourts(b.courts);
          setCourtIds((prev) =>
            prev.length > 0 ? prev.filter((id) => b.courts!.some((c) => c.id === id)) : b.courts!.map((c) => c.id),
          );
        }
      })
      .catch(() => {});
  }, []);

  const courtsKey = useMemo(() => [...courtIds].sort().join(","), [courtIds]);

  // Availability read (single grid source: 06:00–03:00+1d from the server).
  useEffect(() => {
    if (courtIds.length === 0 || !date) {
      setAvail(null);
      return;
    }
    const ids = [...courtIds].sort();
    const ctrl = new AbortController();
    setLoadingAvail(true);
    const qs = new URLSearchParams({ date });
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
      .then((b) => setAvail(b.courts))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        toast.error(e instanceof Error ? e.message : "Could not load availability.");
        setAvail(null);
      })
      .finally(() => setLoadingAvail(false));
    return () => ctrl.abort();
  }, [date, courtsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const slotByCourt = useMemo(() => {
    const m = new Map<string, Map<string, AvailabilitySlot>>();
    for (const c of avail ?? []) {
      m.set(c.courtId, new Map(c.slots.map((s) => [s.start, s])));
    }
    return m;
  }, [avail]);

  const selectedSorted = useMemo(
    () => [...selected].sort((a, b) => new Date(a).getTime() - new Date(b).getTime()),
    [selected],
  );

  function toggleSlot(startIso: string) {
    if (hold) return;
    if (courtIds.length === 0) {
      toast.error("Select at least one court first.");
      return;
    }
    const now = Date.now();
    if (selected.includes(startIso)) {
      setSelected(selected.filter((s) => s !== startIso));
      return;
    }
    // Must be open on EVERY selected court (same slots across courts).
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
    const next = [...selected, startIso]
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
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
      toast.error("Select at least one court first.");
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
      setHold({
        tokens: body.holds.map((h) => h.holdToken),
        deadlineMs: body.deadlineMs,
        expiresAt: body.expiresAt,
      });
      setIdempotencyKey(crypto.randomUUID());
      setStep("details");
      toast.success("Slots held — complete your details before the timer ends.");
    } catch {
      toast.error("Could not hold those slots. Check your connection and retry.");
    } finally {
      setHolding(false);
    }
  }

  const handleHoldExpired = useCallback(() => {
    setHold(null);
    setStep("select");
    toast.error("Your hold expired — tap “Hold these slots” again to continue.", {
      duration: 8000,
    });
  }, []);

  function startOver() {
    // Client state only: the server hold (if any) expires on its own clock.
    setHold(null);
    setSelected([]);
    setDetails(null);
    setResult(null);
    setStep("select");
  }

  const courtNames = useMemo(
    () =>
      courtIds.map((id) => courts.find((c) => c.id === id)?.name ?? "Court"),
    [courtIds, courts],
  );

  const estimate = useMemo(() => {
    if (!details) return 0;
    return estimateTotal(
      selectedSorted,
      courtIds.length,
      details.paddleQty,
      details.paddleQty > 0 ? details.paddleHours : null,
      details.ball,
    );
  }, [details, selectedSorted, courtIds.length]);

  const steps: Array<{ id: Step; label: string }> = [
    { id: "select", label: "1. Slots" },
    { id: "details", label: "2. Details" },
    { id: "payment", label: "3. Pay" },
    { id: "done", label: "4. Done" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" aria-label="Booking progress">
        {steps.map((s) => (
          <Badge
            key={s.id}
            variant={s.id === step ? "default" : "secondary"}
          >
            {s.label}
          </Badge>
        ))}
      </div>

      {hold && step !== "done" ? (
        <p role="timer" aria-live="polite" className="rounded-lg border bg-muted p-3 text-sm">
          <HoldCountdown deadlineMs={hold.deadlineMs} onExpired={handleHoldExpired} /> — after
          expiry your selection is kept but you must re-hold. We never submit automatically.
        </p>
      ) : null}

      {step === "select" ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="date">Date (same-day allowed)</Label>
              <Input
                id="date"
                type="date"
                min={today}
                max={maxDate}
                value={date}
                disabled={holding}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v && v < today) {
                    toast.error("Past dates can't be booked. Pick today or later.");
                    return;
                  }
                  setDate(v);
                  setSelected([]);
                }}
              />
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Courts (same hours on each)</legend>
              {courts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No courts listed right now — check back soon.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {courts.map((c) => (
                    <label key={c.id} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-current"
                        checked={courtIds.includes(c.id)}
                        disabled={holding}
                        onChange={(e) => {
                          setCourtIds(
                            e.target.checked
                              ? [...courtIds, c.id]
                              : courtIds.filter((id) => id !== c.id),
                          );
                          setSelected([]);
                        }}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          </div>

          {loadingAvail ? (
            <p className="text-sm text-muted-foreground">Loading slots…</p>
          ) : avail ? (
            <div className="space-y-4">
              {courtIds.map((id) => {
                const court = courts.find((c) => c.id === id);
                const slots = slotByCourt.get(id);
                if (!slots) return null;
                const now = Date.now();
                return (
                  <div key={id} className="space-y-2">
                    <h3 className="font-semibold">{court?.name ?? "Court"}</h3>
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-7">
                      {[...slots.values()].map((s) => {
                        const state = cellState(s, now);
                        const isSel = selected.includes(s.start);
                        return (
                          <button
                            key={s.start}
                            type="button"
                            disabled={state !== "open" || holding}
                            onClick={() => toggleSlot(s.start)}
                            aria-pressed={isSel}
                            title={`${formatSlotRange(s.start)} — ${CELL_LABEL[state]}`}
                            className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                              isSel
                                ? "border-primary bg-primary text-primary-foreground"
                                : state === "open"
                                  ? "bg-background hover:bg-muted"
                                  : "cursor-not-allowed bg-muted text-muted-foreground"
                            }`}
                          >
                            <span className="block">{formatSlotRange(s.start)}</span>
                            <span className="block font-normal opacity-80">
                              {isSel ? "Picked" : CELL_LABEL[state]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {selectedSorted.length > 0 ? (
            <p className="text-sm">
              Picked {selectedSorted.length} hour(s) × {courtIds.length} court(s) ={" "}
              {selectedSorted.length * courtIds.length} court-hours:{" "}
              {selectedSorted.map(formatSlotRange).join(", ")}
            </p>
          ) : null}

          <Button
            type="button"
            onClick={createHold}
            disabled={holding || selectedSorted.length === 0 || courtIds.length === 0}
          >
            {holding ? "Holding…" : "Hold these slots"}
          </Button>
        </div>
      ) : null}

      {step === "details" && hold ? (
        <DetailsForm
          maxHours={selectedSorted.length}
          defaultValues={details ?? undefined}
          busy={false}
          onBack={() => setStep("select")}
          onSubmit={(v) => {
            setDetails(v);
            setStep("payment");
          }}
        />
      ) : null}

      {step === "payment" && hold && details && idempotencyKey ? (
        <PaymentStep
          holdTokens={hold.tokens}
          summary={{
            courtNames,
            slotStarts: selectedSorted,
            idempotencyKey,
          }}
          details={details}
          estimate={estimate}
          busy={submitting}
          setBusy={setSubmitting}
          onBack={() => setStep("details")}
          onHoldExpired={handleHoldExpired}
          onSuccess={(r) => {
            setResult(r);
            setHold(null);
            setStep("done");
          }}
        />
      ) : null}

      {step === "done" && result ? (
        <SuccessPanel
          trackingToken={result.trackingToken}
          total={result.total}
          onBookAnother={startOver}
        />
      ) : null}
    </div>
  );
}

function SuccessPanel({
  trackingToken,
  total,
  onBookAnother,
}: {
  trackingToken: string;
  total: string;
  onBookAnother: () => void;
}) {
  const [url, setUrl] = useState(`/track/${trackingToken}`);
  useEffect(() => {
    setUrl(`${window.location.origin}/track/${trackingToken}`);
  }, [trackingToken]);
  return (
    <div className="space-y-4 rounded-lg border p-6 text-center">
      <h2 className="text-xl font-semibold">Booking received!</h2>
      <p className="text-sm text-muted-foreground">
        Total: ₱{total}. We emailed your confirmation — the owner will verify your payment and
        you&apos;ll get the approval email once it&apos;s confirmed.
      </p>
      <div className="flex justify-center">
        <QRCodeSVG value={url} size={200} />
      </div>
      <p>
        <a href={url} className="text-sm font-medium underline">
          {url}
        </a>
      </p>
      <p className="text-sm text-muted-foreground">
        Save this tracking link + QR — it&apos;s how you check your booking status.
      </p>
      <Button type="button" variant="outline" onClick={onBookAnother}>
        Book another slot
      </Button>
    </div>
  );
}
