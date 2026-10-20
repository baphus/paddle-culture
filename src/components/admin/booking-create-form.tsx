"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  ImagePlus,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PROOF_CLIENT_ACCEPT, precheckProofFile } from "@/lib/proof-client";
import { formatSlotRange } from "@/lib/courts";
import { suggestEmailDomain } from "@/lib/booking/email";

// ── Shapes mirrored from the server (no server-only imports here) ────────────

interface CourtOption {
  id: string;
  name: string;
}

interface DisplayRates {
  morning: number;
  evening: number;
  paddle: number;
  ball: number;
  currency: "PHP";
}

type SlotState = "free" | "held" | "pending" | "approved";

interface AvailabilitySlot {
  index: number;
  start: string;
  state: SlotState;
  bookable: boolean;
}

interface CourtAvailability {
  courtId: string;
  slots: AvailabilitySlot[];
}

/** One month of the month endpoint: date → courtId → slots. */
type MonthDays = Record<string, Record<string, AvailabilitySlot[]>>;

interface PickedSlot {
  courtId: string;
  courtName: string;
  slotStart: string;
}

interface ProofRef {
  path: string;
  mime: string;
  bytes: number;
}

const MANILA_DAY_START_HOUR = 6;
const MAX_SLOTS = 12;

/** Mirrors FALLBACK_RATES — the SSR'd rates equal these only when the DB read
 *  failed, which is the one case worth refetching from the client. */
const FALLBACK_RATES: DisplayRates = {
  morning: 150,
  evening: 200,
  paddle: 100,
  ball: 15,
  currency: "PHP",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

async function readError(res: Response, fallback: string) {
  try {
    const json = (await res.json()) as { error?: { code?: string; message?: string } };
    return {
      code: json.error?.code ?? "INTERNAL",
      message: json.error?.message ?? fallback,
    };
  } catch {
    return { code: "INTERNAL", message: fallback };
  }
}

/** Today's date in Asia/Manila as YYYY-MM-DD (display hint only; the server
 *  re-checks the real horizon and future-ness). */
function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function pesoOf(n: number): string {
  const fixed = n.toFixed(2);
  return `₱${fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}`;
}

function slotKey(courtId: string, slotStart: string): string {
  return `${courtId}@${slotStart}`;
}

/** Hour of the slot in Manila wall-clock, used for the morning/evening band. */
function manilaHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Manila",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  );
}

