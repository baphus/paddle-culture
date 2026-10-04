import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { getDb } from "@/db/client";
import {
  bookingRentals,
  bookingSlots,
  bookings,
  courts,
} from "@/db/schema";

export const dynamic = "force-dynamic";

const manilaFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatRange(startIso: string): string {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + 3_600_000);
  return `${manilaFmt.format(start)} – ${manilaFmt.format(end)} (Manila)`;
}

async function absoluteTrackingUrl(token: string): Promise<string> {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  if (base) return `${base}/track/${token}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}/track/${token}` : `/track/${token}`;
}

// Public tracking page (no auth — the 256-bit token IS the capability).
// Shows only what the customer submitted plus decision state: status, name,
// slots/courts, rentals, total, QR. Never email/phone, never proof internals,
// never other bookings.
export default async function TrackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let db;
  try {
    db = getDb();
  } catch {
    notFound();
  }

  const bookingRows = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      fullName: bookings.fullName,
      total: bookings.total,
      rejectReason: bookings.rejectReason,
    })
    .from(bookings)
    .where(eq(bookings.trackingToken, token));
  const booking = bookingRows[0];
  if (!booking) notFound();

  const slotRows = await db
    .select({ courtName: courts.name, slotStart: bookingSlots.slotStart })
    .from(bookingSlots)
    .innerJoin(courts, eq(bookingSlots.courtId, courts.id))
    .where(eq(bookingSlots.bookingId, booking.id))
    .orderBy(bookingSlots.slotStart);
  const rentalRows = await db
    .select()
    .from(bookingRentals)
    .where(eq(bookingRentals.bookingId, booking.id));
  const rental = rentalRows[0] ?? null;

  const url = await absoluteTrackingUrl(token);

  return (
    <main>
      <h1>Booking {booking.status}</h1>
      <p>{booking.fullName}</p>
      <ul>
        {slotRows.map((s) => (
          <li key={`${s.courtName}-${s.slotStart.toISOString()}`}>
            {s.courtName} — {formatRange(s.slotStart.toISOString())}
          </li>
        ))}
      </ul>
      {rental && (rental.paddleQty > 0 || rental.ballFee != null) ? (
        <p>
          {rental.paddleQty > 0
            ? `${rental.paddleQty} paddle(s)${rental.paddleHours ? ` × ${rental.paddleHours}h` : ""}`
            : null}
          {rental.paddleQty > 0 && rental.ballFee != null ? " + " : null}
          {rental.ballFee != null ? "Ball" : null}
        </p>
      ) : null}
      <p>Total: ₱{booking.total}</p>
      {booking.status === "Rejected" && booking.rejectReason ? (
        <p>Reason: {booking.rejectReason}</p>
      ) : null}
      <QRCodeSVG value={url} size={200} />
      <p>{url}</p>
    </main>
  );
}
