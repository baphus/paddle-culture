"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CreditCard,
  Download,
  FileCheck2,
  Image as ImageIcon,
  Lock,
  QrCode,
  Timer,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import {
  PAYMENT_METHODS,
  PAYMENT_NOTE,
  PAYMENT_INSTRUCTION,
  type PaymentMethod,
} from "@/lib/payment-methods";
import { PROOF_CLIENT_ACCEPT, precheckProofFile } from "@/lib/proof-client";
import { cn } from "@/lib/utils";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import type { DetailsValues } from "./details-form";

export interface BookingSummary {
  courtNames: string[];
  slotStarts: string[];
  idempotencyKey: string;
  /** Hold deadline (epoch ms), so the step can offer a restore when it lapses. */
  holdDeadlineMs: number | null;
  /** Last moment the hold may still be restored (deadline + grace window). */
  reclaimableUntilMs: number | null;
}

const SUBMIT_ERROR_FRIENDLY: Record<string, string> = {
  HOLD_INVALID: "Your hold expired before submitting. Please re-select your slots.",
  SLOT_TAKEN: "A selected slot was just taken. Please pick another time.",
  SLOT_INVALID: "A held slot is no longer bookable. Please re-select your slots.",
  SLOT_CLOSED: "A selected slot is now closed. Please pick another time.",
  RECLAIM_EXPIRED:
    "Your slots were released because the booking window passed. Please pick your times again.",
  HOLD_NOT_FOUND: "We couldn't find any saved slots for this session.",
  PROOF_NOT_FOUND: "Payment proof upload didn't finish. Upload it again.",
  PROOF_MISMATCH: "Proof details don't match the uploaded file. Upload it again.",
  PROOF_ALREADY_USED: "This proof was already used for another booking.",
  PROOF_TYPE_REJECTED: "Proof must be JPG, PNG, or WebP.",
  PROOF_TOO_LARGE: "Proof file exceeds 5MB.",
  INVALID_PADDLE_HOURS: "Paddle hours can't exceed your booked hours.",
  IDEMPOTENCY_IN_PROGRESS:
    "Your submission is already being processed. Wait a moment, then check your email.",
};

function friendlySubmitError(code: string | undefined, fallback: string): string {
  return (code && SUBMIT_ERROR_FRIENDLY[code]) || fallback;
}

async function readErrorMessage(
  res: Response,
  fallback: string,
): Promise<{ message: string; code?: string }> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return {
      message: body.error?.message ?? fallback,
      code: body.error?.code,
    };
  } catch {
    return { message: fallback };
  }
}