function isEvening(iso: string): boolean {
  return manilaHour(iso) >= 12;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function BookingCreateForm({
  adminEmail,
  initialCourts,
  initialRates,
}: {
  adminEmail: string;
  initialCourts: CourtOption[];
  initialRates: DisplayRates;
}) {
  const router = useRouter();

  const [courts, setCourts] = useState<CourtOption[] | null>(
    initialCourts.length > 0 ? initialCourts : null,
  );
  const [rates, setRates] = useState<DisplayRates | null>(initialRates);
  const [date, setDate] = useState(manilaToday);
  // Month payloads keyed "courtIds|YYYY-MM". A day switch inside a cached month
  // is a plain lookup, so arrowing through dates costs no requests.
  const [monthCache, setMonthCache] = useState<Map<string, MonthDays>>(
    () => new Map(),
  );
  const [availability, setAvailability] = useState<Record<string, CourtAvailability>>({});
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);

  const [picked, setPicked] = useState<PickedSlot[]>([]);
  const [notify, setNotify] = useState(true);
  const [description, setDescription] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const emailSuggestion = useMemo(() => suggestEmailDomain(email), [email]);
  const [phone, setPhone] = useState("");
  const [paddleQty, setPaddleQty] = useState(0);
  const [ball, setBall] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [proof, setProof] = useState<ProofRef | null>(null);
  // One key per form mount: a double-submit or a retry after a timeout
  // collapses into the same booking, same as the customer path.
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const [submitting, setSubmitting] = useState(false);

  // ── Load courts + display rates once ─────────────────────────────────────
  // The page SSR'd both. Only refetch what came back empty/fallback, so a
  // healthy render costs zero requests on mount.
  const needsCourtRefresh = initialCourts.length === 0;
  // Value compare, not reference — a real rate card never matches all four.
  const needsRateRefresh =
    initialRates.morning === FALLBACK_RATES.morning &&
    initialRates.evening === FALLBACK_RATES.evening &&
    initialRates.paddle === FALLBACK_RATES.paddle &&
    initialRates.ball === FALLBACK_RATES.ball;

  useEffect(() => {
    if (!needsCourtRefresh) return;
    fetch("/api/courts")
      .then(async (r) => {
        if (!r.ok) throw new Error("courts");
        return ((await r.json()) as { courts: CourtOption[] }).courts;
      })
      .then((c) => setCourts(c))
      .catch(() => toast.error("Could not load courts."));
  }, [needsCourtRefresh]);

  // Independent of courts: a good court list with a fallback rate card is a
  // real state, and it still needs the live prices.
  useEffect(() => {
    if (!needsRateRefresh) return;
    fetch("/api/pricing")
      .then(async (r) => {
        if (!r.ok) throw new Error("pricing");
        return (await r.json()) as DisplayRates;
      })
      .then((r) => setRates(r))
      .catch(() => toast.error("Could not load rates."));
  }, [needsRateRefresh]);

  // ── Live availability for the chosen date ────────────────────────────────
  // Fetch whole months (5 DB calls each) instead of one day at a time, then
  // slice the chosen date out of the cache.
  const courtIdsKey = (courtList: CourtOption[]) =>
    courtList
      .map((c) => c.id)
      .sort()
      .join(",");

  const loadMonth = useCallback(
    async (month: string, courtList: CourtOption[]) => {
      const cacheKey = `${courtIdsKey(courtList)}|${month}`;
      setAvailLoading(true);
      setAvailError(null);
      try {
        const params = new URLSearchParams({ month });
        for (const c of courtList) params.append("courtId", c.id);
        const res = await fetch(`/api/availability/month?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const e = await readError(res, "Could not load availability.");
          setAvailError(e.message);
          return;
        }
        const json = (await res.json()) as { days: MonthDays };
        setMonthCache((prev) => new Map(prev).set(cacheKey, json.days));
      } catch {
        setAvailError("Could not load availability.");
      } finally {
        setAvailLoading(false);
      }
    },
    [],
  );

  // Keyed on the month, not the day: arrowing between dates inside a loaded
  // month never refetches.
  const selectedMonth = date.slice(0, 7);
  const cacheKey = courts ? `${courtIdsKey(courts)}|${selectedMonth}` : "";

  useEffect(() => {
    if (!courts || courts.length === 0) return;
    if (monthCache.has(cacheKey)) return;
    void loadMonth(selectedMonth, courts);
  }, [courts, selectedMonth, cacheKey, monthCache, loadMonth]);

  // Slice the chosen day out of the cached month.
  useEffect(() => {
    if (!courts || courts.length === 0) return;
    const days = monthCache.get(cacheKey);
    if (!days) return;
    const day = days[date];
    if (!day) {
      setAvailability({});
      return;
    }
    const byCourt: Record<string, CourtAvailability> = {};
    for (const c of courts) byCourt[c.id] = { courtId: c.id, slots: day[c.id] ?? [] };
    setAvailability(byCourt);
  }, [courts, cacheKey, date, monthCache]);

  // Picks belong to a date — drop them when the date changes so the grid and
  // the total can never disagree.
  useEffect(() => {
    setPicked((prev) =>
      prev.filter((p) => {
        const d = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Manila",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(p.slotStart));
        return d === date;
      }),
    );
  }, [date]);

  // ── Derived grid ─────────────────────────────────────────────────────────
  const slotStarts = useMemo(() => {
    const anyCourt = Object.values(availability)[0];
    if (anyCourt) return anyCourt.slots.map((s) => s.start);
    // Fallback skeleton rows before availability arrives.
    const base = new Date(`${date}T00:00:00+08:00`);
    return Array.from({ length: 21 }, (_, i) => {
      const d = new Date(base);
      d.setHours(MANILA_DAY_START_HOUR + i, 0, 0, 0);
      return d.toISOString();
    });
  }, [availability, date]);

  const slotStateFor = useCallback(
    (courtId: string, slotStart: string): AvailabilitySlot | null =>
      availability[courtId]?.slots.find((s) => s.start === slotStart) ?? null,
    [availability],
  );

  const pickedKeys = useMemo(
    () => new Set(picked.map((p) => slotKey(p.courtId, p.slotStart))),
    [picked],
  );

  const toggleSlot = useCallback(
    (court: CourtOption, slotStart: string) => {
      const key = slotKey(court.id, slotStart);
      setPicked((prev) => {
        if (prev.some((p) => slotKey(p.courtId, p.slotStart) === key)) {
          return prev.filter((p) => slotKey(p.courtId, p.slotStart) !== key);
        }
        if (prev.length >= MAX_SLOTS) {
          toast.error(`A booking can hold at most ${MAX_SLOTS} slots.`);
          return prev;
        }
        return [...prev, { courtId: court.id, courtName: court.name, slotStart }];
      });
    },
    [],
  );

  // ── Live total preview (client-side estimate; the server recalculates) ───
  const estimate = useMemo(() => {
    if (!rates) return null;
    const courtTotal = picked.reduce(
      (sum, p) => sum + (isEvening(p.slotStart) ? rates.evening : rates.morning),
      0,
    );
    const hours = picked.length;
    const paddleHours = paddleQty > 0 ? hours : 0;
    const paddleTotal = paddleQty * paddleHours * rates.paddle;
    const ballTotal = ball ? rates.ball : 0;
    return {
      hours,
      courtTotal,
      paddleHours,
      paddleTotal,
      ballTotal,
      total: courtTotal + paddleTotal + ballTotal,
    };
  }, [picked, rates, paddleQty, ball]);

  // ── Proof upload (optional) ──────────────────────────────────────────────
  async function handleFile(file: File) {
    const pre = precheckProofFile(file);
    if (!pre.ok) {
      toast.error(
        pre.code === "PROOF_TOO_LARGE"
          ? "That file exceeds 5MB. Use a smaller screenshot."
          : pre.code === "PROOF_EMPTY"
            ? "That file looks empty. Pick another screenshot."
            : "Proof must be JPG, PNG, or WebP.",
      );
      return;
    }
    setUploading(true);
    try {
      const urlRes = await fetch("/api/admin/bookings/proof-upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mime: file.type, bytes: file.size }),
      });
      if (!urlRes.ok) {
        const e = await readError(urlRes, "Could not prepare upload.");
        toast.error(e.message);
        return;
      }
      const { path, signedUrl } = (await urlRes.json()) as {
        path: string;
        signedUrl: string;
      };
      const putRes = await fetch(signedUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        toast.error("Upload to storage failed. Check your connection and retry.");
        return;
      }
      setProof({ path, mime: file.type, bytes: file.size });
      toast.success("Payment proof attached.");
    } catch {
      toast.error("Upload failed. Check your connection and retry.");
    } finally {
      setUploading(false);
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (picked.length === 0) {
      toast.error("Pick at least one slot.");
      return;
    }
    if (!notify && description.trim().length === 0) {
      toast.error("Add a description for this booking.");
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        idempotencyKey,
        notify,
        slots: picked.map((p) => ({ courtId: p.courtId, slotStart: p.slotStart })),
        description: description.trim() || fullName.trim() || "Admin booking",
        ...(notify
          ? {
              customer: {
                fullName: fullName.trim(),
                email: email.trim(),
                phone: phone.trim(),
              },
            }
          : {}),
        rentals: { paddleQty, paddleHours: null, ball },
        proof,
      };

      const res = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const e = await readError(res, "Could not create the booking.");
        if (e.code === "SLOT_TAKEN") {
          // Drop the cached month so the grid re-reads instead of showing the
          // slot the server just rejected.
          setMonthCache((prev) => {
            const next = new Map(prev);
            next.delete(cacheKey);
            return next;
          });
        }
        toast.error(e.message);
        return;
      }

      const created = (await res.json()) as {
        trackingCode: string;
        notify: boolean;
        deduped: boolean;
      };
      toast.success(
        created.notify
          ? `Booking ${created.trackingCode} created — customer notified.`
          : `Booking ${created.trackingCode} created — no email sent.`,
      );
      router.push("/admin/bookings");
      router.refresh();
    } catch {
      toast.error("Could not create the booking. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || uploading;
  const courtsLoading = courts === null;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Left: slots + details ─────────────────────────────────────── */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Slots</CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="booking-date" className="text-xs text-muted-foreground">
                  Date
                </Label>
                <Input
                  id="booking-date"
                  type="date"
                  value={date}
                  min={manilaToday()}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-8 w-[160px]"
                />
              </div>
            </CardHeader>
            <CardContent>
              {availError ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <span className="flex items-center gap-1.5">
                    <CircleAlert className="size-4" />
                    {availError}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() =>
                      setMonthCache((prev) => {
                        const next = new Map(prev);
                        next.delete(cacheKey);
                        return next;
                      })
                    }
                  >
                    Retry
                  </Button>
                </div>
              ) : courtsLoading || (availLoading && slotStarts.length === 0) ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <SlotGrid
                  courts={courts ?? []}
                  slotStarts={slotStarts}
                  slotStateFor={slotStateFor}
                  pickedKeys={pickedKeys}
                  onToggle={toggleSlot}
                  loading={availLoading}
                />
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {picked.length}/{MAX_SLOTS} slots selected. Held slots show as
                unavailable; creating a booking over an active customer hold
                releases it.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Booking details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
                <div>
                  <Label htmlFor="notify-customer" className="text-sm font-medium">
                    Notify customer
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {notify
                      ? "The customer gets the approved-booking email with their tracking code."
                      : "No email is sent. The booking is recorded against your admin account."}
                  </p>
                </div>
                <Switch
                  id="notify-customer"
                  checked={notify}
                  onCheckedChange={(v) => setNotify(v === true)}
                  disabled={busy}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="full-name">
                    {notify ? "Customer name" : "Description"}
                  </Label>
                  <Input
                    id="full-name"
                    value={notify ? fullName : description}
                    onChange={(e) =>
                      notify ? setFullName(e.target.value) : setDescription(e.target.value)
                    }
                    placeholder={notify ? "Juan dela Cruz" : "Walk-in, court 1, 2–4pm"}
                    maxLength={100}
                    disabled={busy}
                  />
                </div>

                {notify ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="customer-phone">Contact number</Label>
                      <Input
                        id="customer-phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="09123456789"
                        inputMode="tel"
                        maxLength={30}
                        disabled={busy}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="customer-email">Email</Label>
                      <Input
                        id="customer-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="customer@example.com"
                        maxLength={254}
                        disabled={busy}
                      />
                      {emailSuggestion && (
                        <div
                          role="status"
                          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                        >
                          <span>
                            Did you mean{" "}
                            <strong className="font-semibold">{emailSuggestion.correctedEmail}</strong>?
                          </span>
                          <button
                            type="button"
                            onClick={() => setEmail(emailSuggestion.correctedEmail)}
                            className="rounded-md bg-amber-200/70 px-2 py-0.5 font-bold text-amber-900 transition-colors hover:bg-amber-200"
                          >
                            Fix it
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Recorded contact</Label>
                    <div className="flex h-9 items-center rounded-md border border-border/70 bg-muted/40 px-3 text-xs text-muted-foreground">
                      {adminEmail}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid gap-4 border-t border-border/70 pt-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="paddle-qty">Paddles</Label>
                  <Input
                    id="paddle-qty"
                    type="number"
                    min={0}
                    max={50}
                    value={paddleQty}
                    onChange={(e) =>
                      setPaddleQty(
                        Math.max(0, Math.min(50, Number(e.target.value) || 0)),
                      )
                    }
                    disabled={busy}
                  />
                  <p className="text-xs text-muted-foreground">
                    Billed per paddle per booked hour.
                  </p>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={ball}
                      onCheckedChange={(v) => setBall(v === true)}
                      disabled={busy}
                    />
                    Include ball fee
                  </label>
                </div>
              </div>

              <div className="space-y-1.5 border-t border-border/70 pt-4">
                <Label>Payment proof (optional)</Label>
                {proof ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                    <span className="truncate font-mono text-xs">{proof.path}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setProof(null)}
                      disabled={busy}
                      aria-label="Remove proof"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <label
                    className={cn(
                      "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-sm text-muted-foreground transition-colors hover:bg-muted/40",
                      busy && "pointer-events-none opacity-60",
                    )}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Uploading…
                      </>
                    ) : (
                      <>
                        <ImagePlus className="size-4" /> Attach a screenshot
                      </>
                    )}
                    <input
                      type="file"
                      accept={PROOF_CLIENT_ACCEPT}
                      className="sr-only"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: sticky summary ─────────────────────────────────────── */}
        <div className="xl:sticky xl:top-5 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <Badge variant="secondary">Approved</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {picked.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Pick slots to see the total.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {[...picked]
                    .sort((a, b) => a.slotStart.localeCompare(b.slotStart))
                    .map((p) => (
                      <li
                        key={slotKey(p.courtId, p.slotStart)}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          {p.courtName} · {formatSlotRange(p.slotStart)}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleSlot({ id: p.courtId, name: p.courtName }, p.slotStart)}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label="Remove slot"
                          disabled={busy}
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                </ul>
              )}

              {estimate && picked.length > 0 && (
                <div className="space-y-1.5 border-t border-border/70 pt-3 text-sm">
                  <Row label={`Court (${estimate.hours} hr)`} value={pesoOf(estimate.courtTotal)} />
                  {estimate.paddleTotal > 0 && (
                    <Row
                      label={`Paddles (${paddleQty} × ${estimate.paddleHours} hr)`}
                      value={pesoOf(estimate.paddleTotal)}
                    />
                  )}
                  {estimate.ballTotal > 0 && (
                    <Row label="Ball fee" value={pesoOf(estimate.ballTotal)} />
                  )}
                  <div className="flex items-center justify-between border-t border-border/70 pt-2 font-semibold">
                    <span>Total</span>
                    <span>{pesoOf(estimate.total)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Estimate — the server recalculates the exact total on submit.
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  onClick={() => router.push("/admin/bookings")}
                  disabled={busy}
                >
                  <ArrowLeft className="size-4" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={busy || picked.length === 0}
                  className="h-9 flex-1"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Creating…
                    </>
                  ) : (
                    <>
                      <Check className="size-4" /> Create booking
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function SlotGrid({
  courts,
  slotStarts,
  slotStateFor,
  pickedKeys,
  onToggle,
  loading,
}: {
  courts: CourtOption[];
  slotStarts: string[];
  slotStateFor: (courtId: string, slotStart: string) => AvailabilitySlot | null;
  pickedKeys: Set<string>;
  onToggle: (court: CourtOption, slotStart: string) => void;
  loading: boolean;
}) {
  return (
    <div className={cn("overflow-x-auto", loading && "opacity-60")}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/70">
            <th className="w-24 py-2 pr-2 text-left text-xs font-medium text-muted-foreground">
              Time
            </th>
            {courts.map((c) => (
              <th key={c.id} className="px-1 py-2 text-center text-xs font-medium">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slotStarts.map((iso) => (
            <tr key={iso} className="border-b border-border/40 last:border-0">
              <td className="py-1 pr-2 text-xs tabular-nums text-muted-foreground">
                {formatSlotRange(iso)}
              </td>
              {courts.map((court) => {
                const slot = slotStateFor(court.id, iso);
                const key = slotKey(court.id, iso);
                const selected = pickedKeys.has(key);
                const free = slot?.bookable ?? false;

                if (!free) {
                  const label =
                    slot?.state === "held"
                      ? "Held by a customer"
                      : slot?.state === "pending"
                        ? "Pending booking"
                        : slot?.state === "approved"
                          ? "Booked"
                          : "Closed";
                  return (
                    <td key={court.id} className="px-1 py-1 text-center">
                      <div
                        className="mx-auto flex size-7 items-center justify-center rounded-md bg-muted/60"
                        title={label}
                        aria-label={label}
                      >
                        <X className="size-3 text-muted-foreground/50" />
                      </div>
                    </td>
                  );
                }

                return (
                  <td key={court.id} className="px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => onToggle(court, iso)}
                      aria-pressed={selected}
                      aria-label={`${court.name} ${formatSlotRange(iso)}`}
                      className={cn(
                        "mx-auto flex size-7 items-center justify-center rounded-md border transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-primary/5 hover:border-primary/60 hover:bg-primary/15",
                      )}
                    >
                      {selected && <Check className="size-3" strokeWidth={3} />}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
