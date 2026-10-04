"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeAlert,
  BadgeCheck,
  Calendar,
  Check,
  Clock,
  Copy,
  Download,
  MapPin,
  QrCode,
  Receipt,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { formatManilaLong, formatSlotRange } from "@/lib/courts";
import { peso } from "@/lib/pricing-display";

interface SlotItem {
  courtName: string;
  slotStart: string;
}

interface RentalItem {
  paddleQty: number;
  paddleHours: string | null;
  ballFee: string | null;
}

export interface TrackViewProps {
  token: string;
  url: string;
  status: "Pending" | "Approved" | "Rejected" | string;
  fullName: string;
  total: string;
  rejectReason?: string | null;
  slots: SlotItem[];
  rental: RentalItem | null;
}

export default function TrackView({
  token,
  url,
  status,
  fullName,
  total,
  rejectReason,
  slots,
  rental,
}: TrackViewProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const qrRef = useRef<SVGSVGElement>(null);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      toast.success("QR link copied!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Could not copy QR link.");
    }
  };

  const downloadQr = () => {
    const svg = qrRef.current;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ck-grounds-qr-${token.slice(0, 8)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("QR code downloaded!");
  };

  // Courts list
  const courtNames = Array.from(new Set(slots.map((s) => s.courtName)));

  // Date and Time range
  const firstSlot = slots[0]?.slotStart;
  const lastSlot = slots[slots.length - 1]?.slotStart;

  const dateStr = firstSlot ? firstSlot.slice(0, 10) : null;
  const formattedDate = dateStr ? formatManilaLong(dateStr) : "Upcoming";

  const timeRangeLabel =
    slots.length === 0
      ? "No slots"
      : `${formatSlotRange(firstSlot as string).split("–")[0]?.trim()} – ${
          formatSlotRange(lastSlot as string).split("–")[1]?.trim()
        }`;

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-rise">
      {/* Status Card Header */}
      <div className="rounded-3xl border border-line-warm/70 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line-warm/40 pb-6">
          <div>
            <span className="block text-xs font-bold tracking-wider text-warm-muted uppercase">
              Booking Status
            </span>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-ink sm:text-3xl">
              Hello, {fullName}!
            </h1>
          </div>

          {/* Status Pill */}
          <div>
            {status === "Approved" ? (
              <span className="inline-flex items-center gap-2 rounded-2xl border border-live-dot/30 bg-live px-4 py-2 text-xs font-extrabold text-live-dot shadow-xs">
                <BadgeCheck className="size-4" />
                <span>Approved &amp; Confirmed</span>
              </span>
            ) : status === "Rejected" ? (
              <span className="inline-flex items-center gap-2 rounded-2xl border border-error/30 bg-surface-dim/40 px-4 py-2 text-xs font-extrabold text-error shadow-xs">
                <BadgeAlert className="size-4" />
                <span>Booking Rejected</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-extrabold text-amber-800 shadow-xs">
                <Clock className="size-4 animate-spin text-amber-600" />
                <span>Pending Staff Verification</span>
              </span>
            )}
          </div>
        </div>

        {/* Status Message */}
        <div className="mt-5 rounded-2xl bg-cream/50 p-4 text-xs sm:text-sm leading-relaxed text-ink">
          {status === "Approved" ? (
            <p className="flex items-start gap-2 text-live-dot font-semibold">
              <Sparkles className="size-4 shrink-0 mt-0.5" />
              <span>
                Your court reservation is confirmed! Show your QR code at the CK Grounds front desk
                for fast check-in on your game day.
              </span>
            </p>
          ) : status === "Rejected" ? (
            <div className="space-y-1 text-error">
              <p className="font-bold">This booking could not be approved.</p>
              {rejectReason && (
                <p className="font-normal text-ink">
                  <strong>Reason:</strong> {rejectReason}
                </p>
              )}
            </div>
          ) : (
            <p className="text-warm-muted">
              We received your payment proof and reservation details. Venue staff is verifying your
              screenshot. You will receive an approval email shortly once confirmed.
            </p>
          )}
        </div>
      </div>

      {/* Grid: Booking Details & QR Pass */}
      <div className="grid gap-6 sm:grid-cols-12">
        {/* Itemized Details */}
        <div className="space-y-4 sm:col-span-7">
          <div className="rounded-3xl border border-line-warm/70 bg-white p-6 shadow-sm sm:p-7">
            <div className="mb-4 flex items-center justify-between border-b border-line-warm/40 pb-3">
              <h2 className="text-lg font-bold text-ink">Court Reservation</h2>
              <Receipt className="size-5 text-pine" />
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-flame" />
                <div>
                  <span className="block text-xs font-semibold text-warm-muted">Court(s)</span>
                  <span className="font-bold text-ink">
                    {courtNames.length > 0 ? courtNames.join(", ") : "CK Grounds Court"}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 size-4 shrink-0 text-flame" />
                <div>
                  <span className="block text-xs font-semibold text-warm-muted">Play Date</span>
                  <span className="font-bold text-ink">{formattedDate}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 size-4 shrink-0 text-flame" />
                <div>
                  <span className="block text-xs font-semibold text-warm-muted">Time & Duration</span>
                  <span className="font-bold text-ink">
                    {timeRangeLabel} ({slots.length} hour{slots.length === 1 ? "" : "s"})
                  </span>
                </div>
              </div>

              {/* Rentals itemization */}
              {rental && (rental.paddleQty > 0 || rental.ballFee != null) && (
                <div className="border-t border-line-warm/40 pt-3">
                  <span className="block text-xs font-semibold text-warm-muted mb-1.5">
                    Equipment Rentals
                  </span>
                  <div className="space-y-1 text-xs text-ink">
                    {rental.paddleQty > 0 && (
                      <div className="flex justify-between">
                        <span>
                          {rental.paddleQty} × Paddle Rental (
                          {rental.paddleHours ?? slots.length}h)
                        </span>
                        <span className="font-semibold text-warm-muted">Included</span>
                      </div>
                    )}
                    {rental.ballFee != null && (
                      <div className="flex justify-between">
                        <span>Ball Rental (Flat fee)</span>
                        <span className="font-semibold text-warm-muted">Included</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Total Row */}
              <div className="flex items-baseline justify-between border-t border-line-warm/60 pt-3.5">
                <span className="text-base font-bold text-ink">Total Paid</span>
                <span className="text-2xl font-black text-flame">{peso(Number(total))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* QR Digital Pass */}
        <div className="flex flex-col items-center justify-center rounded-3xl border border-line-warm/70 bg-white p-6 text-center shadow-sm sm:col-span-5 sm:p-7">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-pine uppercase tracking-wider">
            <QrCode className="size-4 text-flame" />
            <span>Digital Pass</span>
          </div>

          <div className="my-3 rounded-2xl border-2 border-line-warm/80 bg-white p-3 shadow-xs">
            <QRCodeSVG ref={qrRef} value={url} size={160} level="M" />
          </div>

          <p className="text-[11px] leading-relaxed text-warm-muted">
            Show this QR code at CK Grounds front desk for fast check-in.
          </p>

          <div className="mt-4 flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={downloadQr}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-flame px-3 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-flame-hover active:scale-[0.98]"
            >
              <Download className="size-3.5" />
              <span>Download QR</span>
            </button>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-line-warm/70 bg-cream px-3 py-2 text-xs font-bold text-pine transition-colors hover:bg-oat"
            >
              {copiedLink ? (
                <>
                  <Check className="size-3.5 text-live-dot" />
                  <span>Link Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  <span>Copy QR Link</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Actions Footer */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
        <Link
          href="/book"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-flame px-6 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99]"
        >
          <RotateCcw className="size-4" />
          <span>Book Another Court</span>
        </Link>

        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-line-warm/70 bg-white px-5 text-sm font-bold text-ink transition-all hover:bg-cream"
        >
          <span>Return to Homepage</span>
          <ArrowRight className="size-4 text-warm-muted" />
        </Link>
      </div>
    </div>
  );
}
