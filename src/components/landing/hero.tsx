import { ArrowRight, MapPin, Search } from "lucide-react";
import { FALLBACK_RATES, type DisplayRates } from "@/lib/pricing-display";
import LandingImage from "./landing-image";

export default function Hero({ rates = FALLBACK_RATES }: { rates?: DisplayRates }) {
  void rates;
  return (
    <section id="top" className="scroll-mt-20 pt-16" aria-labelledby="hero-heading">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-10 pb-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pt-14 lg:pb-16">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-parchment px-3 py-1.5 text-[11px] font-bold text-ink">
              <MapPin className="size-3.5 text-flame" aria-hidden />
              Poblacion, Tabuelan, Cebu
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-parchment px-3 py-1.5 text-[11px] font-bold text-ink">
              <MapPin className="size-3.5 text-flame" aria-hidden />
              Cebu, Philippines
            </span>
          </div>

          <h1
            id="hero-heading"
            className="text-[40px] leading-[44px] font-black tracking-[-0.02em] sm:text-[56px] sm:leading-[60px] sm:tracking-[-0.03em]"
          >
            <span className="block text-ink">Book a Court.</span>
            <span className="block text-flame">Play Immediately.</span>
          </h1>

          <p className="max-w-md text-base leading-[26px] text-ink/80 sm:text-lg sm:leading-7">
            Championship cushioned acrylic courts with instant 10-minute hold. No
            account needed.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="/book"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-flame px-7 py-3.5 text-base font-bold text-white shadow-[0_10px_24px_rgba(234,102,44,0.35)] transition-all hover:-translate-y-0.5 hover:bg-flame-hover"
            >
              Book Now <ArrowRight className="size-4" aria-hidden />
            </a>
            <a
              href="#track"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-oat px-7 py-3.5 text-base font-bold text-ink transition-all hover:-translate-y-0.5 hover:bg-parchment"
            >
              <Search className="size-4" aria-hidden /> Track Booking
            </a>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-line shadow-[0_20px_50px_rgba(66,48,45,0.18)]">
          <LandingImage
            src="/images/hero.jpg"
            alt="Evening game on a CK Grounds pickleball court"
            priority
            label="Hero — drop /images/hero.jpg here"
            className="aspect-[4/3] border-0"
            imgClassName="rounded-3xl"
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-6 pt-16 pb-5"
            aria-hidden
          >
            <p className="text-base font-extrabold text-white sm:text-lg">
              World-class cushioned acrylic courts
            </p>
            <p className="mt-0.5 text-xs font-semibold text-white/80 sm:text-sm">
              Open daily 6:00 AM – 3:00 AM
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
