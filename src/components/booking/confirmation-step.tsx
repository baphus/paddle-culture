"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
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
import type { DetailsValues } from "./details-form";

export interface ConfirmationProps {
  trackingToken: string;
  total: string;
  courtNames: string[];
  slotStarts: string[];
  dateStr?: string | null;
  details: DetailsValues;
  onBookAnother: () => void;
}

export default function ConfirmationStep({
  trackingToken,
  total,
  courtNames,
  slotStarts,
  dateStr,
  details,
  onBookAnother,
}: ConfirmationProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [trackingUrl, setTrackingUrl] = useState(`/track/${trackingToken}`);

  useEffect(() => {
    setTrackingUrl(`${window.location.origin}/track/${trackingToken}`);
  }, [trackingToken]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(trackingUrl);
      setCopiedLink(true);
      toast.success("Booking link copied!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Could not copy link. Please copy manually.");
    }
  };

  const sortedSlots = [...slotStarts].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );
  const firstSlot = sortedSlots[0];
  const lastSlot = sortedSlots[sortedSlots.length - 1];

  const timeRangeLabel =
    sortedSlots.length === 0
      ? ""
      : `${formatSlotRange(firstSlot as string).split("–")[0]?.trim()} – ${
          formatSlotRange(lastSlot as string).split("–")[1]?.trim()
        }`;

  const formattedDate = dateStr
    ? formatManilaLong(dateStr)
    : firstSlot
      ? formatManilaLong(firstSlot.slice(0, 10))
      : "Upcoming";

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-rise">
      {/* Header Banner */}
      <div className="rounded-3xl border border-line-warm/70 bg-white p-6 text-center shadow-md sm:p-8">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-live text-live-dot sm:size-16">
          <BadgeCheck className="size-8 sm:size-9" />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-live-dot/20 bg-live px-3 py-1 text-xs font-bold text-live-dot">
          <Sparkles className="size-3.5" />
          <span>Booking Request Received</span>
        </div>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-ink sm:text-3xl">
          You&apos;re almost ready to play!
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-warm-muted sm:text-base">
          We&apos;ve sent your submission receipt to{" "}
          <strong className="font-semibold text-ink">{details.email}</strong>. Our staff will verify
          your payment screenshot shortly.
        </p>

        {/* Status Pill */}
        <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
          <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Status: Pending Verification</span>
        </div>
      </div>

      {/* QR Digital Pass — Hero */}
      <div className="rounded-3xl border border-line-warm/70 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          {/* QR block */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-pine uppercase tracking-wider">
              <QrCode className="size-4 text-flame" />
              <span>Your Digital Pass</span>
            </div>
            <div className="rounded-2xl border-2 border-line-warm/80 bg-white p-3 shadow-xs">
              <QRCodeSVG value={trackingUrl} size={200} level="M" />
            </div>
          </div>

          {/* Text + actions */}
          <div className="flex flex-1 flex-col justify-between gap-4 text-center sm:text-left">
            <div>
              <h2 className="text-lg font-extrabold text-ink sm:text-xl">Save or Share Your QR Pass</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-warm-muted">
                Scan to view your booking status anytime, or present this QR code at the CK Grounds
                front desk for fast check-in on your game day.
              </p>
              <p className="mt-2 text-xs text-warm-muted">
                A copy has also been sent to <strong className="font-semibold text-ink">{details.email}</strong>.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href={`/track/${trackingToken}`}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-flame px-4 text-sm font-bold text-white shadow-sm transition-all hover:bg-flame-hover active:scale-[0.98]"
              >
                <span>View Live Status</span>
                <ExternalLink className="size-4" />
              </Link>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-line-warm/70 bg-cream px-4 text-sm font-bold text-pine transition-colors hover:bg-oat"
              >
                {copiedLink ? (
                  <>
                    <Check className="size-4 text-live-dot" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-4" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Booking Receipt */}
      <div className="rounded-3xl border border-line-warm/70 bg-white p-6 shadow-sm sm:p-7">
        <div className="mb-4 flex items-center justify-between border-b border-line-warm/40 pb-3">
          <h2 className="text-lg font-bold text-ink">Booking Receipt</h2>
          <Receipt className="size-5 text-pine" />
        </div>

        <div className="space-y-3.5 text-sm">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-4 shrink-0 text-flame" />
            <div>
              <span className="block text-xs font-semibold text-warm-muted">Courts</span>
              <span className="font-bold text-ink">{courtNames.join(", ")}</span>
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
                {timeRangeLabel} ({sortedSlots.length} hour
                {sortedSlots.length === 1 ? "" : "s"})
              </span>
            </div>
          </div>

          {/* Rentals */}
          {(details.paddleQty > 0 || details.ball) && (
            <div className="border-t border-line-warm/40 pt-3">
              <span className="block text-xs font-semibold text-warm-muted mb-1.5">
                Equipment Rentals
              </span>
              <div className="space-y-1 text-xs text-ink">
                {details.paddleQty > 0 && (
                  <div className="flex justify-between">
                    <span>
                      {details.paddleQty} × Paddle Rental (
                      {details.paddleHours ?? sortedSlots.length}h)
                    </span>
                    <span className="font-semibold text-warm-muted">Included</span>
                  </div>
                )}
                {details.ball && (
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
            <span className="text-base font-bold text-ink">Total Amount</span>
            <span className="text-2xl font-black text-flame">{peso(Number(total))}</span>
          </div>
        </div>
      </div>

      {/* Next Steps Guidance */}
      <div className="rounded-3xl border border-line-warm/60 bg-oat/40 p-6 sm:p-7">
        <h3 className="text-base font-bold text-ink">What happens next?</h3>
        <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-ink/80 sm:text-sm">
          <li className="flex items-start gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-pine text-[11px] font-bold text-white">
              1
            </span>
            <span>
              <strong>Staff Verification:</strong> Venue managers verify payment proofs in real-time.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-pine text-[11px] font-bold text-white">
              2
            </span>
            <span>
              <strong>Approval Confirmation:</strong> You will receive an official approval email
              confirming court access.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-pine text-[11px] font-bold text-white">
              3
            </span>
            <span>
              <strong>Show Up & Play:</strong> Bring your tracking code or scan your QR pass at CK
              Grounds front desk on your game day!
            </span>
          </li>
        </ol>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
        <Link
          href={`/track/${trackingToken}`}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-flame px-6 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99]"
        >
          <span>View Live Tracking Page</span>
          <ExternalLink className="size-4" />
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBookAnother}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-line-warm/70 bg-white px-5 text-sm font-bold text-ink transition-all hover:bg-cream"
          >
            <RotateCcw className="size-4 text-warm-muted" />
            <span>Book Another Slot</span>
          </button>

          <Link
            href="/"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl px-4 text-xs font-semibold text-warm-muted hover:text-ink"
          >
            Home <ArrowRight className="ml-1 size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
