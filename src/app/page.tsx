import { getDb } from "@/db/client";
import { FALLBACK_RATES, getDisplayRates, type DisplayRates } from "@/lib/pricing-display";
import Header from "@/components/landing/header";
import Hero from "@/components/landing/hero";
import Courts from "@/components/landing/courts";
import Rentals from "@/components/landing/rentals";
import HowItWorks from "@/components/landing/how-it-works";
import BookTrack from "@/components/landing/book-track";
import Location from "@/components/landing/location";
import Faq from "@/components/landing/faq";
import Footer from "@/components/landing/footer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CK Grounds — Book a Court in Tabuelan, Cebu",
  description:
    "Pick a date, court, and consecutive hours, hold your slots, and submit with payment proof. Day ₱150/hr · Night ₱200/hr. No account needed.",
};

// Public landing page (no auth). Booking lives on the dedicated /book route;
// this page keeps the marketing sections + tracking lookup only.
// Live display rates via the lazy getDb() pattern (fail-soft to FALLBACK_RATES).
async function loadRates(): Promise<DisplayRates> {
  try {
    return await getDisplayRates(getDb());
  } catch {
    return FALLBACK_RATES;
  }
}

export default async function Home() {
  // Fail-soft: rates → FALLBACK_RATES. force-dynamic keeps this fresh, so
  // admin pricing edits reflect on the next load without a redeploy.
  const initialRates = await loadRates();
  return (
    <>
      <Header />
      <main id="main" className="bg-cream">
        <Hero rates={initialRates} />
        <Courts rates={initialRates} />
        <Rentals rates={initialRates} />
        <HowItWorks rates={initialRates} />
        <BookTrack rates={initialRates} />

        <Location rates={initialRates} />
        <Faq rates={initialRates} />
      </main>
      <Footer rates={initialRates} />
    </>
  );
}
