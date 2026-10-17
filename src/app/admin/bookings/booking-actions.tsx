"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookingStatusBadge } from "@/components/admin/status-badge";
import { formatBookingDate, type BookingDetail } from "@/lib/admin/bookings";

function pesos(total: string): string {
  return `₱${Number(total).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function BookingActions({ booking }: { booking: BookingDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofFailed, setProofFailed] = useState(false);
  const pending = booking.status === "Pending";

  function closeDecision() {
    setDecision(null);
    setReason("");
  }

  async function decide(kind: "approve" | "reject") {
    if (kind === "reject" && !reason.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }
    setBusy(kind);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kind === "reject" ? { reason: reason.trim() } : {}),
      });
      const data = (await res.json()) as {
        error?: { message?: string };
        deduped?: boolean;
        status?: string;
      };
      if (!res.ok) {
        toast.error(data.error?.message ?? `${kind} failed.`);
        return;
      }
      toast.success(
        data.deduped
          ? `Already ${data.status ?? booking.status} — no duplicate email sent.`
          : kind === "approve"
            ? "Booking approved."
            : "Booking rejected.",
      );
      closeDecision();
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function openDetail() {
    setOpen(true);
    if (proofUrl || proofFailed || !booking.proofPath) return;
    try {
      const res = await fetch(
        `/api/admin/proofs/read?path=${encodeURIComponent(booking.proofPath)}`,
      );
      const data = (await res.json()) as { signedUrl?: string };
      if (res.ok && data.signedUrl) setProofUrl(data.signedUrl);
      else setProofFailed(true);
    } catch {
      setProofFailed(true);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="sm" onClick={openDetail}>
        <Eye className="size-3.5" /> View
      </Button>

      {pending && (
        <Button
          variant="outline"
          size="icon-sm"
          disabled={busy !== null}
          onClick={() => decide("approve")}
          title="Quick approve"
        >
          <Check className="size-3.5" />
        </Button>
      )}

      {/* Detail modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-md">
          <DialogHeader className="gap-1 border-b px-5 py-4 pr-10">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-base font-semibold">
                {booking.fullName}
              </DialogTitle>
              <BookingStatusBadge
                status={booking.status}
                className="shrink-0"
              />
            </div>
            <DialogDescription className="mt-0.5 text-xs">
              {booking.email} · {booking.phone}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {/* Booking details */}
            <div className="space-y-2 rounded-xl border p-4">
              <DetailRow label="Courts" value={booking.courts || "—"} />
              <DetailRow label="Date" value={formatBookingDate(booking.date)} />
              <DetailRow label="Slots" value={booking.slotLabels.join(", ") || "—"} />
              <DetailRow
                label="Paddles"
                value={
                  booking.paddleQty > 0
                    ? `${booking.paddleQty}${booking.paddleHours ? ` × ${booking.paddleHours}h` : ""}`
                    : "None"
                }
              />
              <DetailRow label="Ball" value={booking.hasBall ? "Yes" : "No"} />
              <DetailRow label="Total" value={pesos(booking.total)} bold />
              {booking.rejectReason && (
                <DetailRow label="Reject reason" value={booking.rejectReason} />
              )}
            </div>

            {/* Payment proof */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Payment proof
              </p>
              <div className="overflow-hidden rounded-xl border">
                {proofUrl ? (
                  <a href={proofUrl} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={proofUrl}
                      alt="Payment proof"
                      className="w-full object-contain"
                    />
                  </a>
                ) : proofFailed || !booking.proofPath ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Proof unavailable.
                  </p>
                ) : (
                  <div className="flex min-h-24 items-center justify-center">
                    <LoadingAnimation label="Loading payment proof" />
                  </div>
                )}
              </div>
            </div>

            {pending && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => setDecision("approve")}
                >
                  <Check className="size-3.5" /> Approve
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => setDecision("reject")}
                >
                  <X className="size-3.5" /> Reject
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Approve / reject confirmation dialog */}
      <Dialog
        open={decision !== null}
        onOpenChange={(o) => {
          if (!o && busy === null) closeDecision();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === "reject" ? "Reject booking" : "Approve booking"}
            </DialogTitle>
            <DialogDescription>
              {decision === "reject"
                ? "This rejects the booking and emails the customer. A reason is required."
                : "This approves the booking and emails the customer."}
            </DialogDescription>
          </DialogHeader>

          {decision === "reject" && (
            <div className="space-y-1.5">
              <Label htmlFor={`reason-${booking.id}`}>
                Rejection reason (required)
              </Label>
              <Input
                id={`reason-${booking.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for rejection…"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={closeDecision}
            >
              Cancel
            </Button>
            <Button
              variant={decision === "reject" ? "destructive" : "default"}
              disabled={busy !== null}
              onClick={() => decision && decide(decision)}
            >
              {busy !== null ? (
                <span className="flex items-center gap-1.5">
                  <LoadingAnimation size="compact" label="Saving" />
                  {decision === "reject" ? "Rejecting…" : "Approving…"}
                </span>
              ) : decision === "reject" ? (
                <span className="flex items-center gap-1.5">
                  <X className="size-3.5" /> Reject
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Check className="size-3.5" /> Approve
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={
          bold ? "text-right font-semibold" : "text-right text-muted-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}
