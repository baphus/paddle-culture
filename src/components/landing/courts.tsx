import { ArrowRight, ArrowUpRight } from "lucide-react";
import { FALLBACK_RATES, peso, type DisplayRates } from "@/lib/pricing-display";
import LandingImage from "./landing-image";

const COURTS = [
  {
    src: "/images/court-1.jpg",
    alt: "Court 1 — daytime play at CK Grounds",
    name: "Court 1",
  },
  {
    src: "/images/court-2.jpg",
    alt: "Court 2 — evening session under the lights",
    name: "Court 2",
  },
];

export default function Courts({ rates = FALLBACK_RATES }: { rates?: DisplayRates }) {
  const from = `Starts from ${peso(rates.morning)}/hr`;
  return (
    <section id="courts" className="scroll-mt-20" aria-labelledby="courts-heading">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2
            id="courts-heading"
            className="text-3xl font-black tracking-tight text-ink sm:text-4xl"
          >
            Our Courts
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-pine px-4 py-2 text-xs font-bold whitespace-nowrap text-white">
            <span className="size-1.5 rounded-full bg-white/80" aria-hidden />
            {from}
          </span>
        </div>

        <div className="mt-6 rounded-3xl border border-line bg-oat p-4 sm:p-6">
          <div className="grid gap-5 md:grid-cols-2">
            {COURTS.map((c, i) => (
              <article
                key={c.name}
                className="overflow-hidden rounded-2xl border border-line bg-cream shadow-[0_8px_24px_rgba(66,48,45,0.08)]"
              >
                <div className="relative">
                  <LandingImage
                    src={c.src}
                    alt={c.alt}
                    label={`${c.name} — drop ${c.src} here`}
                    className="aspect-[16/10]"
                  />
                  <span className="absolute top-3 left-3 inline-flex items-center rounded-full bg-pine px-3 py-1 text-[11px] font-bold text-white shadow">
                    Covered
                  </span>
                  <span className="absolute right-3 bottom-3 inline-flex items-center rounded-full bg-flame px-3 py-1 text-[11px] font-bold whitespace-nowrap text-white shadow">
                    {from}
                  </span>
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-extrabold text-ink">{c.name}</h3>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <a
                      href="/book"
                      className="inline-flex items-center gap-1.5 rounded-full bg-flame px-5 py-2.5 text-sm font-bold whitespace-nowrap text-white transition-all hover:-translate-y-0.5 hover:bg-flame-hover"
                    >
                      Book Court {i + 1} <ArrowRight className="size-4" aria-hidden />
                    </a>
                    <a
                      href="/book"
                      className="inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap text-ink/70 hover:text-flame hover:underline"
                    >
                      Book Both Courts <ArrowUpRight className="size-3.5" aria-hidden />
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
