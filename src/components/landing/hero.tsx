"use client";

import dynamic from "next/dynamic";
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  MapPin,
  Search,
  Zap,
} from "lucide-react";
import { FALLBACK_RATES, peso, type DisplayRates } from "@/lib/pricing-display";
import LandingImage from "./landing-image";

const Hero3D = dynamic(() => import("./hero-3d"), {
  ssr: false,
  loading: () => <div className="h-full w-full" aria-hidden />,
});

export default function Hero({
  rates = FALLBACK_RATES,
}: {
  rates?: DisplayRates;
}) {
  return (
    <section
      id="top"
      className="relative scroll-mt-20 overflow-x-clip pt-16"
      aria-labelledby="hero-heading"
    >
      {/* Full-bleed cover photo */}
      <LandingImage
        src="/images/hero.jpg"
        alt=""
        priority
        label="Hero — drop /images/hero.jpg here"
        className="absolute inset-0 h-full w-full border-0"
        imgClassName="rounded-none"
      />

      {/* Legibility gradient */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-pine-high/95 via-pine-high/80 to-pine-high/40 max-lg:bg-gradient-to-b max-lg:from-pine-high/95 max-lg:via-pine-high/75 max-lg:to-pine-high/45"
        aria-hidden
      />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-pine-high/80 to-transparent"
        aria-hidden
      />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-12 lg:pt-14 lg:pb-24">
        {/* ============================================================
            HERO COPY
            ============================================================ */}
        <div className="max-w-xl animate-rise motion-reduce:animate-none">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 py-1.5 pr-4 pl-1.5 text-xs font-bold text-white backdrop-blur">
            <span className="inline-flex items-center gap-1 rounded-full bg-pine px-2.5 py-1 text-[11px] text-pine-ink">
              <span
                className="size-1.5 animate-pulse rounded-full bg-live-dot"
                aria-hidden
              />
              Open today
            </span>

            <MapPin className="size-3.5 text-flame" aria-hidden />

            Tabuelan, Cebu · 6:00 AM – 3:00 AM
          </p>

          <h1
            id="hero-heading"
            className="mt-5 text-[44px] leading-[1.02] font-black tracking-[-0.03em] text-balance sm:text-[64px]"
          >
            <span className="block text-white">Book a court.</span>

            <span className="block text-flame italic">
              Play immediately.
            </span>
          </h1>

          <p className="mt-5 max-w-md text-base leading-7 text-pine-ink/85 sm:text-lg">
            Cushioned acrylic courts with a 10-minute instant hold. No account,
            no waiting — pick a time and show up ready.
          </p>

          <p className="mt-4 text-sm font-bold text-white">
            Day {peso(rates.morning)}/hr

            <span
              className="mx-2 font-normal text-white/40"
              aria-hidden
            >
              |
            </span>

            Night {peso(rates.evening)}/hr

            <span className="ml-2 font-semibold text-pine-ink/70">
              · Paddles &amp; balls for rent
            </span>
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="/book"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-flame px-8 py-4 text-base font-bold text-white shadow-[0_14px_30px_rgba(234,102,44,0.4)] transition-all hover:-translate-y-0.5 hover:bg-flame-hover active:translate-y-0"
            >
              Book Now
              <ArrowRight className="size-4" aria-hidden />
            </a>

            <a
              href="#track"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-8 py-4 text-base font-bold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20 active:translate-y-0"
            >
              <Search className="size-4" aria-hidden />
              Track Booking
            </a>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-semibold text-pine-ink/80">
            <li className="inline-flex items-center gap-1.5">
              <Zap className="size-4 text-flame" aria-hidden />
              10-min instant hold
            </li>

            <li className="inline-flex items-center gap-1.5">
              <BadgeCheck className="size-4 text-flame" aria-hidden />
              No account needed
            </li>

            <li className="inline-flex items-center gap-1.5">
              <Clock className="size-4 text-flame" aria-hidden />
              Open till 3 AM
            </li>
          </ul>
        </div>

        {/* ============================================================
            FLOATING 3D + COMIC BUBBLE
            ============================================================ */}
        <div className="relative animate-rise [animation-delay:120ms] motion-reduce:animate-none">
          {/* ==========================================================
              COMIC SPEECH BUBBLE
              Positioned BEHIND the 3D canvas
              ========================================================== */}
          <div
            className="pointer-events-none absolute right-4 top-4 z-0 rotate-[-4deg] sm:right-8 sm:top-8"
            aria-hidden="true"
          >
            <div className="relative">
              {/* Orange comic burst */}
              <div className="absolute -inset-2 -z-10 rotate-3 rounded-[35%] bg-flame/90" />

              {/* Main speech bubble */}
              <div className="relative rounded-[22px] border-[3px] border-[#12151d] bg-[#fff8e7] px-5 py-3 shadow-[5px_6px_0_#12151d]">
                {/* Comic kicker */}
                <span className="block text-center text-[10px] font-black uppercase tracking-[0.2em] text-flame sm:text-[11px]">
                  Ready?
                </span>

                {/* Main text */}
                <span className="block whitespace-nowrap text-xl leading-none font-black italic tracking-[-0.04em] text-[#12151d] sm:text-2xl">
                  Let&apos;s get dinking!
                </span>

                {/* Speech bubble tail */}
                <span
                  className="absolute -bottom-4 left-8 h-5 w-5 rotate-[-25deg] border-b-[3px] border-l-[3px] border-[#12151d] bg-[#fff8e7]"
                  aria-hidden="true"
                />
              </div>

              {/* Large comic sparkle */}
              <span className="absolute -right-4 -top-4 text-2xl font-black text-[#c6f24e] drop-shadow-[2px_2px_0_#12151d]">
                ✦
              </span>

              {/* Small comic sparkle */}
              <span className="absolute -bottom-5 -right-7 text-sm font-black text-white drop-shadow-[2px_2px_0_#12151d]">
                ✦
              </span>
            </div>
          </div>

          {/* ==========================================================
              3D CANVAS
              z-10 means paddle + ball render OVER the bubble
              ========================================================== */}
          <div className="relative z-10 h-72 w-full sm:h-96 lg:h-[520px]">
            <Hero3D />
          </div>
        </div>
      </div>
    </section>
  );
}