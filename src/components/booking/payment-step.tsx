"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Copy,
  CreditCard,
  FileCheck2,
  Image as ImageIcon,
  Lock,
  QrCode,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { PAYMENT_METHODS, PAYMENT_NOTE, type PaymentMethod } from "@/lib/payment-methods";
import { formatSlotRange } from "@/lib/courts";
import { peso } from "@/lib/pricing-display";
import { PROOF_CLIENT_ACCEPT, precheckProofFile } from "@/lib/proof-client";
import { cn } from "@/lib/utils";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import type { DetailsValues } from "./details-form";

export interface BookingSummary {
  courtNames: string[];
  slotStarts: string[];
  idempotencyKey: string;
}

const SUBMIT_ERROR_FRIENDLY: Record<string, string> = {
  HOLD_INVALID: "Your hold expired before submitting. Please re-select your slots.",
  SLOT_TAKEN: "A selected slot was just taken. Please pick another time.",
  SLOT_INVALID: "A held slot is no longer bookable. Please re-select your slots.",
  SLOT_CLOSED: "A selected slot is now closed. Please pick another time.",
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
  summary,
  details,
  estimate,
  busy,
  setBusy,
  onBack,
  onSuccess,
  onHoldExpired,
}: {
  holdTokens: string[];
  summary: BookingSummary;
  details: DetailsValues;
  estimate: number;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onBack: () => void;
  onSuccess: (result: { trackingToken: string; total: string }) => void;
  onHoldExpired: () => void;
}) {
  const [methodId, setMethodId] = useState<PaymentMethod["id"]>("gcash");
  const [qrMissing, setQrMissing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [proof, setProof] = useState<{ path: string; mime: string; bytes: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copiedNum, setCopiedNum] = useState(false);

  const method = PAYMENT_METHODS.find((m) => m.id === methodId) ?? PAYMENT_METHODS[0]!;

  const copyAccountNumber = async () => {
    try {
      await navigator.clipboard.writeText(method.accountNumber);
      setCopiedNum(true);
      toast.success("Account number copied!");
      setTimeout(() => setCopiedNum(false), 2000);
    } catch {
      toast.error("Could not copy account number.");
    }
  };

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

    // Create local object URL for instant preview
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);

    try {
      const urlRes = await fetch("/api/proofs/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ holdTokens, mime: file.type, bytes: file.size }),
      });

      if (!urlRes.ok) {
        const e = await readErrorMessage(urlRes, "Could not prepare upload.");
        if (e.code === "HOLD_INVALID") onHoldExpired();
        toast.error(friendlySubmitError(e.code, e.message));
        return;
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
        return;
      }

      setProof({ path, mime: file.type, bytes: file.size });
      toast.success("Payment screenshot uploaded successfully!");
    } catch {
      toast.error("Upload failed. Check your connection and retry.");
    } finally {
      setUploading(false);
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
        toast.error(friendlySubmitError(e.code, e.message));
        return;
      }

      const body = (await res.json()) as { trackingToken: string; total: string };
      onSuccess(body);
    } catch {
      toast.error("Submission failed. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Total Due Banner */}
      <div className="flex flex-col gap-3 rounded-3xl border border-line-warm/70 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <span className="text-xs font-bold tracking-wider text-flame uppercase">
            Total Amount Due
          </span>
          <p className="mt-0.5 text-xs text-warm-muted">
            Send this exact amount to complete your reservation.
          </p>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black text-flame">{peso(estimate)}</span>
          <span className="text-xs font-semibold text-warm-muted">PHP</span>
        </div>
      </div>

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

        {/* Method Details Box */}
        <div className="mt-6 grid gap-6 rounded-2xl border border-line-warm/60 bg-cream/40 p-5 sm:grid-cols-12 sm:p-6">
          <div className="space-y-4 sm:col-span-7">
            <div>
              <span className="block text-xs font-semibold text-warm-muted">Account Name</span>
              <span className="block text-sm font-extrabold text-ink">{method.accountName}</span>
            </div>

            <div>
              <span className="block text-xs font-semibold text-warm-muted">Account Number</span>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-base font-black text-pine select-all">
                  {method.accountNumber}
                </span>
                <button
                  type="button"
                  onClick={copyAccountNumber}
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-line-warm bg-white text-ink transition-colors hover:bg-cream"
                  title="Copy account number"
                >
                  {copiedNum ? (
                    <Check className="size-3.5 text-live-dot" />
                  ) : (
                    <Copy className="size-3.5 text-warm-muted" />
                  )}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-line-warm/40 bg-white/80 p-3 text-xs leading-relaxed text-warm-muted">
              {method.instructions}
            </div>

            {!method.configured && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                <CircleAlert className="size-4 shrink-0" />
                <span>Account details coming soon — please confirm with staff before paying.</span>
              </p>
            )}
          </div>

          {/* QR Code Container */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-line-warm/60 bg-white p-4 text-center sm:col-span-5">
            {!qrMissing ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={method.qrPath}
                alt={`${method.label} payment QR code`}
                className="size-40 rounded-xl object-contain"
                onError={() => setQrMissing(true)}
              />
            ) : (
              <div className="flex size-40 flex-col items-center justify-center rounded-xl bg-cream/60 p-4 text-center text-xs text-warm-muted">
                <QrCode className="size-8 text-warm-muted/50 mb-1" />
                <span>QR image coming soon</span>
              </div>
            )}
            <span className="mt-2 text-[11px] font-semibold text-warm-muted">
              Scan with your banking app
            </span>
          </div>
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
          onClick={handleSubmit}
          disabled={busy || uploading || !proof}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-flame px-7 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? (
            <>
              <LoadingAnimation size="compact" label="Submitting booking" />
              <span>Submitting Booking…</span>
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
