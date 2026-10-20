import { ArrowRight } from "lucide-react";
import {
  FALLBACK_RATES,
  lowestCourtRate,
  peso,
  type DisplayRates,
} from "@/lib/pricing-display";
import TrackInput from "./track-input";

export default function BookTrack({ rates = FALLBACK_RATES }: { rates?: DisplayRates }) {
  return (
    <section id="track" className="scroll-mt-20" aria-labelledby="booktrack-heading">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <div
          id="booktrack-heading"
          className="grid gap-6 rounded-3xl bg-pine p-6 text-pine-ink shadow-[0_24px_60px_rgba(29,52,33,0.35)] sm:p-8 lg:grid-cols-2 lg:gap-8"
        >
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                Book Your Court
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-pine-ink/75">
                10-minute hold while verifying payment. No sign-up required.
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
              <p className="text-xl font-black text-white">
                From {peso(lowestCourtRate(rates))}
                <span className="text-sm font-bold text-white/70">/hr</span>
              </p>
              <p className="mt-1 text-[11px] leading-4 font-semibold text-white/70">
                Court rates follow the hours configured by the venue.
              </p>
            </div>
            <a
              href="/book"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-flame px-6 py-3.5 text-base font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-flame-hover"
            >
              Reserve a Court <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>

          <div className="rounded-2xl bg-white p-6 text-ink sm:p-7" aria-label="View an existing booking">
            <h3 className="text-xl font-black tracking-tight text-ink">Track an Existing Booking</h3>
            <p className="mt-1 mb-4 text-sm leading-6 text-ink/70">
              Check whether your payment is being verified or your reservation is confirmed. You’ll need your code and booking email.
            </p>
            <TrackInput />
          </div>
        </div>
      </div>
    </section>
  );
}
