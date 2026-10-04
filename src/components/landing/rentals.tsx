import { FALLBACK_RATES, peso, type DisplayRates } from "@/lib/pricing-display";
import LandingImage from "./landing-image";

export default function Rentals({ rates = FALLBACK_RATES }: { rates?: DisplayRates }) {
  const RENTALS = [
    {
      name: "Paddle Rental",
      src: "/images/paddle.jpg",
      alt: "Pickleball paddles and match balls ready on court",
      price: peso(rates.paddle),
      per: "per paddle",
      label: "Paddle photo — drop /images/paddle.jpg here",
      blurb: "Sanitized composite paddles with cushioned grips.",
      metaLeft: "Available at checkout",
      metaRight: `${peso(rates.paddle)} × Hours × Paddles`,
    },
    {
      name: "Ball Rental",
      src: "/images/Pickleball.jpg",
      alt: "Match pickleball on the CK Grounds court",
      price: peso(rates.ball),
      per: "booking (flat fee)",
      label: "Ball photo — drop /images/Pickleball.jpg here",
      blurb: "Official match balls, ready on court.",
      metaLeft: "Unlimited match hours",
      metaRight: `Fixed ${peso(rates.ball)} / session`,
    },
  ];
  return (
    <section id="rentals" className="scroll-mt-20" aria-labelledby="rentals-heading">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="mx-auto max-w-2xl space-y-2 text-center">
          <h2
            id="rentals-heading"
            className="text-3xl font-black tracking-tight text-ink sm:text-4xl"
          >
            Equipment Rentals
          </h2>
          <p className="text-sm leading-6 text-ink/70 sm:text-base">
            Optional match gear ready on court for your session.
          </p>
        </div>

        <div className="mx-auto mt-8 grid max-w-3xl gap-5 sm:grid-cols-2">
          {RENTALS.map((r) => (
            <article
              key={r.name}
              className="rounded-2xl border border-line bg-oat/70 p-5 shadow-[0_8px_24px_rgba(66,48,45,0.06)]"
            >
              <div className="mb-5 overflow-hidden rounded-xl border border-line-warm">
                <LandingImage
                  src={r.src}
                  alt={r.alt}
                  label={r.label}
                  className="aspect-[16/9]"
                />
              </div>
              <h3 className="text-base font-extrabold text-ink">{r.name}</h3>
              <p className="mt-1 text-lg font-black text-flame">
                {r.price}{" "}
                <span className="text-xs font-bold text-ink/60">/ {r.per}</span>
              </p>
              <p className="mt-1 text-[13px] leading-5 text-ink/70">{r.blurb}</p>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line/70 pt-3 text-[11px] font-semibold">
                <span className="text-ink/60">{r.metaLeft}</span>
                <span className="whitespace-nowrap text-flame">{r.metaRight}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
