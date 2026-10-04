"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Calendar,
  Check,
  Clock,
  Copy,
  Download,
  Dumbbell,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  QrCode,
  Receipt,
  RotateCcw,
  Sparkles,
  User,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { formatManilaLong, formatSlotRange } from "@/lib/courts";
import { timeBandFor } from "@/lib/booking/slots";
import { FALLBACK_RATES, peso, type DisplayRates } from "@/lib/pricing-display";
import type { DetailsValues } from "./details-form";

export interface ConfirmationProps {
  trackingToken: string;
  total: string;
  courtNames: string[];
  slotStarts: string[];
  dateStr?: string | null;
  details: DetailsValues;
  /** Live rates used to render invoice line items (falls back to FALLBACK_RATES) */
  rates?: DisplayRates;
  onBookAnother: () => void;
}

export default function ConfirmationStep({
  trackingToken,
  total,
  courtNames,
  slotStarts,
  dateStr,
  details,
  rates = FALLBACK_RATES,
  onBookAnother,
}: ConfirmationProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [bookingUrl, setBookingUrl] = useState(`/track/${trackingToken}`);
  const qrRef = useRef<SVGSVGElement>(null);

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

  const downloadQr = () => {
    const svg = qrRef.current;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `ck-grounds-qr-${trackingToken.slice(0, 8)}.svg`;
    a.click();
    URL.revokeObjectURL(objectUrl);
    toast.success("QR code downloaded!");
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

  // Build invoice line items from server total (or fall back to rate-based estimate)
  const invoiceLines = (() => {
    let dayCount = 0;
    let nightCount = 0;
    for (const iso of sortedSlots) {
      if (timeBandFor(new Date(iso)) === "evening") nightCount++;
      else dayCount++;
    }
    const n = courtNames.length || 1;
    const lines: { label: string; amount: number }[] = [];
    if (dayCount > 0)
      lines.push({
        label: `Daytime court (${dayCount} hr${dayCount === 1 ? "" : "s"} × ${n > 1 ? `${n} courts` : "1 court"})`,
        amount: dayCount * rates.morning * n,
      });
    if (nightCount > 0)
      lines.push({
        label: `Evening court (${nightCount} hr${nightCount === 1 ? "" : "s"} × ${n > 1 ? `${n} courts` : "1 court"})`,
        amount: nightCount * rates.evening * n,
      });
    if (details.paddleQty > 0) {
      const ph = details.paddleHours ?? sortedSlots.length;
      lines.push({
        label: `Paddle rental (${details.paddleQty} × ${ph}h @ ${peso(rates.paddle)}/hr)`,
        amount: details.paddleQty * ph * rates.paddle,
      });
    }
    if (details.ball)
      lines.push({ label: "Ball set (flat fee)", amount: rates.ball });
    return lines;
  })();

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
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
          <span className="size-2 rounded-full bg-amber-500 animate-pulse" aria-hidden />
          <span>Status: Pending Verification</span>
        </div>
      </div>

      {/* ── Full Booking Invoice ── */}
      <div className="rounded-3xl border border-line-warm/70 bg-white shadow-sm overflow-hidden">

        {/* Invoice header */}
        <div className="flex items-center justify-between border-b border-line-warm/40 px-6 py-4 sm:px-7">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-flame-light text-flame">
              <Receipt className="size-4.5" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-ink">Booking Invoice</h2>
              <p className="text-[11px] font-mono text-warm-muted">#{trackingToken.slice(0, 8).toUpperCase()}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="block text-xs font-semibold text-warm-muted">Total Paid</span>
            <span className="text-2xl font-black text-flame">{peso(Number(total))}</span>
          </div>
        </div>

        <div className="grid gap-0 sm:grid-cols-2">

          {/* Left column: booking details */}
          <div className="space-y-0 border-b border-line-warm/40 p-6 sm:border-b-0 sm:border-r sm:p-7">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-warm-muted">
              Booking Details
            </h3>

            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-flame" aria-hidden />
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-warm-muted">Court</span>
                  <span className="font-bold text-ink">{courtNames.join(", ")}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 size-4 shrink-0 text-flame" aria-hidden />
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-warm-muted">Play Date</span>
                  <span className="font-bold text-ink">{formattedDate}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 size-4 shrink-0 text-flame" aria-hidden />
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-warm-muted">Time &amp; Duration</span>
                  <span className="font-bold text-ink">
                    {timeRangeLabel}
                  </span>
                  <span className="block text-xs text-warm-muted">
                    {sortedSlots.length} hour{sortedSlots.length === 1 ? "" : "s"} consecutive
                  </span>
                </div>
              </div>

              {(details.paddleQty > 0 || details.ball) && (
                <div className="flex items-start gap-3">
                  <Dumbbell className="mt-0.5 size-4 shrink-0 text-flame" aria-hidden />
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-warm-muted">Equipment</span>
                    {details.paddleQty > 0 && (
                      <span className="block font-bold text-ink">
                        {details.paddleQty} × Paddle ({details.paddleHours ?? sortedSlots.length}h)
                      </span>
                    )}
                    {details.ball && (
                      <span className="block font-bold text-ink">Ball set</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Customer details */}
            <div className="mt-6 border-t border-line-warm/40 pt-5">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-warm-muted">
                Player Info
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2.5 text-ink">
                  <User className="size-3.5 shrink-0 text-warm-muted" aria-hidden />
                  <span className="font-semibold">{details.fullName}</span>
                </div>
                <div className="flex items-center gap-2.5 text-ink">
                  <Mail className="size-3.5 shrink-0 text-warm-muted" aria-hidden />
                  <span className="text-xs font-semibold">{details.email}</span>
                </div>
                <div className="flex items-center gap-2.5 text-ink">
                  <Phone className="size-3.5 shrink-0 text-warm-muted" aria-hidden />
                  <span className="text-xs font-semibold">{details.phone}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right column: cost breakdown + QR */}
          <div className="p-6 sm:p-7">
            {/* Cost breakdown */}
            <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-warm-muted">
              Cost Breakdown
            </h3>
            <div className="space-y-2 text-sm">
              {invoiceLines.map((line) => (
                <div key={line.label} className="flex items-baseline justify-between gap-4">
                  <span className="text-xs text-ink/80">{line.label}</span>
                  <span className="shrink-0 font-semibold text-ink">{peso(line.amount)}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-4 border-t border-line-warm/60 pt-3">
                <span className="font-bold text-ink">Total</span>
                <span className="text-xl font-extrabold text-flame">{peso(Number(total))}</span>
              </div>
            </div>

            {/* QR Pass */}
            <div className="mt-6 border-t border-line-warm/40 pt-5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-pine uppercase tracking-wider mb-3">
                <QrCode className="size-4 text-flame" aria-hidden />
                <span>Your Check-in QR Pass</span>
              </div>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <div className="shrink-0 rounded-2xl border-2 border-line-warm/80 bg-white p-3 shadow-xs">
                  <QRCodeSVG ref={qrRef} value={bookingUrl} size={140} level="M" />
                </div>
                <div className="flex flex-1 flex-col gap-2 text-center sm:text-left">
                  <p className="text-xs leading-relaxed text-warm-muted">
                    Show this at the front desk on your game day for instant check-in.
                  </p>
                  <button
                    type="button"
                    onClick={downloadQr}
                    className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-flame px-3 text-xs font-bold text-white shadow-sm transition-all hover:bg-flame-hover active:scale-[0.98]"
                  >
                    <Download className="size-3.5" aria-hidden />
                    <span>Download QR</span>
                  </button>
                  <div className="flex gap-2">
                    <Link
                      href={`/track/${trackingToken}`}
                      className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1 rounded-xl border border-line-warm/70 bg-white px-2 text-xs font-bold text-ink transition-colors hover:bg-cream"
                    >
                      <span>View Status</span>
                      <ExternalLink className="size-3 text-warm-muted" aria-hidden />
                    </Link>
                    <button
                      type="button"
                      onClick={copyLink}
                      className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1 rounded-xl border border-line-warm/70 bg-white px-2 text-xs font-bold text-pine transition-colors hover:bg-cream"
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
            </div>
          </div>
        </div>
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
            <span><strong>Approval Email:</strong> You&apos;ll receive an official confirmation to <strong className="text-ink">{details.email}</strong>.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-pine text-[11px] font-bold text-white">3</span>
            <span><strong>Show Up &amp; Play:</strong> Present your QR pass at the CK Grounds front desk on game day!</span>
          </li>
        </ol>
      </div>

      {/* ── Action buttons ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4">
        <button
          type="button"
          onClick={downloadQr}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-flame px-6 text-sm font-bold text-white shadow-md transition-all hover:bg-flame-hover active:scale-[0.99]"
        >
          <Download className="size-4" aria-hidden />
          <span>Download QR Pass</span>
        </button>

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
