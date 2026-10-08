import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { courts } from "@/db/schema";
import { FALLBACK_COURTS, type CourtOption } from "@/lib/courts";
import { FALLBACK_RATES, getDisplayRates, type DisplayRates } from "@/lib/pricing-display";
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
    const rows = await db
      .select({ id: courts.id, name: courts.name })
      .from(courts)
      .where(eq(courts.status, "active"))
      .orderBy(asc(courts.name));
    return rows;
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

export default async function BookPage() {
  const [initialCourts, initialRates] = await Promise.all([loadCourts(), loadRates()]);
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
          <BookingFlow initialCourts={initialCourts} initialRates={initialRates} />
        </div>
      </main>
      <Footer rates={initialRates} />
    </>
  );
}
