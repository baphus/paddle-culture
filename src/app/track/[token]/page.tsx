import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import {
  bookingRentals,
  bookingSlots,
  bookings,
  courts,
} from "@/db/schema";
import { FALLBACK_RATES, getDisplayRates, type DisplayRates } from "@/lib/pricing-display";
import Header from "@/components/landing/header";
import Footer from "@/components/landing/footer";
import TrackView from "@/components/tracking/track-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Track Booking — CK Grounds",
  description: "Check your court reservation status, details, and access digital check-in pass.",
};

async function absoluteBookingUrl(token: string): Promise<string> {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  if (base) return `${base}/track/${token}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}/track/${token}` : `/track/${token}`;
}

async function loadRates(): Promise<DisplayRates> {
  try {
    return await getDisplayRates(getDb());
  } catch {
    return FALLBACK_RATES;
  }
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

  const [url, rates] = await Promise.all([
    absoluteBookingUrl(token),
    loadRates(),
  ]);

  const serializedSlots = slotRows.map((s) => ({
    courtName: s.courtName,
    slotStart: s.slotStart.toISOString(),
  }));

  const serializedRental = rental
    ? {
        paddleQty: rental.paddleQty,
        paddleHours: rental.paddleHours,
        ballFee: rental.ballFee,
      }
    : null;

  return (
    <>
      <Header />
      <main id="main" className="min-h-screen bg-cream pt-20 pb-16">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <TrackView
            token={token}
            url={url}
            status={booking.status}
            fullName={booking.fullName}
            total={booking.total}
            rejectReason={booking.rejectReason}
            slots={serializedSlots}
            rental={serializedRental}
          />
        </div>
      </main>
      <Footer rates={rates} />
    </>
  );
}
