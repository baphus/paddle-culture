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
import type { BookingDetail } from "@/lib/admin/bookings";

function pesos(total: string): string {
  return `₱${Number(total).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    <div>
      <Button variant="outline" size="sm" onClick={openDrawer}>
        <Eye /> View
      </Button>{" "}
      <Button variant="outline" size="sm" onClick={copyTrackingLink} title="Copy tracking link">
        <Copy />
      </Button>{" "}
      {pending ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => decide("approve")}
          title="Approve"
        >
          <Check />
        </Button>
      ) : null}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {booking.fullName} — {booking.status}
            </SheetTitle>
            <SheetDescription>
              {booking.email} · {booking.phone}
            </SheetDescription>
          </SheetHeader>
          <div>
            <p>Courts: {booking.courts || "—"}</p>
            <p>Date: {booking.date}</p>
            <p>Slots: {booking.slotLabels.join(", ") || "—"}</p>
            <p>
              Paddles: {booking.paddleQty}
              {booking.paddleQty > 0 && booking.paddleHours
                ? ` × ${booking.paddleHours}h`
                : null}
              {booking.hasBall ? " · Ball: yes" : null}
            </p>
            <p>Total: {pesos(booking.total)}</p>
            {booking.rejectReason ? <p>Reject reason: {booking.rejectReason}</p> : null}
            <div>
              <p>Payment proof:</p>
              {proofUrl ? (
                <a href={proofUrl} target="_blank" rel="noreferrer">
                  <img src={proofUrl} alt="Payment proof" width={320} />
                </a>
              ) : proofFailed || !booking.proofPath ? (
                <p>Proof unavailable.</p>
              ) : (
                <div className="flex min-h-20 items-center"><LoadingAnimation label="Loading payment proof" /></div>
              )}
            </div>
            <div>
              <Button variant="outline" size="sm" onClick={copyTrackingLink}>
                <Copy /> Copy tracking link
              </Button>
            </div>
            {pending ? (
              <div>
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => decide("approve")}
                >
                  <Check /> Approve
                </Button>{" "}
                <div>
                  <Label htmlFor={`reason-${booking.id}`}>Rejection reason (required)</Label>
                  <Input
                    id={`reason-${booking.id}`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason for rejection"
                  />
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => decide("reject")}
                >
                  <X /> Reject
                </Button>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
