"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeAlert,
  BadgeCheck,
  Check,
  Clock,
  Copy,
  Download,
  Hash,
  QrCode,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import type { DisplayRates } from "@/lib/pricing-display";
import { maskEmail, maskPhone } from "@/lib/booking/redact";
import { slotSelectionDateStr } from "@/lib/booking/slots";
import BookingInvoice from "@/components/booking/booking-invoice";

interface SlotItem {
  courtId: string;
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
  email: string;
  phone: string;
  total: string;
  rejectReason?: string | null;
  refundReason?: string | null;
  trackingCode: string;
  /** Manila selection date from `bookings.play_date`. Null only if the row
   *  predates the column; the invoice then falls back to the slot instants. */
  playDate?: string | null;
  slots: SlotItem[];
  rental: RentalItem | null;
  rates?: DisplayRates;
}

export default function TrackView({
  token,
  url,
  status,
  fullName,
  email,
  phone,
  total,
  rejectReason,
  refundReason,
  trackingCode,
  playDate,
  slots,
  rental,
  rates,
}: TrackViewProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const qrRef = useRef<HTMLCanvasElement>(null);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      toast.success("Booking link copied!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Could not copy link.");
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(trackingCode);
      setCopiedCode(true);
      toast.success("Tracking code copied!");
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error("Could not copy tracking code.");
    }
  };

  const downloadQr = () => {
    const canvas = qrRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `ck-grounds-qr-${token.slice(0, 8)}.png`;
    a.click();
    toast.success("QR code downloaded!");
  };

  // Courts list
  const courtNames = Array.from(new Set(slots.map((s) => s.courtName)));

  // Slot instants, earliest first (invoice + calendar both read this)
  const sortedStarts = slots
    .map((s) => s.slotStart)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  // Play Date: read the stored column. It is written once, in SQL, at creation
  // time (bookings.play_date), so no surface can disagree with another. The
  // helper is only a safety net for rows that predate the column.
  const playDateStr = playDate || slotSelectionDateStr(sortedStarts);

  // Per-court attribution for the invoice — each row carries its own court.
  const slotGroups = courtNames.map((name) => ({
    courtId: slots.find((s) => s.courtName === name)?.courtId,
    courtName: name,
    slotStarts: slots.filter((s) => s.courtName === name).map((s) => s.slotStart),
  }));

  const equipment = {
    paddleQty: rental?.paddleQty ?? 0,
    paddleHours: rental?.paddleHours != null ? Number(rental.paddleHours) : null,
    ball: rental?.ballFee != null,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-rise">

      {/* ── Status Card ── */}
      <div className="rounded-3xl border border-line-warm/70 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center gap-4 border-b border-line-warm/40 pb-6 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <div>
            <span className="block text-xs font-bold tracking-wider text-warm-muted uppercase">
              Booking status · {trackingCode}
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
            ) : status === "Refunded" ? (
              <span className="inline-flex items-center gap-2 rounded-2xl border border-line-warm/60 bg-surface-dim/40 px-4 py-2 text-xs font-extrabold text-ink shadow-xs">
                <RotateCcw className="size-4" />
                <span>Booking Refunded</span>
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
        <div className="mt-5 rounded-2xl bg-cream/50 p-4 text-center text-xs leading-relaxed text-ink sm:text-sm">
          {status === "Approved" ? (
            <p className="flex flex-col items-center gap-2 font-semibold text-live-dot sm:flex-row sm:items-start sm:justify-center sm:text-left">
              <Sparkles className="size-4 shrink-0 sm:mt-0.5" />
              <span>
                Your court reservation is confirmed! Show your QR code at the CK Grounds front desk
                for fast check-in on your game day.
              </span>
            </p>
          ) : status === "Refunded" ? (
            <div className="space-y-1">
              <p className="font-bold">This booking has been refunded.</p>
              <p className="font-normal text-ink">
                Its court slots have been released. If you have questions about
                the refund, please contact us.
              </p>
              {refundReason && (
                <p className="font-normal text-ink">
                  <strong>Note:</strong> {refundReason}
                </p>
              )}
            </div>
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

      {/* ── Booking Invoice ── */}
      <BookingInvoice
        token={token}
        total={total}
        courtNames={courtNames}
        slotStarts={sortedStarts}
        slotGroups={slotGroups}
        dateStr={playDateStr}
        player={{ fullName, email: maskEmail(email), phone: maskPhone(phone) }}
        equipment={equipment}
        bookingUrl={url}
        rates={rates}
      />

      {/* ── QR Check-in Pass ── */}
      <div className="rounded-3xl border border-line-warm/70 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-5 flex items-center justify-between border-b border-line-warm/40 pb-4">
          <div>
            <span className="block text-xs font-bold tracking-wider text-warm-muted uppercase">
              Check-in Pass
            </span>
            <h2 className="mt-0.5 text-lg font-bold text-ink">Your check-in QR pass</h2>
          </div>
          <QrCode className="size-5 text-flame" />
        </div>

        <p className="mb-6 text-center text-xs leading-relaxed text-warm-muted sm:text-sm">
          {status === "Approved"
            ? "Your booking is confirmed. Show this QR code at the CK Grounds front desk on your game day to check in."
            : status === "Refunded"
              ? "This booking was refunded, so this QR pass is no longer valid for check-in."
              : "Keep this QR code for your records. Check your booking status above; show the QR at the front desk after your reservation is approved."}
          {" "}If you cannot show the QR, staff can look up your booking with the tracking code.
        </p>

        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          {/* QR Code */}
          <div className="flex-shrink-0 rounded-2xl border-2 border-line-warm/80 bg-white p-4 shadow-xs">
            <QRCodeCanvas ref={qrRef} value={url} size={360} level="M" style={{ width: 180, height: 180 }} />
          </div>

          {/* Tracking code + actions */}
          <div className="flex w-full flex-col gap-4 sm:justify-between">
            {/* Tracking Code badge */}
            <div className="rounded-2xl border border-line-warm/60 bg-cream/60 p-4">
              <div className="mb-1.5 flex items-center justify-center gap-1.5 sm:justify-between">
                <div className="flex items-center gap-1.5">
                  <Hash className="size-3.5 text-flame" aria-hidden />
                  <span className="text-xs font-bold tracking-wider text-warm-muted uppercase">
                    Tracking Code
                  </span>
                </div>
                <button
                  type="button"
                  onClick={copyCode}
                  aria-label="Copy tracking code"
                  className="inline-flex items-center gap-1 rounded-lg border border-line-warm/50 bg-white px-2 py-1 text-[11px] font-semibold text-pine transition-all hover:bg-oat active:scale-95"
                >
                  {copiedCode ? (
                    <>
                      <Check className="size-3 text-live-dot" aria-hidden />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" aria-hidden />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-center font-mono text-3xl font-black tracking-[0.25em] text-ink sm:text-left">
                {trackingCode}
              </p>
              <p className="mt-1 text-center text-[11px] text-warm-muted sm:text-left">Quote this to front desk staff for manual look-up.</p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={downloadQr}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-flame px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-flame-hover hover:-translate-y-0.5 active:scale-[0.98]"
              >
                <Download className="size-4" aria-hidden />
                <span>Download QR</span>
              </button>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-line-warm/70 bg-cream px-4 py-2.5 text-xs font-bold text-pine transition-all hover:bg-oat hover:-translate-y-0.5 active:scale-[0.98]"
              >
                {copiedLink ? (
                  <>
                    <Check className="size-4 text-live-dot" aria-hidden />
                    <span>Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-4" aria-hidden />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Actions Footer ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2 pb-2">
        <Link
          href="/book"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-flame px-6 text-sm font-bold text-white shadow-sm transition-all hover:bg-flame-hover hover:-translate-y-0.5 active:scale-[0.99]"
        >
          <RotateCcw className="size-4" aria-hidden />
          <span>Book Another Court</span>
        </Link>

        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-line-warm/70 bg-white px-6 text-sm font-bold text-ink transition-all hover:bg-cream hover:-translate-y-0.5 active:scale-[0.99]"
        >
          <span>Back to Homepage</span>
          <ArrowRight className="size-4 text-warm-muted" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
