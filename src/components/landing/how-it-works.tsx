import {
  CalendarCheck,
  ClipboardCheck,
  Package,
  ReceiptText,
  QrCode,
  UserRound,
} from "lucide-react";
import { FALLBACK_RATES, peso, type DisplayRates } from "@/lib/pricing-display";

export default function HowItWorks({ rates = FALLBACK_RATES }: { rates?: DisplayRates }) {
  const STEPS = [
    {
      n: "01",
      icon: CalendarCheck,
      title: "Select Court & Time",
      blurb: "Pick 1 or both courts from today onwards — same day is fine. 10-min hold starts instantly.",
    },
    {
      n: "02",
      icon: Package,
      title: "Add Match Gear",
      blurb: `Optional paddles (${peso(rates.paddle)}/hr) and official balls (${peso(rates.ball)} flat) ready on court.`,
    },
    {
      n: "03",
      icon: UserRound,
      title: "Add Your Details",
      blurb: "Enter your name, email, and phone so we can send your booking confirmation and QR pass.",
    },
    {
      n: "04",
      icon: ClipboardCheck,
      title: "Review Your Booking",
      blurb: "Check your courts, schedule, gear, contact details, and full total before payment.",
    },
    {
      n: "05",
      icon: ReceiptText,
      title: "Pay & Upload Proof",
      blurb: "Pay via GCash, BDO, or BPI and upload your receipt before the 10-minute hold ends.",
    },
    {
      n: "06",
      icon: QrCode,
      title: "Get Your QR Pass & Play",
      blurb: "Your pass arrives on screen and by email after submission. Once payment is approved, show it at check-in.",
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
            Seamless court reservation in 6 straightforward steps. Review everything before you pay.
          </p>
        </div>

        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
