"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import type { BookingDetail } from "@/lib/admin/bookings";

function pesos(total: string): string {
  return `₱${Number(total).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Approved") return "default";
  if (status === "Rejected") return "destructive";
  if (status === "Pending") return "secondary";
  return "outline";
}

export default function BookingActions({ booking }: { booking: BookingDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofFailed, setProofFailed] = useState(false);
  const pending = booking.status === "Pending";

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
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function openDrawer() {
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

  function copyTrackingLink() {
    const url = `${window.location.origin}/track/${booking.trackingToken}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Tracking link copied."),
      () => toast.error("Copy failed."),
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        onClick={openDrawer}
        className="h-7 rounded-lg border-line px-2.5 text-xs font-semibold"
      >
        <Eye className="mr-1 size-3.5" /> View
      </Button>

      <Button
        variant="outline"
        size="icon-sm"
        onClick={copyTrackingLink}
        title="Copy tracking link"
        className="h-7 w-7 rounded-lg border-line"
      >
        <Copy className="size-3.5" />
      </Button>

      {pending && (
        <Button
          variant="outline"
          size="icon-sm"
          disabled={busy !== null}
          onClick={() => decide("approve")}
          title="Quick approve"
          className="h-7 w-7 rounded-lg border-line text-pine hover:bg-pine/5 hover:text-pine"
        >
          <Check className="size-3.5" />
        </Button>
      )}

      {/* Detail sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto border-line bg-parchment p-0 sm:max-w-md">
          <SheetHeader className="border-b border-line bg-white px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle className="text-base font-extrabold text-ink">
                  {booking.fullName}
                </SheetTitle>
                <SheetDescription className="mt-0.5 text-xs text-warm-muted">
                  {booking.email} · {booking.phone}
                </SheetDescription>
              </div>
              <Badge variant={statusVariant(booking.status)} className="mt-0.5 shrink-0 text-[11px]">
                {booking.status}
              </Badge>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-4 px-5 py-5">
            {/* Booking details */}
            <div className="rounded-xl border border-line bg-white p-4 space-y-2">
              <DetailRow label="Courts" value={booking.courts || "—"} />
              <DetailRow label="Date" value={booking.date} />
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
              <p className="mb-2 text-xs font-bold text-ink/60 uppercase tracking-wider">
                Payment proof
              </p>
              <div className="overflow-hidden rounded-xl border border-line bg-white">
                {proofUrl ? (
                  <a href={proofUrl} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={proofUrl}
                      alt="Payment proof"
                      className="w-full object-contain"
                    />
                  </a>
                ) : proofFailed || !booking.proofPath ? (
                  <p className="px-4 py-6 text-center text-sm text-warm-muted">
                    Proof unavailable.
                  </p>
                ) : (
                  <div className="flex min-h-24 items-center justify-center">
                    <LoadingAnimation label="Loading payment proof" />
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyTrackingLink}
                className="h-8 rounded-lg border-line text-xs font-semibold"
              >
                <Copy className="mr-1.5 size-3.5" /> Copy tracking link
              </Button>
            </div>

            {pending && (
              <div className="space-y-3 rounded-xl border border-line bg-white p-4">
                <p className="text-xs font-bold text-ink">Decision</p>

                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => decide("approve")}
                  className="h-8 w-full rounded-lg bg-pine text-xs font-bold text-white hover:bg-pine/90"
                >
                  {busy === "approve" ? (
                    <span className="flex items-center gap-1.5">
                      <LoadingAnimation size="compact" label="Approving" />
                      Approving…
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Check className="size-3.5" /> Approve
                    </span>
                  )}
                </Button>

                <div className="space-y-1.5">
                  <Label
                    htmlFor={`reason-${booking.id}`}
                    className="text-xs font-semibold text-ink/70"
                  >
                    Rejection reason (required)
                  </Label>
                  <Input
                    id={`reason-${booking.id}`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason for rejection…"
                    className="h-9 rounded-lg border-line text-sm"
                  />
                </div>

                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy !== null}
                  onClick={() => decide("reject")}
                  className="h-8 w-full rounded-lg text-xs font-bold"
                >
                  {busy === "reject" ? (
                    <span className="flex items-center gap-1.5">
                      <LoadingAnimation size="compact" label="Rejecting" />
                      Rejecting…
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <X className="size-3.5" /> Reject
                    </span>
                  )}
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
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
      <span className="shrink-0 text-warm-muted">{label}</span>
      <span className={`text-right ${bold ? "font-bold text-ink" : "text-ink/80"}`}>
        {value}
      </span>
    </div>
  );
}
