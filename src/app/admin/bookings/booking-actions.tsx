"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Eye, Maximize2, X } from "lucide-react";
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
  const [proofExpanded, setProofExpanded] = useState(false);
  const pending = booking.status === "Pending";
  const proofOpen = open || decision !== null;

  function closeDecision() {
    setDecision(null);
    setReason("");
  }

  // Signed URL for the payment proof, shared by the detail and confirmation
  // dialogs and cached after the first successful (or failed) read.
  const loadProof = useCallback(async () => {
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
  }, [booking.proofPath, proofUrl, proofFailed]);

  useEffect(() => {
    if (proofOpen) void loadProof();
  }, [proofOpen, loadProof]);

  // The fullscreen viewer belongs to the dialogs; drop it when either closes.
  useEffect(() => {
    if (!proofOpen) setProofExpanded(false);
  }, [proofOpen]);

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

  return (
    <div className="flex items-center gap-1.5">
      {/* Mobile: icon-only so the pinned actions column stays narrow. */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="View"
      >
        <Eye className="size-3.5" />
        <span className="sr-only sm:not-sr-only">View</span>
      </Button>

      {pending && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => setDecision("approve")}
          title="Quick approve"
        >
          <Check className="size-3.5" />
          <span className="sr-only sm:not-sr-only">Approve</span>
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
            <BookingSummary booking={booking} />

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Payment proof
              </p>
              <ProofThumb
                proofUrl={proofUrl}
                failed={proofFailed || !booking.proofPath}
                onExpand={() => setProofExpanded(true)}
                showExpandButton
              />
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

          {proofExpanded && proofUrl && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/95 p-4">
              <img
                src={proofUrl}
                alt="Payment proof, expanded"
                className="max-h-[70dvh] w-auto max-w-full object-contain"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-2 right-2"
                onClick={() => setProofExpanded(false)}
                title="Collapse proof"
              >
                <X className="size-4" />
                <span className="sr-only">Collapse proof</span>
              </Button>
            </div>
          )}
        </DialogContent>

        {proofExpanded && proofUrl && (
          <ProofFullscreen
            src={proofUrl}
            onClose={() => setProofExpanded(false)}
          />
        )}
      </Dialog>

      {/* Approve / reject confirmation dialog */}
      <Dialog
        open={decision !== null}
        onOpenChange={(o) => {
          if (!o && busy === null) closeDecision();
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-1 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="gap-1 px-4 pt-4 pr-10">
            <DialogTitle>
              {decision === "reject" ? "Reject booking" : "Approve booking"}
            </DialogTitle>
            <DialogDescription>
              {decision === "reject"
                ? "This rejects the booking and emails the customer. A reason is required."
                : `This approves the booking and emails a confirmation to ${booking.email}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pt-3">
            <BookingSummary booking={booking} />

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Payment proof
              </p>
              <ProofThumb
                proofUrl={proofUrl}
                failed={proofFailed || !booking.proofPath}
                onExpand={() => setProofExpanded(true)}
              />
            </div>

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
          </div>

          <DialogFooter className="mx-0 mb-0 mt-1 flex-row justify-end rounded-b-xl border-t bg-muted/50 px-4 py-3">
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

        {proofExpanded && proofUrl && (
          <ProofFullscreen
            src={proofUrl}
            onClose={() => setProofExpanded(false)}
          />
        )}
      </Dialog>
    </div>
  );
}

/** Compact booking facts shared by the detail and confirmation dialogs. */
function BookingSummary({ booking }: { booking: BookingDetail }) {
  return (
    <div className="space-y-2 rounded-xl border p-4">
      <DetailRow label="Name" value={booking.fullName} />
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
  );
}

/**
 * Small informational proof preview. Clicking (or the expand affordance) opens
 * the in-app fullscreen viewer — never a new tab with the raw image.
 */
function ProofThumb({
  proofUrl,
  failed,
  onExpand,
  showExpandButton,
}: {
  proofUrl: string | null;
  failed: boolean;
  onExpand?: () => void;
  /** Always-visible expand button, for touch devices with no hover. */
  showExpandButton?: boolean;
}) {
  const frame =
    "size-16 shrink-0 overflow-hidden rounded-lg border bg-muted/30 sm:size-20";

  let preview: ReactNode;
  if (proofUrl) {
    const img = (
      <img
        src={proofUrl}
        alt="Payment proof"
        className="size-full object-cover"
      />
    );
    preview = onExpand ? (
      <button
        type="button"
        onClick={onExpand}
        className={`${frame} group/proof relative cursor-zoom-in`}
        title="Expand payment proof"
      >
        {img}
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/proof:opacity-100">
          <Maximize2 className="size-4 text-white" />
        </span>
      </button>
    ) : (
      <div className={frame}>{img}</div>
    );
  } else if (failed) {
    preview = (
      <div
        className={`${frame} flex items-center justify-center px-1 text-center text-[10px] leading-tight text-muted-foreground`}
      >
        Proof unavailable.
      </div>
    );
  } else {
    preview = (
      <div className={`${frame} flex items-center justify-center`}>
        <LoadingAnimation size="compact" label="Loading payment proof" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {preview}
      <div className="min-w-0 space-y-1.5">
        <p className="text-xs text-muted-foreground">
          {proofUrl
            ? "Tap or click the preview to view it fullscreen."
            : failed
              ? "No proof was uploaded for this booking."
              : "Loading…"}
        </p>
        {proofUrl && onExpand && showExpandButton && (
          <Button variant="outline" size="xs" onClick={onExpand}>
            <Maximize2 className="size-3" /> View fullscreen
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * In-app fullscreen proof viewer: a fixed overlay over the whole viewport with
 * the image contained, closeable by backdrop click, Esc, or the close button.
 */
function ProofFullscreen({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Payment proof"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-3 sm:p-6"
      onClick={onClose}
    >
      <img
        src={src}
        alt="Payment proof, fullscreen"
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <Button
        variant="secondary"
        size="icon"
        className="absolute top-3 right-3 sm:top-5 sm:right-5"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="Close preview"
      >
        <X className="size-4" />
        <span className="sr-only">Close preview</span>
      </Button>
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
