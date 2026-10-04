import { FALLBACK_RATES, peso, type DisplayRates } from "@/lib/pricing-display";

export default function Faq({ rates = FALLBACK_RATES }: { rates?: DisplayRates }) {
  const FAQS = [
    {
      q: "Can I book a court for today?",
      a: "Yes — same-day booking is allowed for future slots only. Anything that already started can't be picked. You can also book up to 12 months ahead.",
    },
    {
      q: "How does payment work?",
      a: `Pay via GCash, BDO, or BPI, then upload your receipt (jpg/png/webp, max 5MB) before your 10-minute hold ends. Courts are ${peso(rates.morning)}/hr in the morning and ${peso(rates.evening)}/hr in the evening — the server recomputes your total at submit so what you see is what you pay.`,
    },
    {
      q: "What is the 10-minute hold?",
      a: "Tapping “Hold these slots” locks your hours for 10 minutes while you finish your details and payment proof. If the timer ends without a submission, the hold expires and the slots reopen — nobody can snipe them mid-checkout.",
    },
    {
      q: "Can I cancel or reschedule?",
      a: "Message us directly with your tracking code (it looks like PC-2026-XXXX) and our venue team will help. Approved bookings are verified by staff, so reach out as early as you can and we'll sort it out.",
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
                    {i === 0 ? "▾" : "▾"}
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
