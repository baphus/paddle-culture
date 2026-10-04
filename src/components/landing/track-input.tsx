"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { LoadingAnimation } from "@/components/ui/loading-animation";

const TOKEN_RE = /^(PC-\d{4}-[A-Z0-9]{4}|[A-Za-z0-9_-]{8,128})$/;

export default function TrackInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  function go(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      toast.error("Enter your tracking code first — it looks like PC-2026-XXXX.");
      return;
    }
    const upper = trimmed.toUpperCase();
    const candidate = upper.startsWith("PC-") ? upper.replace(/\s+/g, "") : trimmed.replace(/\s+/g, "");
    if (!TOKEN_RE.test(candidate)) {
      toast.error("That code doesn't look right. Check your email for the full tracking code.");
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
        Tracking code
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="track-token"
          name="token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="PC-2026-XXXX"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          className="h-12 flex-1 rounded-xl border border-line bg-oat/60 px-4 font-mono text-sm font-bold tracking-[0.1em] text-ink uppercase placeholder:text-warm-muted/70 focus:border-flame focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-pine px-6 text-sm font-bold whitespace-nowrap text-white transition-all hover:-translate-y-0.5 hover:bg-pine-high disabled:opacity-60"
        >
          {busy ? (
            <><LoadingAnimation size="compact" label="Checking booking" /> Checking…</>
          ) : (
            <><Search className="size-4" aria-hidden /> Track</>
          )}
        </button>
      </div>
    </form>
  );
}
