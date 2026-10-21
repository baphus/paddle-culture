import { CalendarPlus } from "lucide-react";
import { formatManilaLong, formatSlotRangesWithDates, type CourtSlotGroup } from "@/lib/courts";
import { slotSelectionDateStr } from "@/lib/booking/slots";
import { googleCalendarUrl } from "@/lib/booking/calendar";
import {
  calculatePaddleRentalTotal,
  courtRateForSlot,
  FALLBACK_RATES,
  peso,
  type DisplayRates,
} from "@/lib/pricing-display";
import { VENUE_ADDRESS } from "@/lib/venue";
import type { DetailsValues } from "./details-form";

type Player = Pick<DetailsValues, "fullName" | "email" | "phone">;
type Equipment = Pick<DetailsValues, "paddleQty" | "paddleHours" | "ball">;

export interface BookingInvoiceProps {
  token: string;
  total: string;
  courtNames: string[];
  slotStarts: string[];
  slotGroups?: CourtSlotGroup[];
  dateStr?: string | null;
  player: Player;
  equipment: Equipment;
  bookingUrl?: string;
  rates?: DisplayRates;
}

interface InvoiceLine {
  label: string;
  detail?: string;
  amount: number;
}

export default function BookingInvoice({
  token,
  total,
  courtNames,
  slotStarts,
  slotGroups,
  dateStr,
  player,
  equipment,
  bookingUrl,
  rates = FALLBACK_RATES,
}: BookingInvoiceProps) {
  const sortedSlots = [...slotStarts].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );
  const bookingDate = dateStr || slotSelectionDateStr(sortedSlots);
  const formattedDate = bookingDate ? formatManilaLong(bookingDate) : "Upcoming";
  const groups = (slotGroups ?? []).filter((group) => group.slotStarts.length > 0);
  // Rentals bill per booked court-hour — every court's hours count, not just
  // the distinct hours on the grid. Matches the server's per-pair pricing.
  const bookedHours = groups.length > 0
    ? groups.reduce((sum, group) => sum + group.slotStarts.length, 0)
    : sortedSlots.length * Math.max(courtNames.length, 1);
  const paddleHours = equipment.paddleHours ?? bookedHours;
  const invoiceLines: InvoiceLine[] = [];

  if (groups.length > 0) {
    for (const group of groups) {
      const slots = [...group.slotStarts].sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime(),
      );
      const rateRuns: { amount: number; slots: string[] }[] = [];
      for (const slot of slots) {
        const amount = courtRateForSlot(rates, group.courtId, new Date(slot))?.amount ?? rates.morning;
        const previousRun = rateRuns[rateRuns.length - 1];
        const previousSlot = previousRun?.slots[previousRun.slots.length - 1];
        if (
          previousRun?.amount === amount &&
          previousSlot &&
          new Date(slot).getTime() - new Date(previousSlot).getTime() === 3_600_000
        ) {
          previousRun.slots.push(slot);
        } else {
          rateRuns.push({ amount, slots: [slot] });
        }
      }
      const amount = rateRuns.reduce((sum, run) => sum + run.amount * run.slots.length, 0);
      invoiceLines.push({
        label: `${group.courtName} · ${slots.length} hour${slots.length === 1 ? "" : "s"}`,
        detail: rateRuns.map((run) => `${formatSlotRangesWithDates(run.slots)} · ${peso(run.amount)}/hour`).join("; "),
        amount,
      });
    }
  } else if (sortedSlots.length > 0) {
    const count = Math.max(courtNames.length, 1);
    invoiceLines.push({
      label: `${courtNames.join(", ") || "Court booking"} · ${sortedSlots.length * count} court-hours`,
      detail: `${formatSlotRangesWithDates(sortedSlots)} · ${peso(rates.morning)}/hour${count > 1 ? " per court" : ""}`,
      amount: sortedSlots.length * count * rates.morning,
    });
  }

  if (equipment.paddleQty > 0) {
    invoiceLines.push({
      label: `Paddle rental · ${equipment.paddleQty} × ${paddleHours} hour${paddleHours === 1 ? "" : "s"}`,
      detail: `${peso(rates.paddle)} per paddle per hour`,
      amount: calculatePaddleRentalTotal(rates.paddle, equipment.paddleQty, paddleHours),
    });
  }
  if (equipment.ball) invoiceLines.push({ label: "Ball set · one booking", amount: rates.ball });

  const courtTimeNotes = groups.map((group) =>
    `${group.courtName}: ${formatSlotRangesWithDates(group.slotStarts)}`,
  );
  const calendarHref = googleCalendarUrl({
    title: `CK Grounds — ${courtNames.join(", ") || "Court booking"}`,
    slotStarts: sortedSlots,
    location: VENUE_ADDRESS,
    details: [
      `Booking ref: #${token.slice(0, 8).toUpperCase()}`,
      ...(courtTimeNotes.length > 0 ? courtTimeNotes : [formatSlotRangesWithDates(sortedSlots)]),
      bookingUrl ? `Track your booking: ${bookingUrl}` : "",
    ].filter(Boolean).join("\n"),
  });

  return (
    <section aria-labelledby="booking-invoice-title" className="overflow-hidden rounded-2xl border border-line-warm/70 bg-white">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line-warm/70 px-5 py-4 sm:px-6">
        <div>
          <h2 id="booking-invoice-title" className="text-base font-bold text-ink">Booking invoice</h2>
          <p className="mt-0.5 font-mono text-xs text-warm-muted">Ref #{token.slice(0, 8).toUpperCase()}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-warm-muted">Total paid</p>
          <p className="text-lg font-bold tabular-nums text-ink">{peso(Number(total))}</p>
        </div>
      </header>

      <div className="space-y-5 px-5 py-4 sm:px-6">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-warm-muted">Booking</h3>
          <dl className="mt-2 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-warm-muted">Date</dt><dd className="font-medium text-ink">{formattedDate}</dd></div>
            <div><dt className="text-xs text-warm-muted">Courts</dt><dd className="font-medium text-ink">{courtNames.join(", ") || "—"}</dd></div>
          </dl>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-warm-muted">Items</h3>
          <div className="mt-2 divide-y divide-line-warm/70 border-y border-line-warm/70 text-sm">
            {invoiceLines.map((line, index) => (
              <div key={`${line.label}-${index}`} className="flex items-start justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{line.label}</p>
                  {line.detail && <p className="mt-0.5 text-xs leading-4 text-warm-muted">{line.detail}</p>}
                </div>
                <span className="shrink-0 font-medium tabular-nums text-ink">{peso(line.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between gap-4 py-2.5 font-bold text-ink">
              <span>Total paid</span>
              <span className="shrink-0 tabular-nums">{peso(Number(total))}</span>
            </div>
          </div>
        </section>

        <section className="border-t border-line-warm/70 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-warm-muted">Customer</h3>
          <dl className="mt-2 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-warm-muted">Name</dt><dd className="font-medium text-ink">{player.fullName}</dd></div>
            <div><dt className="text-xs text-warm-muted">Phone</dt><dd className="font-medium text-ink">{player.phone}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-warm-muted">Email</dt><dd className="break-all font-medium text-ink">{player.email}</dd></div>
          </dl>
        </section>
      </div>

      {calendarHref && (
        <div className="border-t border-line-warm/70 px-5 py-3 sm:px-6">
          <a href={calendarHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-warm/70 px-3 text-xs font-semibold text-ink hover:bg-cream">
            <CalendarPlus className="size-4" aria-hidden /> Add to Google Calendar
          </a>
        </div>
      )}
    </section>
  );
}
