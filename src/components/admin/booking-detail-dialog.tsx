"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Check, Maximize2, RotateCcw, Trash2, X } from "lucide-react";
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
import { formatCourtSlotGroup } from "@/lib/courts";

function pesos(total: string): string {
  return `₱${Number(total).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Copy for the approve/reject/refund/delete confirmation dialog. */
const DECISION_COPY: Record<
  Exclude<BookingDecision, null>,
  { title: string; description: (booking: BookingDetail | null) => string }
> = {
  approve: {
    title: "Approve booking",
    description: (booking) =>
      `This approves the booking and emails a confirmation to ${booking?.email ?? "the customer"}.`,
  },
  reject: {
    title: "Reject booking",
    description: () =>
      "This rejects the booking and emails the customer. A reason is required.",
  },
  refund: {
    title: "Full refund",
    description: (booking) =>
      `This releases the court slots and emails ${booking?.email ?? "the customer"} that ${
        booking ? pesos(booking.total) : "the amount"
      } has been wired back to them. The refunded amount is removed from Finance and Revenue, so it no longer counts as income.`,
  },
  delete: {
    title: "Delete booking",
    description: () =>
      "This permanently deletes the booking and everything under it — court slots, rentals, payment proof, and email history. The slots become bookable again, and if the booking was approved its amount also disappears from Finance and Revenue. This cannot be undone.",
  },
};

export type BookingDecision = "approve" | "reject" | "refund" | "delete" | null;

/**
 * The admin booking view modal: customer facts, payment proof with an in-app
 * fullscreen viewer, and the approve/reject confirmation dialog.
 *
 * Single source of truth for the bookings table and the calendar, so both
 * entry points render exactly the same booking. `open` drives the detail
 * dialog and `decision` the confirmation dialog, which lets a caller open the
 * confirmation on its own (the table's quick-approve button). Passing no
 * `booking` while `open` shows the loading shell (the calendar fetches it).
 */
export function BookingDetailDialog({
  booking,
  open,
  onOpenChange,
  decision,
  onDecisionChange,
  onDecided,
}: {
  booking: BookingDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: BookingDecision;
  onDecisionChange: (decision: BookingDecision) => void;
  /** Called after a successful approve/reject, e.g. to refresh the page. */
  onDecided?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<Exclude<BookingDecision, null> | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofFailed, setProofFailed] = useState(false);
  const [proofExpanded, setProofExpanded] = useState(false);

  const bookingId = booking?.id ?? null;
  const proofPath = booking?.proofPath ?? null;
  const pending = booking?.status === "Pending";
  const approved = booking?.status === "Approved";
  const proofOpen = open || decision !== null;

  function closeDecision() {
    onDecisionChange(null);
    setReason("");
  }

  // Another booking (the calendar reuses this instance) starts from a clean
  // slate: no stale reason, no stale proof, no expanded viewer.
  useEffect(() => {
    setReason("");
    setProofExpanded(false);
    setProofUrl(null);
    setProofFailed(false);
  }, [bookingId]);

  // Signed URL for the payment proof, shared by the detail and confirmation
  // dialogs and cached after the first successful (or failed) read.
  const loadProof = useCallback(async () => {
    if (proofUrl || proofFailed || !proofPath) return;
    try {
      const res = await fetch(
        `/api/admin/proofs/read?path=${encodeURIComponent(proofPath)}`,
      );
      const data = (await res.json()) as { signedUrl?: string };
      if (res.ok && data.signedUrl) setProofUrl(data.signedUrl);
      else setProofFailed(true);
    } catch {
      setProofFailed(true);
    }
  }, [proofPath, proofUrl, proofFailed]);

  useEffect(() => {
    if (proofOpen) void loadProof();
  }, [proofOpen, loadProof]);

  // The fullscreen viewer belongs to the dialogs; drop it when both close.
  useEffect(() => {
    if (!proofOpen) setProofExpanded(false);
  }, [proofOpen]);

  async function decide(kind: Exclude<BookingDecision, null>) {
    if (!booking) return;
    if (kind === "reject" && !reason.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }
    setBusy(kind);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          kind === "reject" || kind === "refund"
            ? { reason: reason.trim() || undefined }
            : {},
        ),
      });
      const data = (await res.json()) as {
        error?: { message?: string };
        deduped?: boolean;
        deleted?: boolean;
        status?: string;
      };
      if (!res.ok) {
        toast.error(data.error?.message ?? `${kind} failed.`);
        return;
      }
      toast.success(
        kind === "delete"
          ? data.deleted === false
            ? "Booking was already deleted."
            : "Booking deleted."
          : data.deduped
            ? `Already ${data.status ?? booking.status} — no duplicate email sent.`
            : kind === "approve"
              ? "Booking approved."
              : kind === "refund"
                ? "Booking refunded."
                : "Booking rejected.",
      );
      closeDecision();
      onOpenChange(false);
      onDecided?.();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-2xl">
          {booking ? (
            <>
              <DialogHeader className="gap-1 border-b px-5 py-4 pr-10">
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle className="text-base font-semibold">
                    {booking.fullName}
                  </DialogTitle>
                  <BookingStatusBadge
                    status={booking.status}
                    className="shrink-0"
                  />
                  {booking.paidCash && (
                    <span className="shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium">
                      Paid in cash
                    </span>
                  )}
                </div>
                <DialogDescription className="mt-0.5 text-xs">
                  {booking.email} · {booking.phone}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
                <BookingSummary booking={booking} />

                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {booking.paidCash ? "Paid in cash" : "Payment proof"}
                    <span className="inline-flex items-center gap-1 font-normal normal-case text-muted-foreground/80 sm:hidden">
                      <Maximize2 className="size-3" />
                      Tap to view fullscreen
                    </span>
                  </p>
                  {proofUrl ? (
                    <button
                      type="button"
                      onClick={() => setProofExpanded(true)}
                      className="group/proof relative mx-auto block aspect-[3/4] w-full max-w-xs cursor-zoom-in overflow-hidden rounded-lg border bg-muted/30"
                      title="Expand payment proof"
                    >
                      <img
                        src={proofUrl}
                        alt="Payment proof"
                        className="size-full object-cover"
                      />
                      <span className="absolute inset-0 hidden items-center justify-center gap-1.5 bg-black/50 text-xs font-medium text-white opacity-0 transition-opacity group-hover/proof:opacity-100 sm:flex">
                        <Maximize2 className="size-4" />
                        Click to view fullscreen
                      </span>
                    </button>
                  ) : booking.paidCash ? (
                    <div className="flex aspect-[3/4] w-full max-w-xs items-center justify-center rounded-lg border bg-muted/30 text-center text-xs text-muted-foreground">
                      Cash collected at the desk — no proof attached.
                    </div>
                  ) : proofFailed || !booking.proofPath ? (
                    <div className="flex aspect-[3/4] w-full max-w-xs items-center justify-center rounded-lg border bg-muted/30 text-center text-xs text-muted-foreground">
                      Proof unavailable.
                    </div>
                  ) : (
                    <div className="flex aspect-[3/4] w-full max-w-xs items-center justify-center rounded-lg border bg-muted/30">
                      <LoadingAnimation size="compact" label="Loading payment proof" />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {pending && (
                    <>
                      <Button
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => onDecisionChange("approve")}
                      >
                        <Check className="size-3.5" /> Approve
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => onDecisionChange("reject")}
                      >
                        <X className="size-3.5" /> Reject
                      </Button>
                    </>
                  )}
                  {approved && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => onDecisionChange("refund")}
                    >
                      <RotateCcw className="size-3.5" /> Full refund
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => onDecisionChange("delete")}
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </div>
              </div>


            </>
          ) : (
            <>
              <DialogTitle className="sr-only">Loading booking</DialogTitle>
              <div className="flex flex-1 items-center justify-center py-20">
                <LoadingAnimation label="Loading booking" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve / reject confirmation dialog — sibling, not nested, so its
          backdrop renders independently. */}
      <Dialog
        open={decision !== null}
        onOpenChange={(o) => {
          if (!o && busy === null) closeDecision();
        }}
      >
        <DialogContent
          className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-2xl"
        >
          <DialogHeader className="gap-1 border-b px-5 py-4 pr-10">
            <DialogTitle>
              {decision ? DECISION_COPY[decision].title : "Approve booking"}
            </DialogTitle>
            <DialogDescription>
              {decision
                ? DECISION_COPY[decision].description(booking)
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Payment proof
              <span className="inline-flex items-center gap-1 font-normal normal-case text-muted-foreground/80 sm:hidden">
                <Maximize2 className="size-3" />
                Tap to view fullscreen
              </span>
            </p>
            {proofUrl ? (
              <button
                type="button"
                onClick={() => setProofExpanded(true)}
                className="group/proof relative mx-auto block aspect-[3/4] w-full max-w-xs cursor-zoom-in overflow-hidden rounded-lg border bg-muted/30"
                title="Expand payment proof"
              >
                <img
                  src={proofUrl}
                  alt="Payment proof"
                  className="size-full object-cover"
                />
                <span className="absolute inset-0 hidden items-center justify-center gap-1.5 bg-black/50 text-xs font-medium text-white opacity-0 transition-opacity group-hover/proof:opacity-100 sm:flex">
                  <Maximize2 className="size-4" />
                  Click to view fullscreen
                </span>
              </button>
            ) : proofFailed || !booking?.proofPath ? (
              <div className="flex aspect-[3/4] w-full max-w-xs items-center justify-center rounded-lg border bg-muted/30 text-center text-xs text-muted-foreground">
                Proof unavailable.
              </div>
            ) : (
              <div className="flex aspect-[3/4] w-full max-w-xs items-center justify-center rounded-lg border bg-muted/30">
                <LoadingAnimation size="compact" label="Loading payment proof" />
              </div>
            )}

            {(decision === "reject" || decision === "refund") && booking && (
              <div className="mt-4 space-y-1.5">
                <Label htmlFor={`reason-${booking.id}`}>
                  {decision === "reject"
                    ? "Rejection reason (required)"
                    : "Refund note (optional)"}
                </Label>
                <Input
                  id={`reason-${booking.id}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  placeholder={
                    decision === "reject"
                      ? "Reason for rejection…"
                      : "Why this booking was refunded (optional)…"
                  }
                />
              </div>
            )}
          </div>

          <DialogFooter className="mx-0 mb-0 mt-1 flex-row justify-end rounded-b-xl border-t bg-muted/50 px-5 py-3">
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={closeDecision}
            >
              Cancel
            </Button>
            <Button
              variant={
                decision === "reject" || decision === "delete"
                  ? "destructive"
                  : "default"
              }
              disabled={busy !== null}
              onClick={() => decision && decide(decision)}
            >
              {decision === null ? null : busy !== null ? (
                <span className="flex items-center gap-1.5">
                  <LoadingAnimation size="compact" label="Saving" />
                  {decision === "reject"
                    ? "Rejecting…"
                    : decision === "refund"
                      ? "Refunding…"
                      : decision === "delete"
                        ? "Deleting…"
                        : "Approving…"}
                </span>
              ) : decision === "reject" ? (
                <span className="flex items-center gap-1.5">
                  <X className="size-3.5" /> Reject
                </span>
              ) : decision === "refund" ? (
                <span className="flex items-center gap-1.5">
                  <RotateCcw className="size-3.5" /> Full refund
                </span>
              ) : decision === "delete" ? (
                <span className="flex items-center gap-1.5">
                  <Trash2 className="size-3.5" /> Delete
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

      {proofExpanded && proofUrl && (
        <ProofFullscreen
          src={proofUrl}
          onClose={() => setProofExpanded(false)}
        />
      )}
    </>
  );
}

