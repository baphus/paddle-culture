import { FALLBACK_RATES, peso, type DisplayRates } from "@/lib/pricing-display";

export default function Faq({ rates = FALLBACK_RATES }: { rates?: DisplayRates }) {
  const FAQS = [
    {
      q: "How do I book a court?",
      a: `Pick your date, select 1 or 2 courts, and choose consecutive 1-hour slots. Tap "Hold these slots" to lock them for 10 minutes, fill in your contact details, pay via GCash, BDO, or BPI, then upload your payment screenshot. Once submitted, you'll get a tracking QR code by email while staff verifies your payment.`,
    },
    {
      q: "What are the court rates?",
      a: `Courts are ${peso(rates.morning)}/hr from 6:00 AM to 6:00 PM and ${peso(rates.evening)}/hr from 6:00 PM to 3:00 AM — same rate every day of the week. Optional paddle rental is ${peso(rates.paddle)}/paddle/hr and a ball set is a flat ${peso(rates.ball)} per booking.`,
    },
    {
      q: "What is the 10-minute hold?",
      a: `Tapping "Hold these slots" reserves your chosen hours for 10 minutes while you complete your details and upload payment proof. If the timer runs out before you submit, the hold expires and the slots reopen.`,
    },
    {
      q: "When will my booking be approved?",
      a: "Your booking stays Pending until staff reviews your payment screenshot. You'll get an approval email once it's confirmed — or a rejection notice with the reason if there's an issue. Track your booking status anytime using the QR code or link from your confirmation email.",
    },
    {
      q: "Can I book a court for today?",
      a: "Yes — same-day booking is available for any slot that hasn't started yet. You can also book up to 12 months ahead. Courts are open daily from 6:00 AM to 3:00 AM.",
    },
    {
      q: "Can I cancel or get a refund?",
      a: "No. All bookings are final — no cancellations, rescheduling, or refunds. Review your date, time, and court selection carefully before uploading payment.",
    },
  ];
  return (
    <section id="faq" className="scroll-mt-20" aria-labelledby="faq-heading">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="space-y-2 text-center">
          <h2
            id="faq-heading"
            className="text-3xl font-black tracking-tight text-ink sm:text-4xl"
          >
            Frequently Asked Questions
          </h2>
        </div>
        <div className="mt-8 space-y-3">
          {FAQS.map((f, i) => (
            <details
              key={f.q}
              open={i === 0}
              className="group rounded-2xl border border-line bg-oat/60 px-5 py-4 shadow-[0_8px_24px_rgba(66,48,45,0.05)] open:bg-cream"
            >
              <summary className="cursor-pointer list-none text-[15px] font-bold text-ink [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <span
                    className="grid size-6 shrink-0 place-items-center text-base leading-none font-black text-flame transition-transform group-open:rotate-180"
                    aria-hidden
                  >
                    ▾
                  </span>
                </span>
              </summary>
              <p className="pt-2 text-sm leading-6 text-ink/75">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
