"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

// Short tracking code: exactly 5 uppercase alphanumeric chars
const TRACKING_CODE_RE = /^[A-Z0-9]{5}$/;

export default function TrackInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function go(raw: string, rawEmail: string) {
    const code = raw.trim().toUpperCase().replace(/\s+/g, "");
    const cleanEmail = rawEmail.trim();
    if (!code) {
      toast.error("Enter your tracking code from the confirmation email.");
      return;
    }
    if (!TRACKING_CODE_RE.test(code)) {
      toast.error("Tracking codes are 5 characters — like AB3K7. Check your email.");
      return;
    }
    if (!cleanEmail) {
      toast.error("Enter the email address you used to book.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(
        `/api/booking/track?code=${encodeURIComponent(code)}&email=${encodeURIComponent(cleanEmail)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "No booking found. Double-check the code and email and try again.");
        return;
      }
      router.push(`/track/${encodeURIComponent(data.token)}`);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        go(value, email);
      }}
    >
      <label htmlFor="track-code" className="sr-only">
        Tracking code
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="track-code"
          name="code"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="e.g. AB3K7"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          maxLength={5}
          className="h-12 flex-1 rounded-xl border border-line bg-oat/60 px-4 text-sm font-medium tracking-widest text-ink placeholder:text-warm-muted/60 placeholder:tracking-normal focus:border-flame focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || value.trim().length === 0}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-pine px-6 text-sm font-bold whitespace-nowrap text-white transition-all hover:-translate-y-0.5 hover:bg-pine-high disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span>Checking…</span>
            </>
          ) : (
            <>
              <Search className="size-4" aria-hidden />
              <span>View Booking</span>
            </>
          )}
        </button>
      </div>
      <div className="mt-2">
        <label htmlFor="track-email" className="sr-only">
          Email address used to book
        </label>
        <input
          id="track-email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address you booked with"
          autoComplete="email"
          spellCheck={false}
          className="h-12 w-full rounded-xl border border-line bg-oat/60 px-4 text-sm font-medium text-ink placeholder:text-warm-muted/60 focus:border-flame focus:outline-none"
        />
      </div>
      <p className="mt-1.5 text-[11px] text-warm-muted/80">
        5-character code and the email from your confirmation email
      </p>
    </form>
  );
}
