"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CalendarCheck, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/#top", label: "Home" },
  { href: "/book", label: "Book Now" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/#contact", label: "Contact" },
];

export default function Header() {
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  const isActive = (href: string) => {
    if (href === "/#top") return pathname === "/" && hash !== "#contact";
    if (href === "/#contact") return pathname === "/" && hash === "#contact";
    return pathname === href;
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/70 bg-cream/95 backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-lg focus:bg-pine focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="/#top" className="flex items-center gap-2.5" aria-label="CK Grounds — home">
          <Image
            src="/logo.jpg"
            alt="CK Grounds — home"
            width={36}
            height={36}
            className="size-9 rounded-full object-cover"
            priority
          />
          <span className="leading-none">
            <span className="block text-[15px] font-extrabold tracking-tight text-ink">
              CK Grounds
            </span>
            <span className="block text-[10px] font-bold tracking-[0.18em] text-warm-muted uppercase">
              Pickleball Club
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                isActive(l.href)
                  ? "bg-pine text-white"
                  : "text-ink/80 hover:bg-oat hover:text-ink",
              )}
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 lg:flex">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-parchment px-3.5 py-2 text-xs font-bold whitespace-nowrap text-pine">
            <span className="size-1.5 rounded-full bg-live-dot" aria-hidden />
            Open Daily: 6:00 AM – 3:00 AM
          </span>
          <a
            href="/book"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-flame px-5 py-2.5 text-sm font-bold whitespace-nowrap text-white shadow-[0_8px_20px_rgba(234,102,44,0.35)] transition-all hover:-translate-y-0.5 hover:bg-flame-hover"
          >
            <CalendarCheck className="size-4" aria-hidden />
            Book a Court
          </a>
        </div>

        {/* Mobile nav — no-JS <details> island so header stays an RSC */}
        <details className="group relative lg:hidden">
          <summary
            className={cn(
              "grid size-10 cursor-pointer list-none place-items-center rounded-xl border border-line bg-parchment text-pine",
              "[&::-webkit-details-marker]:hidden",
            )}
            aria-label="Open menu"
          >
            <Menu className="size-5 group-open:hidden" aria-hidden />
            <X className="hidden size-5 group-open:block" aria-hidden />
          </summary>
          <nav
            className="absolute top-12 right-0 w-64 rounded-2xl border border-line bg-parchment p-2 shadow-xl"
            aria-label="Mobile"
          >
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? "page" : undefined}
                className={cn(
                  "block rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                  isActive(l.href)
                    ? "bg-pine text-white"
                    : "text-ink hover:bg-oat",
                )}
              >
                {l.label}
              </a>
            ))}
            <p className="mx-4 mt-2 mb-1 inline-flex items-center gap-1.5 rounded-full border border-line bg-cream px-3 py-1.5 text-[11px] font-bold text-pine">
              <span className="size-1.5 rounded-full bg-live-dot" aria-hidden />
              Open Daily: 6:00 AM – 3:00 AM
            </p>
            <a
              href="/book"
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-flame px-4 py-3 text-center text-sm font-bold text-white hover:bg-flame-hover"
            >
              <CalendarCheck className="size-4" aria-hidden />
              Book a Court
            </a>
          </nav>
        </details>
      </div>
    </header>
  );
}
