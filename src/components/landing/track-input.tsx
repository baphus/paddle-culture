"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { LoadingAnimation } from "@/components/ui/loading-animation";

const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;

export default function TrackInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  function go(raw: string) {
    const trimmed = raw.trim().replace(/\s+/g, "");
    if (!trimmed) {
      toast.error("Paste the booking link or code from your email.");
      return;
    }
    // Accept a full URL — extract the token from /track/<token>
    let candidate = trimmed;
    try {
      const parsed = new URL(trimmed);
      const match = parsed.pathname.match(/\/track\/([^/]+)/);
      if (match?.[1]) candidate = match[1];
    } catch {
      // not a URL, use as-is
    }
    if (!TOKEN_RE.test(candidate)) {
      toast.error("That doesn't look right. Check your email for the booking link or QR code.");
      return;
    }
    setBusy(true);
    router.push(`/track/${encodeURIComponent(candidate)}`);
  }

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        go(value);
      }}
    >
      <label htmlFor="track-token" className="sr-only">
        Booking link or reference
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="track-token"
          name="token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste booking link or scan QR"
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          className="h-12 flex-1 rounded-xl border border-line bg-oat/60 px-4 text-sm font-medium text-ink placeholder:text-warm-muted/70 focus:border-flame focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-pine px-6 text-sm font-bold whitespace-nowrap text-white transition-all hover:-translate-y-0.5 hover:bg-pine-high disabled:opacity-60"
        >
          {busy ? (
            <><LoadingAnimation size="compact" label="Checking booking" /> Checking…</>
          ) : (
            <><Search className="size-4" aria-hidden /> View Booking</>
          )}
        </button>
      </div>
    </form>
  );
}
