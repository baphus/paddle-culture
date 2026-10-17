"use client";

import { useState } from "react";
import { ExternalLink, Sparkles, X } from "lucide-react";

const PORTFOLIO_URL = "https://www.sephus.tech";

export default function DeveloperPromo() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="fixed right-4 bottom-4 z-50">
      {open ? (
        <div className="w-64 rounded-2xl border border-line bg-cream p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-extrabold tracking-tight text-ink">
              Want a website or system like this?
            </p>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Close"
              className="shrink-0 rounded-full p-0.5 text-ink/50 hover:text-flame"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <p className="mt-1 text-xs leading-5 text-ink/70">
            Booking systems, websites, and more — built by the developer of this site.
          </p>
          <a
            href={PORTFOLIO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-flame px-3.5 py-2 text-xs font-bold text-white hover:bg-flame-hover"
          >
            Contact Sephus
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-cream px-3.5 py-2 text-xs font-bold text-ink shadow-lg transition-colors hover:border-flame hover:text-flame"
        >
          <Sparkles className="size-3.5 text-flame" aria-hidden />
          Want a site like this?
        </button>
      )}
    </div>
  );
}
