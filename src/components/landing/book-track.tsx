import { ArrowRight, BadgeCheck } from "lucide-react";
import { FALLBACK_RATES, peso, type DisplayRates } from "@/lib/pricing-display";
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
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                <p className="text-xl font-black text-white">
                  {peso(rates.morning)}
                  <span className="text-sm font-bold text-white/70">/hr</span>
                </p>
                <p className="mt-1 text-[11px] leading-4 font-semibold text-white/70">
                  Morning (6 AM – 6 PM)
                </p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                <p className="text-xl font-black text-white">
                  {peso(rates.evening)}
                  <span className="text-sm font-bold text-white/70">/hr</span>
                </p>
                <p className="mt-1 text-[11px] leading-4 font-semibold text-white/70">
                  Evening (6 PM – 3 AM)
                </p>
              </div>
            </div>
            <a
              href="/book"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-flame px-6 py-3.5 text-base font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-flame-hover"
            >
              Reserve a Court <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>

          <div className="rounded-2xl bg-white p-6 text-ink sm:p-7" aria-label="Track an existing booking">
            <h3 className="text-xl font-black tracking-tight text-ink">Track Booking</h3>
            <p className="mt-1 mb-4 text-sm leading-6 text-ink/70">
              Enter your booking code to view status and court details.
            </p>
            <TrackInput />
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 text-pine">
                <BadgeCheck className="size-4 text-live-dot" aria-hidden />
                Verified by Venue Staff
              </span>
              <a href="#faq" className="text-flame hover:text-flame-hover hover:underline">
                Need Help?
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
