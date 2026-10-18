import {
  Calendar,
  CalendarPlus,
  Clock,
  Dumbbell,
  Mail,
  MapPin,
  Phone,
  Receipt,
  User,
} from "lucide-react";
import { formatManilaLong, formatSlotRanges, formatCourtSlotGroups, type CourtSlotGroup } from "@/lib/courts";
import { slotSelectionDateStr, timeBandFor } from "@/lib/booking/slots";
import { googleCalendarUrl } from "@/lib/booking/calendar";
import { FALLBACK_RATES, peso, type DisplayRates } from "@/lib/pricing-display";
import { VENUE_ADDRESS } from "@/lib/venue";
import type { DetailsValues } from "./details-form";

type Player = Pick<DetailsValues, "fullName" | "email" | "phone">;
type Equipment = Pick<DetailsValues, "paddleQty" | "paddleHours" | "ball">;

export interface BookingInvoiceProps {
  /** Tracking token — shown (truncated) as the invoice ref and used for the calendar notes. */
  token: string;
  total: string;
  courtNames: string[];
  slotStarts: string[];
  /** Per-court slot attribution — renders per-court time lines when the booking
   *  moves between courts. Absent/empty falls back to the collapsed range. */
  slotGroups?: CourtSlotGroup[];
  dateStr?: string | null;
  player: Player;
  equipment: Equipment;
  /** Absolute /track/<token> URL, added to the calendar event notes. */
  bookingUrl?: string;
  rates?: DisplayRates;
}

/** Line items + "Add to Google Calendar" — shared by the booking confirmation and the tracking page. */
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
  const sortedSlots = [...slotStarts].sort();
  const timeRangeLabel = formatSlotRanges(sortedSlots);
  // Non-empty only when the booking changes courts — otherwise `timeRangeLabel` is exact.
  const courtSlotLines = formatCourtSlotGroups(slotGroups ?? []);

  const formattedDate = (() => {
    // Always derive the day from the slots in Manila. `dateStr` is the picked
    // selection date and wins when present; the fallback must not slice the
    // UTC ISO string (`firstSlot.slice(0, 10)`), which lands on the previous
    // day for any start before 08:00Z — i.e. before 4:00 PM Manila. The
    // tracking page hit exactly that: booked Oct 19, shown Oct 18.
    const day = dateStr || slotSelectionDateStr(sortedSlots);
    return day ? formatManilaLong(day) : "Upcoming";
  })();

  // Built from the server total's composition (or a rate-based estimate): day vs evening hours.
  let dayCount = 0;
  let nightCount = 0;
  for (const iso of sortedSlots) {
    if (timeBandFor(new Date(iso)) === "evening") nightCount++;
    else dayCount++;
  }
  const n = courtNames.length || 1;
  const paddleHours = equipment.paddleHours ?? sortedSlots.length;
  const invoiceLines: { label: string; amount: number }[] = [];
  if (dayCount > 0)
    invoiceLines.push({
      label: `Morning court (${dayCount} hr${dayCount === 1 ? "" : "s"} × ${n > 1 ? `${n} courts` : "1 court"})`,
      amount: dayCount * rates.morning * n,
    });
  if (nightCount > 0)
    invoiceLines.push({
      label: `Evening court (${nightCount} hr${nightCount === 1 ? "" : "s"} × ${n > 1 ? `${n} courts` : "1 court"})`,
      amount: nightCount * rates.evening * n,
    });
  if (equipment.paddleQty > 0)
    invoiceLines.push({
      label: `Paddle rental (${equipment.paddleQty} × ${paddleHours}h @ ${peso(rates.paddle)}/hr)`,
      amount: equipment.paddleQty * paddleHours * rates.paddle,
    });
  if (equipment.ball) invoiceLines.push({ label: "Ball set (flat fee)", amount: rates.ball });

  const calendarHref = googleCalendarUrl({
    title: `CK Grounds — ${courtNames.join(", ") || "Court booking"}`,
    slotStarts: sortedSlots,
    location: VENUE_ADDRESS,
    details: [
      `Booking ref: #${token.slice(0, 8).toUpperCase()}`,
      courtSlotLines.join("; "),
      bookingUrl ? `Track your booking: ${bookingUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return (
    <div className="rounded-3xl border border-line-warm/70 bg-white shadow-sm overflow-hidden">

      {/* Invoice header */}
      <div className="flex items-center justify-between border-b border-line-warm/40 px-6 py-4 sm:px-7">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-flame-light text-flame">
            <Receipt className="size-4.5" aria-hidden />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-ink">Booking Invoice</h2>
            <p className="text-[11px] font-mono text-warm-muted">#{token.slice(0, 8).toUpperCase()}</p>
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
                {courtSlotLines.length > 0 ? (
                  courtSlotLines.map((line) => (
                    <span key={line} className="block font-bold text-ink">{line}</span>
                  ))
                ) : (
                  <span className="font-bold text-ink">
                    {timeRangeLabel}
                  </span>
                )}
                <span className="block text-xs text-warm-muted">
                  {sortedSlots.length} hour{sortedSlots.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {(equipment.paddleQty > 0 || equipment.ball) && (
              <div className="flex items-start gap-3">
                <Dumbbell className="mt-0.5 size-4 shrink-0 text-flame" aria-hidden />
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-warm-muted">Equipment</span>
                  {equipment.paddleQty > 0 && (
                    <span className="block font-bold text-ink">
                      {equipment.paddleQty} × Paddle ({paddleHours}h)
                    </span>
                  )}
                  {equipment.ball && (
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
                <span className="font-semibold">{player.fullName}</span>
              </div>
              <div className="flex items-center gap-2.5 text-ink">
                <Mail className="size-3.5 shrink-0 text-warm-muted" aria-hidden />
                <span className="text-xs font-semibold">{player.email}</span>
              </div>
              <div className="flex items-center gap-2.5 text-ink">
                <Phone className="size-3.5 shrink-0 text-warm-muted" aria-hidden />
                <span className="text-xs font-semibold">{player.phone}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: cost breakdown */}
        <div className="p-6 sm:p-7">
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
        </div>
      </div>

      {calendarHref && (
        <div className="border-t border-line-warm/40 p-4 sm:px-7">
          <a
            href={calendarHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-line-warm/70 bg-white px-4 text-sm font-bold text-ink transition-colors hover:bg-cream"
          >
            <CalendarPlus className="size-4 text-flame" aria-hidden />
            <span>Add to Google Calendar</span>
          </a>
        </div>
      )}
    </div>
  );
}
