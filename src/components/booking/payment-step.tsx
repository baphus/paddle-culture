"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_METHODS, PAYMENT_NOTE, type PaymentMethod } from "@/lib/payment-methods";
import { formatSlotRange } from "@/lib/courts";
import { PROOF_CLIENT_ACCEPT, precheckProofFile } from "@/lib/proof-client";
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
  IDEMPOTENCY_IN_PROGRESS: "Your submission is already being processed. Wait a moment, then check your email.",
};

function friendlySubmitError(code: string | undefined, fallback: string): string {
  return (code && SUBMIT_ERROR_FRIENDLY[code]) || fallback;
}

async function readErrorMessage(res: Response, fallback: string): Promise<{ message: string; code?: string }> {
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

// Step 3 — payment instructions + proof upload + submit.
//
// Upload path is ALWAYS browser → Supabase Storage (signed PUT URL), never
// through a route handler (Netlify buffers 6MB). Flow:
//   precheckProofFile → POST /api/proofs/upload-url → PUT signedUrl →
//   POST /api/submit with { path, mime, bytes }.
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
  const [proof, setProof] = useState<{ path: string; mime: string; bytes: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  const method = PAYMENT_METHODS.find((m) => m.id === methodId) ?? PAYMENT_METHODS[0]!;

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
      // Direct browser → Supabase Storage PUT (never via a route handler).
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
      setFileName(file.name);
      toast.success("Payment proof uploaded.");
    } catch {
      toast.error("Upload failed. Check your connection and retry.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!proof) {
      toast.error("Upload your payment proof screenshot first.");
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
      <div className="rounded-lg border p-4">
        <h3 className="font-semibold">Booking summary</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {summary.slotStarts.map((s) => (
            <li key={s}>
              {summary.courtNames.join(" + ")} — {formatSlotRange(s)}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm">
          {details.paddleQty > 0
            ? `${details.paddleQty} paddle(s) × ${details.paddleHours ?? summary.slotStarts.length}h`
            : "No paddles"}
          {details.ball ? " + ball" : ""}
        </p>
        <p className="mt-1 font-medium">
          Estimated total: ₱{estimate.toFixed(2)}{" "}
          <span className="font-normal text-muted-foreground">
            (final total confirmed on submit)
          </span>
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">1. Pay with</h3>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Payment method">
          {PAYMENT_METHODS.map((m) => (
            <Button
              key={m.id}
              type="button"
              variant={m.id === methodId ? "default" : "outline"}
              onClick={() => {
                setMethodId(m.id);
                setQrMissing(false);
              }}
            >
              {m.label}
              {!m.configured ? " (soon)" : ""}
            </Button>
          ))}
        </div>
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">{method.label}</p>
          <p>Account name: {method.accountName}</p>
          <p>Account number: {method.accountNumber}</p>
          <p className="mt-2 text-muted-foreground">{method.instructions}</p>
          {!method.configured ? (
            <p role="note" className="mt-2 font-medium text-amber-600">
              Final account details coming soon — please confirm with us before paying.
            </p>
          ) : null}
          <div className="mt-3">
            {!qrMissing ? (
              // Graceful fallback: if the owner hasn't dropped the QR file in
              // public/payment-qr/ yet, the text details above still work.
              <img
                src={method.qrPath}
                alt={`${method.label} payment QR code`}
                className="h-48 w-48 rounded-md border object-contain"
                onError={() => setQrMissing(true)}
              />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center rounded-md border bg-muted p-4 text-center text-sm text-muted-foreground">
                QR image coming soon — pay using the account details above.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">2. Upload payment proof</h3>
        <Label htmlFor="proof">Screenshot (JPG/PNG/WebP, max 5MB)</Label>
        <Input
          id="proof"
          type="file"
          accept={PROOF_CLIENT_ACCEPT}
          disabled={uploading || busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        {uploading ? <p className="text-sm text-muted-foreground">Uploading…</p> : null}
        {fileName && proof ? (
          <p className="text-sm text-green-700">Uploaded: {fileName}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">{PAYMENT_NOTE}</p>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={busy || uploading}>
          Back
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={busy || uploading || !proof}
        >
          {busy ? "Submitting…" : "Submit booking"}
        </Button>
      </div>
    </div>
  );
}
