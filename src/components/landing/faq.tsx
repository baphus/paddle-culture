import { FALLBACK_RATES, peso, type DisplayRates } from "@/lib/pricing-display";

function buildFaqs(rates: DisplayRates) {
  return [
    {
      q: "How do I book a court?",
      a: `Pick your date, select 1 or 2 courts, and choose any 1-hour slots. Tap "Hold these slots" to lock them for 10 minutes, fill in your contact details, pay via GCash, BDO, or BPI, then upload your payment screenshot. Once submitted, you'll get a tracking QR code by email while staff verifies your payment.`,
    },
    {
      q: "What are the court rates?",
      a: `Court rates follow the operating hours configured for each court. The booking grid shows the applicable hourly rate for every available slot. Optional paddle rental is ${peso(rates.paddle)}/paddle/hr and a ball set is a flat ${peso(rates.ball)} per booking.`,
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
      a: "Yes — you can book today if a slot is still coming up. Pick today in the calendar and take any hour that hasn't started yet. Booking is open from today up to 12 months ahead.",
    },
    {
      q: "Can I cancel or get a refund?",
      a: "No. All bookings are final — no cancellations, rescheduling, or refunds. Review your date, time, and court selection carefully before uploading payment.",
    },
  ];
}

export default function Faq({ rates = FALLBACK_RATES }: { rates?: DisplayRates }) {
  const FAQS = buildFaqs(rates);
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
