import { CarFront, Clock, ExternalLink, Mail, MapPin } from "lucide-react";
import Header from "@/components/landing/header";
import Footer from "@/components/landing/footer";

const MAP_EMBED = "https://www.google.com/maps?q=Tabuelan,+Cebu,+Philippines&output=embed";
const MAP_LINK = "https://www.google.com/maps/search/?api=1&query=Tabuelan+Cebu+Philippines";
const CONTACT_EMAIL = "ckgrounds1@gmail.com";

export const metadata = {
  title: "Contact — CK Grounds",
  description:
    "Get in touch with CK Grounds for questions, private tournaments, or venue bookings. Find us in Tabuelan, Cebu.",
};

export default function ContactPage() {
  return (
    <>
      <Header />
      <main id="main" className="bg-cream pt-16">
        {/* Hero */}
        <section
          className="mx-auto w-full max-w-6xl px-4 pt-12 pb-10 text-center sm:px-6"
          aria-labelledby="contact-heading"
        >
          <p className="inline-block rounded-full bg-flame-light px-4 py-1.5 text-[11px] font-extrabold tracking-[0.14em] text-flame uppercase">
            We&apos;d love to hear from you
          </p>
          <h1
            id="contact-heading"
            className="mx-auto mt-4 max-w-2xl text-[40px] leading-[46px] font-extrabold tracking-tight text-pine sm:text-5xl sm:leading-[56px]"
          >
            Get in Touch
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-warm-muted">
            Questions about booking, private tournaments, or venue partnerships?
            Reach out directly — we typically respond within a few hours.
          </p>
        </section>

        {/* Contact cards + map */}
        <section
          className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6"
          aria-label="Contact details"
        >
          <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
            {/* Left — info cards */}
            <div className="space-y-4">
              {/* Email */}
              <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                <p className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] text-flame uppercase">
                  <Mail className="size-3.5" aria-hidden />
                  Email Us
                </p>
                <h2 className="mt-2 text-lg font-bold text-pine">Direct Contact</h2>
                <p className="mt-1 text-[13px] leading-5 text-warm-muted">
                  Questions, private tournaments, or venue bookings? Reach us directly:
                </p>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="mt-4 flex items-center gap-2.5 rounded-xl border border-line bg-oat/60 px-4 py-3 text-sm font-bold text-ink transition-colors hover:border-flame/40 hover:text-flame"
                >
                  <Mail className="size-4 shrink-0 text-flame" aria-hidden />
                  {CONTACT_EMAIL}
                </a>
              </div>

              {/* Hours */}
              <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                <p className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] text-flame uppercase">
                  <Clock className="size-3.5" aria-hidden />
                  Operating Hours
                </p>
                <h2 className="mt-2 text-lg font-bold text-pine">Open Every Day</h2>
                <p className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-oat/60 px-4 py-3 text-sm font-bold text-pine">
                  <span className="size-2 shrink-0 rounded-full bg-live-dot" aria-hidden />
                  6:00 AM – 3:00 AM daily
                </p>
              </div>

              {/* Address */}
              <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
                <p className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] text-flame uppercase">
                  <MapPin className="size-3.5" aria-hidden />
                  Location
                </p>
                <h2 className="mt-2 text-lg font-bold text-pine">Find Us in Tabuelan</h2>
                <p className="mt-1 text-[13px] leading-5 text-warm-muted">
                  RVF9+6XW, Poblacion, Tabuelan, Cebu, Philippines
                </p>
                <ul className="mt-4 space-y-2">
                  <li className="flex items-start gap-3 rounded-xl border border-line bg-oat/40 px-4 py-3">
                    <CarFront className="mt-0.5 size-4 shrink-0 text-flame" aria-hidden />
                    <span className="text-[13px] leading-5 text-ink/70">
                      Dedicated vehicle and motorcycle parking with 24/7 security.
                    </span>
                  </li>
                </ul>
                <a
                  href={MAP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-flame px-5 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-flame-hover"
                >
                  Open in Google Maps <ExternalLink className="size-4" aria-hidden />
                </a>
              </div>
            </div>

            {/* Right — map embed */}
            <div className="relative overflow-hidden rounded-3xl border border-line bg-[repeating-linear-gradient(-45deg,#e9e4d8_0_8px,#f4efe2_8px_16px)] shadow-[0_20px_50px_rgba(66,48,45,0.12)] lg:min-h-[560px]">
              <iframe
                title="Map — CK Grounds, Tabuelan Cebu"
                src={MAP_EMBED}
                className="h-full min-h-[400px] w-full border-0 lg:min-h-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          </div>
        </section>

        {/* Accepted payments */}
        <section
          className="border-t border-line bg-oat/40"
          aria-label="Accepted payment methods"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-4 px-4 py-8 text-center sm:px-6">
            <p className="text-[11px] font-extrabold tracking-[0.14em] text-ink/60 uppercase">
              Accepted Payments
            </p>
            {["GCash", "BDO", "BPI"].map((p) => (
              <span
                key={p}
                className="rounded-full border border-line bg-cream px-4 py-1.5 text-[11px] font-extrabold text-pine"
              >
                {p}
              </span>
            ))}
          </div>
        </section>

        {/* Developer attribution */}
        <section
          className="border-t border-line bg-pine text-pine-ink"
          aria-labelledby="dev-section-heading"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <p className="inline-block rounded-full border border-pine-ink/20 bg-pine-ink/10 px-4 py-1.5 text-[11px] font-extrabold tracking-[0.14em] text-pine-ink/70 uppercase">
                Want a system like this?
              </p>
              <h2
                id="dev-section-heading"
                className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl"
              >
                Built by Josephus
              </h2>
              <p className="mt-3 text-base leading-7 text-pine-ink/70">
                This booking platform was designed and developed by Josephus — covering everything
                from the reservation system and payment flow to the admin dashboard and automated
                email notifications.
              </p>
              <p className="mt-2 text-base leading-7 text-pine-ink/70">
                Interested in a custom system for your business? Or spotted a bug on this site?
                Reach out directly.
              </p>

              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href="https://sephus.tech"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-flame px-7 py-3.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(234,102,44,0.35)] transition-all hover:-translate-y-0.5 hover:bg-flame-hover"
                >
                  Visit sephus.tech
                  <ExternalLink className="size-4" aria-hidden />
                </a>
                <a
                  href="https://sephus.tech"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-pine-ink/25 bg-pine-ink/10 px-7 py-3.5 text-sm font-bold text-pine-ink transition-all hover:-translate-y-0.5 hover:bg-pine-ink/20"
                >
                  Report a site issue
                </a>
              </div>

              <p className="mt-8 text-[12px] text-pine-ink/40">
                Developed by Josephus ·{" "}
                <a
                  href="https://sephus.tech"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-pine-ink/70 hover:underline"
                >
                  sephus.tech
                </a>
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
