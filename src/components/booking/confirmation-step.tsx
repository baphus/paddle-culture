"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Copy,
  Download,
  ExternalLink,
  MapPin,
  QrCode,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import type { DisplayRates } from "@/lib/pricing-display";
import { VENUE_ADDRESS, VENUE_FACEBOOK_LINK, VENUE_MAP_LINK } from "@/lib/venue";
import { VENUE_PHONE_DISPLAY, VENUE_PHONE_LINK } from "@/lib/booking/constants";
import BookingInvoice from "./booking-invoice";
import type { DetailsValues } from "./details-form";
import type { CourtSlotGroup } from "@/lib/courts";

export interface ConfirmationProps {
  trackingToken: string;
  trackingCode: string;
  total: string;
  /** True when the confirmation email could not be confirmed sent in time. */
  emailDeferred?: boolean;
  courtNames: string[];
  slotStarts: string[];
  /** Per-court slot attribution — forwarded to the invoice for per-court time lines. */
  slotGroups?: CourtSlotGroup[];
  dateStr?: string | null;
  details: DetailsValues;
  /** Live rates used to render invoice line items (falls back to FALLBACK_RATES) */
  rates?: DisplayRates;
  onBookAnother: () => void;
}

export default function ConfirmationStep({
  trackingToken,
  trackingCode,
  total,
  emailDeferred = false,
  courtNames,
  slotStarts,
  slotGroups,
  dateStr,
  details,
  rates,
  onBookAnother,
}: ConfirmationProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [bookingUrl, setBookingUrl] = useState(`/track/${trackingToken}`);
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setBookingUrl(`${window.location.origin}/track/${trackingToken}`);
  }, [trackingToken]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopiedLink(true);
      toast.success("QR link copied!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Could not copy link. Please copy manually.");
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(trackingCode);
      setCopiedCode(true);
      toast.success("Tracking code copied!");
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error("Could not copy code. Please copy manually.");
    }
  };

  const downloadQr = () => {
    const canvas = qrRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `ck-grounds-qr-${trackingToken.slice(0, 8)}.png`;
    a.click();
    toast.success("QR code downloaded!");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-rise">

      {/* ── Confirmed banner ── */}
      <div className="rounded-3xl border border-live-dot/20 bg-white p-6 text-center shadow-md sm:p-8">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-live text-live-dot sm:size-16">
          <BadgeCheck className="size-8 sm:size-9" aria-hidden />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-live-dot/20 bg-live px-3 py-1 text-xs font-bold text-live-dot">
          <Sparkles className="size-3.5" aria-hidden />
          <span>Booking Request Received</span>
        </div>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-ink sm:text-3xl">
          You&apos;re almost ready to play!
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-warm-muted">
          We&apos;ve sent your receipt to{" "}
          <strong className="font-semibold text-ink">{details.email}</strong>. Staff will verify
          your payment screenshot shortly.
        </p>
        <p className="mx-auto mt-3 max-w-lg rounded-xl border border-line-warm/70 bg-cream/70 px-4 py-3 text-xs leading-relaxed text-ink/80">
          Didn&apos;t receive the email? Please check your spam folder. You can also{" "}
          <a
            href={VENUE_FACEBOOK_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-flame underline decoration-flame/40 underline-offset-2 hover:text-flame-hover"
          >
            message our Facebook page
          </a>{" "}
          or call/text{" "}
          <a
            href={VENUE_PHONE_LINK}
            className="whitespace-nowrap font-bold text-flame underline decoration-flame/40 underline-offset-2 hover:text-flame-hover"
          >
            {VENUE_PHONE_DISPLAY}
          </a>
          .
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
          <span className="size-2 rounded-full bg-amber-500 animate-pulse" aria-hidden />
          <span>Status: Pending Verification</span>
        </div>
      </div>

      {/* ── Full Booking Invoice ── */}
      <BookingInvoice
        token={trackingToken}
        total={total}
        courtNames={courtNames}
        slotStarts={slotStarts}
        slotGroups={slotGroups}
        dateStr={dateStr}
        player={details}
        equipment={details}
        bookingUrl={bookingUrl}
        rates={rates}
      />

      {/* ── Tracking pass ── */}
      <div className="rounded-3xl border border-line-warm/60 bg-white p-6 shadow-sm sm:p-7">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-flame-light text-flame">
            <QrCode className="size-4.5" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-ink">Your Tracking Pass</h2>
            <p className="text-[11px] font-semibold text-warm-muted">
              Either one opens your booking — two ways to the same thing
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {/* QR — primary */}
          <div className="rounded-2xl border border-line-warm/60 bg-cream/60 p-5 text-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-warm-muted">
              QR code
            </span>
            <div className="mt-3 flex flex-col items-center gap-3">
              <div className="rounded-2xl border-2 border-line-warm/80 bg-white p-3 shadow-xs">
                <QRCodeCanvas
                  ref={qrRef}
                  value={bookingUrl}
                  size={280}
                  level="M"
                  style={{ width: 140, height: 140 }}
                />
              </div>
              <p className="text-[11px] leading-relaxed text-warm-muted">
                Scan it to open your booking — handy to show on arrival.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-line-warm/60" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-warm-muted">Or</span>
            <span className="h-px flex-1 bg-line-warm/60" />
          </div>

          {/* Tracking code — alternative */}
          <div className="rounded-2xl border border-line-warm/60 bg-cream/60 p-5 text-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-warm-muted">
              Tracking code
            </span>
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="rounded-xl border border-line-warm/70 bg-white px-4 py-2 font-mono text-xl font-black tracking-[0.3em] text-ink">
                {trackingCode}
              </span>
              <button
                type="button"
                onClick={copyCode}
                aria-label="Copy tracking code"
                title="Copy tracking code"
                className="grid size-9 shrink-0 place-items-center rounded-xl border border-line-warm/70 bg-white text-ink transition-colors hover:bg-oat"
              >
                {copiedCode ? (
                  <Check className="size-3.5 text-live-dot" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-warm-muted">
              Enter this code with your email to open your booking.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={downloadQr}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-flame px-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-flame-hover active:scale-[0.99]"
          >
            <Download className="size-4" aria-hidden />
            <span>Download QR Pass</span>
          </button>
          <div className="flex gap-2">
            <Link
              href={`/track/${trackingToken}`}
              className="inline-flex min-h-[42px] min-w-0 flex-1 items-center justify-center gap-1 rounded-xl border border-line-warm/70 bg-white px-3 text-xs font-bold whitespace-nowrap text-ink transition-colors hover:bg-cream"
            >
              <span>View Status</span>
              <ExternalLink className="size-3 text-warm-muted" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex min-h-[42px] min-w-0 flex-1 items-center justify-center gap-1 rounded-xl border border-line-warm/70 bg-white px-3 text-xs font-bold whitespace-nowrap text-pine transition-colors hover:bg-cream"
            >
              {copiedLink ? (
                <><Check className="size-3 text-live-dot" aria-hidden /><span>Copied!</span></>
              ) : (
                <><Copy className="size-3" aria-hidden /><span>Copy Link</span></>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Venue location ── */}
      <div className="rounded-3xl border border-line-warm/60 bg-white p-6 shadow-sm sm:p-7">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-flame-light text-flame">
            <MapPin className="size-4.5" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-ink">Where to find us</h2>
            <p className="text-[11px] font-semibold text-warm-muted">CK Grounds · Tabuelan, Cebu</p>
          </div>
        </div>
        <p className="mt-4 text-sm font-semibold text-ink">{VENUE_ADDRESS}</p>
        <a
          href={VENUE_MAP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-flame px-5 text-sm font-bold text-white shadow-sm transition-all hover:bg-flame-hover active:scale-[0.99] sm:w-auto"
        >
          Open in Google Maps
          <ExternalLink className="size-4" aria-hidden />
        </a>
      </div>

      {/* ── What happens next ── */}
      <div className="rounded-3xl border border-line-warm/60 bg-oat/40 p-6 sm:p-7">
        <h3 className="text-sm font-extrabold text-ink">What happens next?</h3>
        <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-ink/80 sm:text-sm">
          <li className="flex items-start gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-pine text-[11px] font-bold text-white">1</span>
            <span><strong>Staff Verification:</strong> Venue managers verify your payment screenshot in real-time.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-pine text-[11px] font-bold text-white">2</span>
            <span>
              <strong>Approval Email:</strong>{" "}
              {emailDeferred ? (
                <>
                  A confirmation is <strong className="text-ink">on its way</strong> to{" "}
                  <strong className="text-ink">{details.email}</strong> — usually within a few
                  minutes. If it hasn&apos;t arrived in 10 minutes, check your spam folder or
                  contact us with your tracking code above.
                </>
              ) : (
                <>
                  You&apos;ll receive an official confirmation to{" "}
                  <strong className="text-ink">{details.email}</strong>.
                </>
              )}
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-pine text-[11px] font-bold text-white">3</span>
            <span><strong>Show Up &amp; Play:</strong> Present your QR pass at the CK Grounds front desk on game day!</span>
          </li>
        </ol>
      </div>

      {/* ── Action buttons ── */}
      <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBookAnother}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-line-warm/70 bg-white px-5 text-sm font-bold text-ink transition-all hover:bg-cream"
          >
            <RotateCcw className="size-4 text-warm-muted" aria-hidden />
            <span>Book Another</span>
          </button>
          <Link
            href="/"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl px-4 text-xs font-semibold text-warm-muted hover:text-ink"
          >
            Home <ArrowRight className="ml-1 size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
