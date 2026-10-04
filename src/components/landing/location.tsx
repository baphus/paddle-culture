import { CarFront, Clock, ExternalLink, MapPin } from "lucide-react";
import { FALLBACK_RATES, type DisplayRates } from "@/lib/pricing-display";

const MAP_EMBED = "https://www.google.com/maps?q=Tabuelan,+Cebu,+Philippines&output=embed";
const MAP_LINK = "https://www.google.com/maps/search/?api=1&query=Tabuelan+Cebu+Philippines";

export default function Location({ rates = FALLBACK_RATES }: { rates?: DisplayRates }) {
  void rates;
  return (
    <section id="location" className="scroll-mt-20" aria-labelledby="location-heading">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="mx-auto max-w-2xl space-y-2 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-parchment px-3.5 py-1.5 text-[11px] font-bold text-ink">
            <MapPin className="size-3.5 text-flame" aria-hidden />
            Venue &amp; Directions
          </span>
          <h2
            id="location-heading"
            className="pt-1 text-3xl font-black tracking-tight text-ink sm:text-4xl"
          >
            Find Us in Tabuelan
          </h2>
          <p className="text-sm leading-6 text-ink/70 sm:text-base">
            Centrally located with convenient parking and premium facilities.
          </p>
        </div>

        <div className="mt-8 grid items-stretch gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-3xl border border-line bg-oat/60 p-6 sm:p-7">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.14em] text-flame uppercase">
              <MapPin className="size-3.5" aria-hidden /> Pickleball Complex
            </p>
            <h3 className="mt-1.5 text-xl font-black tracking-tight text-ink">
              Central Sports Complex, Tabuelan
            </h3>
            <p className="mt-1 text-[13px] leading-5 text-ink/70">
              RVF9+6XW, Poblacion, Tabuelan, Cebu, Philippines
            </p>

            <ul className="mt-5 space-y-3">
              <li className="flex items-start gap-3 rounded-2xl border border-line bg-cream p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-flame-light text-flame">
                  <Clock className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-extrabold text-ink">Operating Hours</span>
                  <span className="block text-[13px] text-ink/70">
                    Open Daily: 6:00 AM – 3:00 AM
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-3 rounded-2xl border border-line bg-cream p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-flame-light text-flame">
                  <CarFront className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-extrabold text-ink">
                    Parking &amp; Accessibility
                  </span>
                  <span className="block text-[13px] leading-5 text-ink/70">
                    Dedicated vehicle and motorcycle parking with 24/7 security.
                  </span>
                </span>
              </li>
            </ul>

            <a
              href={MAP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-flame px-5 py-3.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-flame-hover"
            >
              Open in Google Maps <ExternalLink className="size-4" aria-hidden />
            </a>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-line bg-[repeating-linear-gradient(-45deg,#e9e4d8_0_8px,#f4efe2_8px_16px)] shadow-[0_20px_50px_rgba(66,48,45,0.12)]">
            <iframe
              title="Map — CK Grounds, Tabuelan Cebu"
              src={MAP_EMBED}
              className="relative h-full min-h-[360px] w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </section>
  );
}