/** Compact booking facts shared by the detail and confirmation dialogs. */
function BookingSummary({ booking }: { booking: BookingDetail }) {
  return (
    <div className="space-y-2 rounded-xl border p-4">
      <DetailRow label="Tracking no." value={booking.trackingCode || "—"} />
      <DetailRow label="Name" value={booking.fullName} />
      <DetailRow label="Courts" value={booking.courts || "—"} />
      <DetailRow label="Date" value={formatBookingDate(booking.date)} />
      <DetailRow
        label={`Slots (${booking.slots.length})`}
        value={(() => {
          const groups = new Map<string, string[]>();
          for (const slot of booking.slots) {
            groups.set(slot.courtName, [...(groups.get(slot.courtName) ?? []), slot.slotStart]);
          }
          return [...groups].map(([court, starts]) => formatCourtSlotGroup(court, starts)).join("\n") || "—";
        })()}
      />
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
      {booking.refundReason && (
        <DetailRow label="Refund note" value={booking.refundReason} />
      )}
    </div>
  );
}

/**
 * In-app fullscreen proof viewer: a fixed overlay over the whole viewport with
 * the image contained, closeable by backdrop click or Esc. Rendered through a
 * portal to document.body so it always stacks above the booking dialogs.
 */
function ProofFullscreen({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Payment proof"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-3 sm:p-6"
      onClick={onClose}
    >
      <img
        src={src}
        alt="Payment proof, fullscreen"
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
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
          bold
            ? "whitespace-pre-line text-right font-semibold"
            : "whitespace-pre-line text-right text-muted-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}
