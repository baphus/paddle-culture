import { ArrowRight, BadgeCheck, ChevronDown, Mail, MapPin, Search } from "lucide-react";
import { getDb } from "@/db/client";
import { FALLBACK_RATES, getDisplayRates, peso, type DisplayRates } from "@/lib/pricing-display";
import Header from "@/components/landing/header";
import Footer from "@/components/landing/footer";
import TrackInput from "@/components/landing/track-input";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "How It Works — CK Grounds",
  description:
    "Book a pickleball court in five steps: pick hours, add gear, hold your slots, pay with proof, then track and play. No account needed.",
};

// Same fail-soft pattern as src/app/page.tsx: live pricing via lazy getDb(),
// fallback to FALLBACK_RATES when unreachable (incl. build).
async function loadRates(): Promise<DisplayRates> {
  try {
    return await getDisplayRates(getDb());
  } catch {
    return FALLBACK_RATES;
  }
}

export default async function HowItWorksPage() {
  const rates = await loadRates();

  const faqs = [
    {
      q: "Do I need an account to book?",
      a: "No. Pick your hours, hold them for 10 minutes, add your name + contact, pay by QR and upload proof. Your QR pass arrives by email instantly.",
    },
    {
      q: "How do holds and payment work?",
      a: "Tapping “Hold these slots” locks your hours for 10 minutes. Upload a jpg/png/webp receipt (≤5MB) before the timer ends. No proof means no booking — the hold simply expires and the slots reopen.",
    },
    {
      q: "What are the rates, exactly?",
      a: `Courts are ${peso(rates.morning)}/hr from 6 AM–6 PM and ${peso(rates.evening)}/hr from 6 PM–3 AM. Paddle rental is ${peso(rates.paddle)} per paddle per hour, balls are ${peso(rates.ball)} flat per booking. The server recomputes your total at submit so what you see is what you pay.`,
    },
    {
      q: "Can I book for today?",
      a: "Yes — same-day booking is allowed for future slots only. Anything that already started is marked Past and can't be picked. You can also book up to 12 months ahead.",
    },
    {
      q: "Can I cancel or get a refund?",
      a: "No. Bookings are final: cancellations, rescheduling, and refunds are not allowed. Please review your date, time, and booking details carefully before submitting payment.",
    },
  ];

  return (
    <>
      <Header />
      <main id="main" className="bg-cream pt-16">
        {/* Hero — centered */}
        <section className="mx-auto w-full max-w-[1100px] px-4 pt-12 pb-8 text-center sm:px-6" aria-labelledby="hiw-heading">
          <p className="inline-block rounded-full bg-flame-light px-4 py-1.5 text-[11px] font-extrabold tracking-[0.14em] text-flame uppercase">
            Simple 5-step process
          </p>
          <h1
            id="hiw-heading"
            className="mx-auto mt-4 max-w-2xl text-[40px] leading-[46px] font-extrabold tracking-tight text-pine sm:text-5xl sm:leading-[56px]"
          >
            How Booking Works
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-warm-muted">
            No account, no downloads, no group-chat haggling.
            Five quick steps stand between you and first serve.
          </p>
        </section>

        {/* Cards — row1: 3 equal; row2: 04 (1/3) + 05 (2/3) */}
        <section className="mx-auto w-full max-w-[1100px] px-4 pb-4 sm:px-6" aria-label="Booking steps">
          <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {/* 01 */}
            <li className="flex flex-col rounded-2xl border border-line bg-white p-7 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-full bg-flame text-lg font-extrabold text-white" aria-hidden>
                  01
                </span>
                <span className="rounded-full bg-oat px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-warm-muted uppercase">
                  Step 1
                </span>
              </div>
              <h2 className="mt-5 text-xl font-bold text-pine">Select Court & Time</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-warm-muted">
                Pick a date, a court, and consecutive hours on the live grid. Same-day booking
                counts for any slot that hasn&apos;t started yet.
              </p>
              <p className="mt-5 flex items-center justify-between border-t border-line pt-4 text-[12px] font-bold text-flame">
                <span>{peso(rates.morning)}/hr · 6AM–6PM</span>
                <span>{peso(rates.evening)}/hr · 6PM–3AM</span>
              </p>
            </li>

            {/* 02 */}
            <li className="flex flex-col rounded-2xl border border-line bg-white p-7 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-full bg-flame text-lg font-extrabold text-white" aria-hidden>
                  02
                </span>
                <span className="rounded-full bg-oat px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-warm-muted uppercase">
                  Step 2
                </span>
              </div>
              <h2 className="mt-5 text-xl font-bold text-pine">Add Gear (Optional)</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-warm-muted">
                Travel light — add paddles and a ball right inside the wizard. No counter lines,
                no deposit drama.
              </p>
              <p className="mt-5 flex items-center justify-between border-t border-line pt-4 text-[12px] font-bold text-flame">
                <span>Paddles {peso(rates.paddle)}/hr</span>
                <span>Ball {peso(rates.ball)} flat</span>
              </p>
            </li>

            {/* 03 */}
            <li className="flex flex-col rounded-2xl border border-line bg-white p-7 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-full bg-flame text-lg font-extrabold text-white" aria-hidden>
                  03
                </span>
                <span className="rounded-full bg-oat px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-warm-muted uppercase">
                  Step 3
                </span>
              </div>
              <h2 className="mt-5 text-xl font-bold text-pine">Pay & Upload Proof</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-warm-muted">
                Pay by QR, then upload your receipt (JPG/PNG/WebP, ≤5MB) before your 10-minute
                hold ends. No proof, no booking — fair for everyone.
              </p>
              <p className="mt-5 flex items-center gap-1.5 border-t border-line pt-4 text-[13px] font-bold text-pine">
                <BadgeCheck className="size-4 shrink-0 text-flame" aria-hidden />
                GCash • BDO • BPI Accepted
              </p>
            </li>

            {/* 04 — 1/3 width */}
            <li className="flex flex-col rounded-2xl border border-line bg-white p-7 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-full bg-flame text-lg font-extrabold text-white" aria-hidden>
                  04
                </span>
                <span className="rounded-full bg-oat px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-warm-muted uppercase">
                  Step 4
                </span>
              </div>
              <h2 className="mt-5 text-xl font-bold text-pine">Receive Your QR Pass</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-warm-muted">
                Your QR pass lands instantly — on screen and by email. Scan it at the front desk
                for fast check-in on your game day.
              </p>
              <p className="mt-5 flex items-center gap-1.5 border-t border-line pt-4 text-[13px] font-bold text-pine">
                <Mail className="size-4 shrink-0 text-flame" aria-hidden />
                Instant on-screen + email pass
              </p>
            </li>

            {/* 05 — 2/3 width, dark-green number */}
            <li className="flex flex-col rounded-2xl border border-line bg-white p-7 shadow-sm md:col-span-2 lg:col-span-2">
              <div className="flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-full bg-pine text-lg font-extrabold text-white" aria-hidden>
                  05
                </span>
                <span className="rounded-full bg-oat px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-warm-muted uppercase">
                  Step 5
                </span>
              </div>
              <h2 className="mt-5 text-xl font-bold text-pine">Arrive, Scan & Play</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-warm-muted">
                Flash your QR at the gate and walk straight onto the court. CK Grounds,
                Tabuelan, Cebu — open daily 6 AM–3 AM with free on-site parking.
              </p>
              <p className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4 text-[13px] font-bold">
                <span className="flex items-center gap-1.5 text-pine">
                  <MapPin className="size-4 shrink-0 text-flame" aria-hidden />
                  Tabuelan, Cebu · Free parking
                </span>
                <span className="shrink-0 text-flame">Zero waiting lines</span>
              </p>
            </li>
          </ol>
        </section>

        {/* CTA band */}
        <section className="mx-auto w-full max-w-[1100px] px-4 py-10 sm:px-6" aria-labelledby="hiw-cta-heading">
          <div className="flex flex-col gap-8 rounded-2xl bg-pine p-8 text-pine-ink shadow-[0_24px_60px_rgba(29,52,33,0.35)] sm:p-10 lg:flex-row lg:items-center">
            <div className="flex-1 space-y-4">
              <p className="inline-block rounded-full bg-white/10 px-3 py-1 text-[11px] font-extrabold tracking-[0.14em] uppercase">
                Instant reservation
              </p>
              <h2 id="hiw-cta-heading" className="text-[28px] leading-9 font-extrabold tracking-tight text-white sm:text-[32px] sm:leading-10">
                Ready to hit the court?
              </h2>
              <p className="max-w-md text-sm leading-6 text-white/80">
                Live availability, honest hourly rates, and a QR that walks you straight in. Day{" "}
                {peso(rates.morning)}/hr · Night {peso(rates.evening)}/hr.
              </p>
              <a
                href="/book"
                className="inline-flex items-center gap-2 rounded-full bg-flame px-6 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-flame-hover"
              >
                Book Court Now <ArrowRight className="size-4" aria-hidden />
              </a>
            </div>
            <div className="w-full rounded-xl border border-white/15 bg-white/10 p-5 lg:max-w-sm" aria-label="Track an existing booking">
              <p className="flex items-center gap-2 text-sm font-bold text-white">
                <Search className="size-4" aria-hidden /> Track Your Booking
              </p>
              <p className="mt-1 text-xs leading-5 text-white/70">
                Already booked? Enter your code to check your status instantly.
              </p>
              <div className="mt-3">
                <TrackInput />
              </div>
            </div>
          </div>
        </section>

        {/* FAQ — white pill accordions */}
        <section className="mx-auto w-full max-w-[1100px] px-4 pt-2 pb-16 sm:px-6" aria-labelledby="hiw-faq-heading">
          <div className="mx-auto max-w-2xl space-y-2 text-center">
            <h2 id="hiw-faq-heading" className="text-3xl font-extrabold tracking-tight text-pine">
              Questions, answered
            </h2>
            <p className="text-sm leading-6 text-warm-muted">
              Everything about holds, payments, rates, and same-day booking.
            </p>
          </div>
          <div className="mx-auto mt-8 max-w-3xl space-y-3">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-[20px] border border-line bg-white p-5 shadow-sm open:shadow-md"
              >
                <summary className="cursor-pointer list-none text-[15px] font-bold text-pine [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <ChevronDown
                      className="size-5 shrink-0 text-flame transition-transform group-open:rotate-180"
                      aria-hidden
                    />
                  </span>
                </summary>
                <p className="pt-2 text-sm leading-relaxed text-warm-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <Footer rates={rates} />
    </>
  );
}
