import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
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
  const base = (process.env.APP_URL || "https://ckgrounds.vercel.app").replace(/\/$/, "");
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

export default async function TrackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = (() => {
    try {
      return getDb();
    } catch {
      notFound();
    }
  })();

  const trackColumns =
    "id,status,full_name,email,phone,total,reject_reason,tracking_code";
  async function readBooking(withPlayDate: boolean) {
    return db
      .from("bookings")
      .select(withPlayDate ? `${trackColumns},play_date` : trackColumns)
      .eq("tracking_token", token)
      .single();
  }
  type TrackRow = {
    id: string;
    status: string;
    full_name: string;
    email: string;
    phone: string;
    total: string;
    reject_reason: string | null;
    tracking_code: string;
    /** Manila selection date, written at creation by rpc_submit_booking. */
    play_date?: string | null;
  };
  type ReadResult = { data: TrackRow | null; error: { code?: string; message?: string } | null };
  let { data: bookingData, error: bookingError } = (await readBooking(true)) as ReadResult;
  // Database without `bookings.play_date` (migration not applied) — see
  // lib/admin/bookings.ts playDateOrNull. Retry without it so tracking keeps
  // working; TrackView derives the Play Date from the slots itself.
  if (
    bookingError &&
    (bookingError.code === "42703" ||
      (/play_date/i.test(bookingError.message ?? "") &&
        /does not exist/i.test(bookingError.message ?? "")))
  ) {
    ({ data: bookingData, error: bookingError } = (await readBooking(false)) as ReadResult);
  }

  if (bookingError || !bookingData) notFound();

  const booking = bookingData;

  const [{ data: slotData }, { data: rentalData }] = await Promise.all([
    db
      .from("booking_slots")
      .select("slot_start,courts(name)")
      .eq("booking_id", booking.id)
      .order("slot_start", { ascending: true }),
    db
      .from("booking_rentals")
      .select("paddle_qty,paddle_hours,ball_fee")
      .eq("booking_id", booking.id)
      .single(),
  ]);

  const [url, rates] = await Promise.all([
    absoluteBookingUrl(token),
    loadRates(),
  ]);

  type SlotRow = { slot_start: string; courts: unknown };
  function getCourtName(s: SlotRow): string {
    const c = s.courts;
    if (!c) return "";
    if (Array.isArray(c)) return (c[0] as { name?: string })?.name ?? "";
    return (c as { name?: string })?.name ?? "";
  }
  const serializedSlots = ((slotData ?? []) as SlotRow[]).map((s) => ({
    courtName: getCourtName(s),
    slotStart: s.slot_start,
  }));

  type RentalRow = { paddle_qty: number; paddle_hours: string | null; ball_fee: string | null };
  const rental = rentalData as RentalRow | null;
  const serializedRental = rental
    ? {
        paddleQty: rental.paddle_qty,
        paddleHours: rental.paddle_hours,
        ballFee: rental.ball_fee,
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
            fullName={booking.full_name}
            email={booking.email}
            phone={booking.phone}
            total={booking.total}
            rejectReason={booking.reject_reason}
            trackingCode={booking.tracking_code}
            slots={serializedSlots}
            playDate={booking.play_date ?? null}
            rental={serializedRental}
            rates={rates}
          />
        </div>
      </main>
      <Footer rates={rates} />
    </>
  );
}