export default function PaymentStep({
  holdTokens,
  ownerToken,
  summary,
  details,
  busy,
  setBusy,
  onBack,
  onSuccess,
  onHoldExpired,
  onHoldReclaimed,
}: {
  holdTokens: string[];
  ownerToken?: string;
  summary: BookingSummary;
  details: DetailsValues;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onBack: () => void;
  onSuccess: (result: { trackingToken: string; trackingCode: string; total: string }) => void;
  onHoldExpired: () => void;
  /** Called after a successful reclaim with the hold's refreshed tokens. */
  onHoldReclaimed: (hold: { tokens: string[]; deadlineMs: number; expiresAt: string }) => void;
}) {
  const [methodId, setMethodId] = useState<PaymentMethod["id"]>("gcash");
  const [qrMissing, setQrMissing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [proof, setProof] = useState<{ path: string; mime: string; bytes: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  // The last file the customer picked. Kept in memory (never persisted) so that
  // after a hold reclaim we can re-mint a URL and re-upload in one tap instead
  // of asking someone who already paid to find their screenshot again.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [reclaiming, setReclaiming] = useState(false);

  const method = PAYMENT_METHODS.find((m) => m.id === methodId) ?? PAYMENT_METHODS[0]!;
  const qrExt = method.qrPath.split(".").pop() ?? "jpg";

  /** Mint a URL for `file` and PUT it. Returns the stored proof handle. */
  async function uploadFile(
    file: File,
    tokens: string[] = holdTokens,
  ): Promise<{ ok: true; proof: { path: string; mime: string; bytes: number } } | { ok: false }> {
    const urlRes = await fetch("/api/proofs/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ holdTokens: tokens, ownerToken, mime: file.type, bytes: file.size }),
    });

    if (!urlRes.ok) {
      const e = await readErrorMessage(urlRes, "Could not prepare upload.");
      if (e.code === "HOLD_INVALID") onHoldExpired();
      toast.error(friendlySubmitError(e.code, e.message));
      return { ok: false };
    }

    const { path, signedUrl } = (await urlRes.json()) as {
      path: string;
      signedUrl: string;
    };

    // Direct browser -> Supabase Storage PUT
    const putRes = await fetch(signedUrl, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file,
    });

    if (!putRes.ok) {
      toast.error("Upload to storage failed. Check your connection and retry.");
      return { ok: false };
    }
    return { ok: true, proof: { path, mime: file.type, bytes: file.size } };
  }

  async function handleFile(file: File) {
    const pre = precheckProofFile(file);
    if (!pre.ok) {
      const msg =
        pre.code === "PROOF_TOO_LARGE"
          ? "That file exceeds 5MB. Use a smaller screenshot."
          : pre.code === "PROOF_EMPTY"
            ? "That file looks empty. Pick another screenshot."
            : "Proof must be JPG, PNG, or WebP.";
      toast.error(msg);
      return;
    }

    setUploading(true);
    setProof(null);
    setFileName(file.name);
    setFileSize(file.size);
    setPendingFile(file);

    // Create local object URL for instant preview
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);

    try {
      const result = await uploadFile(file);
      if (!result.ok) return;
      setProof(result.proof);
      toast.success("Payment screenshot uploaded successfully!");
    } catch {
      toast.error("Upload failed. Check your connection and retry.");
    } finally {
      setUploading(false);
    }
  }

  /**
   * Ask the server to restore this session's hold. Used when the customer came
   * back after the 10-minute window (typically: they left for their banking
   * app). On success the parent gets fresh tokens and, if they had already
   * picked a screenshot, it is re-uploaded against the restored hold.
   */
  async function handleReclaim() {
    if (!ownerToken) {
      onHoldExpired();
      return;
    }
    setReclaiming(true);
    try {
      const res = await fetch("/api/holds/reclaim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerToken }),
      });
      if (!res.ok) {
        const e = await readErrorMessage(res, "Could not restore your slots.");
        toast.error(friendlySubmitError(e.code, e.message), { duration: 8000 });
        // A finished window or a slot someone else took is terminal: send them
        // back to pick again rather than leaving a dead button.
        if (e.code === "RECLAIM_EXPIRED" || e.code === "SLOT_TAKEN" || e.code === "HOLD_NOT_FOUND") {
          onHoldExpired();
        }
        return;
      }
      const body = (await res.json()) as {
        status: "live" | "revived";
        holds: { holdToken: string }[];
        expiresAt: string;
        deadlineMs: number;
      };
      onHoldReclaimed({
        tokens: body.holds.map((h) => h.holdToken),
        deadlineMs: body.deadlineMs,
        expiresAt: body.expiresAt,
      });
      toast.success(
        body.status === "revived"
          ? "Your slots are held again — 10 minutes to finish."
          : "Hold extended — 10 more minutes.",
      );
      // Re-upload in the background: the old proof path was minted against the
      // old tokens, and a revived hold has brand-new ones.
      if (pendingFile) {
        setUploading(true);
        try {
          const result = await uploadFile(
            pendingFile,
            body.holds.map((h) => h.holdToken),
          );
          if (result.ok) {
            setProof(result.proof);
            toast.success("Payment screenshot re-attached.");
          } else {
            // Don't leave a proof handle the customer can't vouch for — make
            // them re-pick so submit can never reference a stale upload.
            setProof(null);
          }
        } finally {
          setUploading(false);
        }
      }
    } catch {
      toast.error("Could not restore your slots. Check your connection and retry.");
    } finally {
      setReclaiming(false);
    }
  }

  async function handleSubmit() {
    if (!proof) {
      toast.error("Please upload your payment screenshot before submitting.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          holdTokens,
          ownerToken,
          idempotencyKey: summary.idempotencyKey,
          customer: {
            fullName: details.fullName,
            email: details.email,
            phone: details.phone,
          },
          rentals: {
            paddleQty: details.paddleQty,
            paddleHours: details.paddleQty > 0 ? details.paddleHours : null,
            ball: details.ball,
          },
          proof,
        }),
      });

      if (!res.ok) {
        const e = await readErrorMessage(res, "Submission failed.");
        if (e.code === "HOLD_INVALID") onHoldExpired();
        toast.error(friendlySubmitError(e.code, e.message), { duration: 8000 });
        return;
      }

      const body = (await res.json()) as { trackingToken: string; trackingCode: string; total: string };
      onSuccess(body);
    } catch {
      toast.error("Submission failed. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  const reclaimerBusy = busy || uploading || reclaiming;
  // The lapsed check must not freeze at first render: a customer can sit on
  // this step while the timer runs out, and then submit against a dead hold.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const holdLapsed = summary.holdDeadlineMs !== null && summary.holdDeadlineMs <= nowMs;
  const reclaimExpired =
    summary.reclaimableUntilMs !== null && summary.reclaimableUntilMs <= nowMs;
  const canReclaim = holdLapsed && !reclaimExpired && !!ownerToken;

  return (
    <div className="space-y-6">
      {/* Hold lapsed — the customer most likely left for their banking app.
          Restoring beats restarting: their payment is already sent. */}
      {holdLapsed && (
        <div
          role="status"
          className={cn(
            "rounded-2xl border px-4 py-4 text-xs sm:text-sm",
            canReclaim
              ? "border-flame/40 bg-flame-light/30 text-ink"
              : "border-error/40 bg-error/10 text-error",
          )}
        >
          <p className="font-bold">
            {canReclaim
              ? "You were away — we can still save your slots."
              : "Your slots have been released."}
          </p>
          <p className="mt-1 leading-relaxed">
            {canReclaim
              ? "Your 10-minute hold ran out while you were paying. Tap below to hold the same times again for another 10 minutes — your payment screenshot stays with us."
              : "The booking window for these times has passed. Please pick your times again — if you've already sent the payment, contact us with your reference and we'll match it up."}
          </p>
          {canReclaim && (
            <button
              type="button"
              id="payment-reclaim"
              onClick={() => void handleReclaim()}
              disabled={reclaimerBusy}
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-flame px-5 text-sm font-bold text-white shadow-sm transition-all hover:bg-flame-hover active:scale-[0.99] disabled:opacity-50"
            >
              {reclaiming ? (
                <>
                  <LoadingAnimation size="compact" label="Restoring your slots" />
                  <span>Restoring…</span>
                </>
              ) : (
                <>
                  <Timer className="size-4" />
                  <span>Hold my slots again</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Payment Instructions Card */}
      <div className="rounded-3xl border border-line-warm/70 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center justify-between border-b border-line-warm/40 pb-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
              1. Choose Payment Method
            </h2>
            <p className="mt-1 text-xs text-warm-muted sm:text-sm">
              We accept instant GCash transfers and online bank deposits.
            </p>
          </div>
          <div className="hidden size-10 items-center justify-center rounded-2xl bg-oat text-pine sm:flex">
            <CreditCard className="size-5" />
          </div>
        </div>

        {/* Method Selector Tabs */}
        <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Payment method">
          {PAYMENT_METHODS.map((m) => {
            const isSel = m.id === methodId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMethodId(m.id);
                  setQrMissing(false);
                }}
                className={cn(
                  "inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
                  isSel
                    ? "bg-flame text-white shadow-sm"
                    : "border border-line-warm/70 bg-cream/50 text-ink hover:bg-cream",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.logoPath}
                  alt=""
                  className="size-6 rounded object-contain"
                />
                <span>{m.label}</span>
                {!m.configured && (
                  <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] text-white/80">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Method Details Box — QR only; the account details live inside the QR */}
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-line-warm/60 bg-white p-5 text-center sm:p-6">
          {!qrMissing ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={method.qrPath}
              alt={`${method.label} payment QR code`}
              className="aspect-square w-full max-w-md rounded-xl object-contain"
              onError={() => setQrMissing(true)}
            />
          ) : (
            <div className="flex aspect-square w-full max-w-md flex-col items-center justify-center rounded-xl bg-cream/60 p-6 text-xs text-warm-muted">
              <QrCode className="size-8 text-warm-muted/50 mb-1" />
              <span>QR image coming soon</span>
            </div>
          )}
          <span className="mt-3 text-[11px] font-semibold text-warm-muted">
            Scan with your banking app
          </span>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-warm-muted">
            {PAYMENT_INSTRUCTION}
          </p>
          {!qrMissing && (
            <a
              href={method.qrPath}
              download={`${method.label}-payment-QR.${qrExt}`}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-line-warm/70 bg-white px-5 text-sm font-bold text-pine transition-all hover:bg-cream active:scale-[0.99]"
            >
              <Download className="size-4" />
              <span>Download QR</span>
            </a>
          )}
        </div>
      </div>

      {/* Upload Payment Proof Card */}
      <div className="rounded-3xl border border-line-warm/70 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center justify-between border-b border-line-warm/40 pb-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
              2. Upload Payment Proof
            </h2>
            <p className="mt-1 text-xs text-warm-muted sm:text-sm">
              Upload your transaction receipt screenshot (JPG, PNG, WebP up to 5MB).
            </p>
          </div>
          <div className="hidden size-10 items-center justify-center rounded-2xl bg-oat text-pine sm:flex">
            <UploadCloud className="size-5" />
          </div>
        </div>

        {/* Upload Dropzone */}
        <div className="space-y-4">
          <label
            htmlFor="proof-upload"
            className={cn(
              "group relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all",
              uploading
                ? "border-flame/50 bg-flame-light/20 cursor-wait"
                : proof
                  ? "border-live-dot/50 bg-live/20"
                  : "border-line-warm/80 bg-cream/30 hover:border-flame/50 hover:bg-cream/60",
            )}
          >
            <input
              id="proof-upload"
              type="file"
              accept={PROOF_CLIENT_ACCEPT}
              disabled={uploading || busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              className="sr-only"
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <LoadingAnimation size="default" label="Uploading payment proof" />
                <span className="text-sm font-bold text-ink">Uploading proof to secure vault…</span>
                <span className="text-xs text-warm-muted">Please keep this window open</span>
              </div>
            ) : proof && previewUrl ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Payment screenshot preview"
                  className="size-20 rounded-xl border border-line-warm object-cover shadow-sm"
                />
                <div className="text-center sm:text-left">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-live-dot">
                    <FileCheck2 className="size-4" />
                    <span>Payment Screenshot Ready</span>
                  </div>
                  <p className="mt-1 font-mono text-xs font-bold text-ink truncate max-w-xs">
                    {fileName}
                  </p>
                  <p className="text-[11px] text-warm-muted">
                    {fileSize ? `${(fileSize / (1024 * 1024)).toFixed(2)} MB` : ""} · Tap to change
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-flame-light text-flame transition-transform group-hover:scale-110">
                  <ImageIcon className="size-6" />
                </div>
                <div>
                  <span className="text-sm font-bold text-ink">Tap or drag screenshot here</span>
                  <p className="text-xs text-warm-muted">JPG, PNG, or WebP (max 5MB)</p>
                </div>
              </div>
            )}
          </label>

          <p className="text-xs leading-relaxed text-warm-muted">{PAYMENT_NOTE}</p>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={busy || uploading}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-line-warm/70 bg-white px-5 text-sm font-bold text-pine transition-all hover:bg-cream active:scale-[0.99] disabled:opacity-50"
        >
          <ArrowLeft className="size-4" />
          <span>Back to Details</span>
        </button>

        <button
          type="button"
          id="payment-advance"
          onClick={handleSubmit}
          disabled={reclaimerBusy || !proof || (holdLapsed && !canReclaim)}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-flame px-7 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? (
            <>
              <LoadingAnimation size="compact" label="Submitting booking" />
              <span>Submitting Booking…</span>
            </>
          ) : holdLapsed && canReclaim ? (
            <>
              <Lock className="size-4" />
              <span>Hold my slots first</span>
            </>
          ) : (
            <>
              <Lock className="size-4" />
              <span>Submit &amp; Confirm Booking</span>
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
