import {
  CalendarCheck,
  Package,
  ReceiptText,
  QrCode,
  MapPinned,
} from "lucide-react";
import { FALLBACK_RATES, peso, type DisplayRates } from "@/lib/pricing-display";

export default function HowItWorks({ rates = FALLBACK_RATES }: { rates?: DisplayRates }) {
  const STEPS = [
    {
      n: "01",
      icon: CalendarCheck,
      title: "Select Court & Time",
      blurb: "Pick 1 or both courts for tomorrow onwards. 10-min hold starts instantly.",
    },
    {
      n: "02",
      icon: Package,
      title: "Add Match Gear",
      blurb: `Optional paddles (${peso(rates.paddle)}/hr) and official balls (${peso(rates.ball)} flat) ready on court.`,
    },
    {
      n: "03",
      icon: ReceiptText,
      title: "Pay & Upload Proof",
      blurb: "Pay via GCash, BDO, or BPI and upload proof of payment.",
    },
    {
      n: "04",
      icon: QrCode,
      title: "Payment Review & Tracking QR",
      blurb: "Receive your tracking QR code instantly by email while our team verifies payment.",
    },
    {
      n: "05",
      icon: MapPinned,
      title: "Check-in & Venue Arrival",
      blurb: "Once approved, present that same QR pass at the desk when you arrive at court.",
    },
  ];

  return (
    <section id="how-it-works" className="scroll-mt-20" aria-labelledby="how-heading">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="mx-auto max-w-2xl space-y-2 text-center">
          <h2
            id="how-heading"
            className="text-3xl font-black tracking-tight text-ink sm:text-4xl"
          >
            How It Works
          </h2>
          <p className="text-sm leading-6 text-ink/70 sm:text-base">
            Seamless court reservation in 5 straightforward steps.
          </p>
        </div>

        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="rounded-2xl border border-line bg-oat/60 p-5 shadow-[0_8px_24px_rgba(66,48,45,0.05)]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="grid size-10 place-items-center rounded-xl bg-flame-light text-flame">
                  <s.icon className="size-5" aria-hidden />
                </span>
                <span className="rounded-full border border-line bg-cream px-2.5 py-1 text-[11px] font-extrabold text-ink/60">
                  {s.n}
                </span>
              </div>
              <h3 className="mt-4 text-sm font-extrabold leading-5 text-ink">{s.title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-ink/70">{s.blurb}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
