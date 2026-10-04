import Image from "next/image";
import { Clock, Mail, MapPin } from "lucide-react";
import { FALLBACK_RATES, type DisplayRates } from "@/lib/pricing-display";

export default function Footer({ rates = FALLBACK_RATES }: { rates?: DisplayRates }) {
  void rates;
  return (
    <footer
      id="contact"
      className="scroll-mt-20 border-t border-line bg-oat/60 text-ink"
      aria-labelledby="footer-heading"
    >
      <div className="mx-auto w-full max-w-6xl px-4 pt-12 pb-6 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.7fr_1fr_1fr]">
          <div className="space-y-3">
            <p className="flex items-center gap-2.5" id="footer-heading">
              <Image
                src="/logo.jpg"
                alt="CK Grounds — home"
                width={36}
                height={36}
                className="size-9 rounded-full object-cover"
              />
              <span className="text-lg font-extrabold tracking-tight">CK Grounds</span>
            </p>
            <p className="max-w-xs text-[13px] leading-5 text-ink/70">
              Championship outdoor and covered canopy pickleball courts in Tabuelan,
              Cebu. Premier cushioned surface with instant reservations.
            </p>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-line bg-cream px-3 py-1.5 text-[11px] font-bold text-pine">
              <Clock className="size-3.5" aria-hidden /> Open Daily: 6:00 AM – 3:00 AM
            </p>
          </div>

          <nav className="space-y-2.5" aria-label="Quick links">
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-ink/60 uppercase">
              Quick Links
            </p>
            {[
              { href: "/#top", label: "Home" },
              { href: "/book", label: "Book Now" },
              { href: "/how-it-works", label: "How It Works" },
              { href: "/#contact", label: "Contact" },
              { href: "/#faq", label: "FAQ" },
            ].map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="block w-fit text-sm font-medium text-ink/75 hover:text-flame hover:underline"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="space-y-2.5">
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-ink/60 uppercase">
              Location
            </p>
            <p className="flex items-start gap-2 text-[13px] leading-5 text-ink/75">
              <MapPin className="mt-0.5 size-4 shrink-0 text-flame" aria-hidden />
              RVF9+6XW, Poblacion, Tabuelan, Cebu, Philippines
            </p>
            <a
              href="https://www.google.com/maps/search/?api=1&query=Tabuelan+Cebu+Philippines"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-fit text-[13px] font-bold text-flame hover:text-flame-hover hover:underline"
            >
              Open in Google Maps
            </a>
          </div>

          <div className="space-y-2.5">
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-ink/60 uppercase">
              Direct Contact
            </p>
            <p className="text-[13px] leading-5 text-ink/70">
              Questions, private tournaments, or venue bookings? Reach us directly:
            </p>
            <p className="text-[11px] font-extrabold tracking-[0.12em] text-ink/50 uppercase">
              Email us
            </p>
            <a
              href="mailto:paddleculture0@gmail.com"
              className="flex items-center gap-2 text-[13px] font-bold break-all text-ink hover:text-flame hover:underline"
            >
              <Mail className="size-4 shrink-0 text-flame" aria-hidden />
              paddleculture0@gmail.com
            </a>
            <p className="pt-1 text-[11px] font-extrabold tracking-[0.12em] text-ink/50 uppercase">
              Accepted payments
            </p>
            <div className="flex flex-wrap gap-1.5">
              {["GCash", "BDO", "BPI"].map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-line bg-cream px-3 py-1 text-[11px] font-extrabold text-pine"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-5 text-xs text-ink/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2025 CK Grounds. All rights reserved.</p>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Legal">
            {[
              { href: "/#faq", label: "Court Rules" },
              { href: "/#faq", label: "Terms of Service" },
              { href: "/#faq", label: "Privacy Policy" },
              { href: "/#contact", label: "Contact Support" },
            ].map((l) => (
              <a key={l.label} href={l.href} className="hover:text-flame hover:underline">
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
