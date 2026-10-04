"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingAnimation } from "@/components/ui/loading-animation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(body.error?.message ?? "Sign-in failed.");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm font-semibold text-ink">
          Email
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
          required
          className="h-10 rounded-xl border-line bg-white px-3.5 text-sm placeholder:text-warm-muted focus-visible:border-flame focus-visible:ring-flame/20"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-sm font-semibold text-ink">
          Password
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          className="h-10 rounded-xl border-line bg-white px-3.5 text-sm placeholder:text-warm-muted focus-visible:border-flame focus-visible:ring-flame/20"
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-error/20 bg-error/5 px-3.5 py-2.5 text-sm font-medium text-error">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={busy}
        className="h-10 w-full rounded-xl bg-flame text-sm font-bold text-white shadow-[0_4px_14px_rgba(234,102,44,0.30)] transition-all hover:-translate-y-0.5 hover:bg-flame-hover disabled:opacity-60 disabled:translate-y-0"
      >
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            <LoadingAnimation size="compact" label="Signing in" />
            Signing in…
          </span>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}
