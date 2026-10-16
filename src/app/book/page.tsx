import { Suspense } from "react";
import { getDb } from "@/db/client";
import { FALLBACK_COURTS, type CourtOption } from "@/lib/courts";
import { FALLBACK_RATES, getDisplayRates, type DisplayRates } from "@/lib/pricing-display";
import { Skeleton } from "@/components/ui/skeleton";
import Header from "@/components/landing/header";
import Footer from "@/components/landing/footer";
import BookingFlow from "@/components/booking/booking-flow";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Book a Court — CK Grounds",
  description:
    "Pick a date and any hours, hold your slots, and submit with payment proof. Day ₱150/hr · Night ₱200/hr. No account needed.",
};

// Same fail-soft SSR pattern as the landing page: courts → FALLBACK_COURTS,
// rates → FALLBACK_RATES. force-dynamic keeps pricing edits fresh without a
// redeploy.
async function loadCourts(): Promise<CourtOption[]> {
  try {
    const db = getDb();
    const { data, error } = await db
      .from("courts")
      .select("id,name")
      .eq("status", "active")
      .order("name", { ascending: true });
    if (error || !data) return FALLBACK_COURTS;
    return data as CourtOption[];
  } catch {
    return FALLBACK_COURTS;
  }
}

async function loadRates(): Promise<DisplayRates> {
  try {
    return await getDisplayRates(getDb());
  } catch {
    return FALLBACK_RATES;
  }
}

export default function BookPage() {
  // Both reads start here without being awaited, so the header + copy shell
  // streams first and the booking UI follows once courts/rates land.
  const courtsPromise = loadCourts();
  const ratesPromise = loadRates();

  return (
    <>
      <Header />
      <main id="main" className="bg-cream pt-16 min-h-screen">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="mb-6 space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-pine sm:text-3xl">
              Book a Court
            </h1>
            <p className="text-sm leading-6 text-ink sm:text-base sm:leading-[26px]">
              Reserve your court online with instant 10-minute hold protection. Day ₱150/hr · Night ₱200/hr. No account needed.
            </p>
          </div>
          <Suspense fallback={<Skeleton className="h-[520px] rounded-xl bg-oat/60" />}>
            <BookingArea courts={courtsPromise} rates={ratesPromise} />
          </Suspense>
        </div>
      </main>
      <Suspense
        fallback={<div className="h-64 border-t border-line bg-oat/60" aria-hidden />}
      >
        <SiteFooter rates={ratesPromise} />
      </Suspense>
    </>
  );
}

async function BookingArea({
  courts,
  rates,
}: {
  courts: Promise<CourtOption[]>;
  rates: Promise<DisplayRates>;
}) {
  const [initialCourts, initialRates] = await Promise.all([courts, rates]);
  return <BookingFlow initialCourts={initialCourts} initialRates={initialRates} />;
}

async function SiteFooter({ rates }: { rates: Promise<DisplayRates> }) {
  return <Footer rates={await rates} />;
}
