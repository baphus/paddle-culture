"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingAnimation } from "@/components/ui/loading-animation";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(body.error?.message ?? "Could not send the reset email.");
        return;
      }
      setSent(true);
    } catch {
      setError("Could not send the reset email.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Card className="p-0">
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center md:p-8">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-sm text-balance text-muted-foreground">
            If an account exists for {email}, a password reset link is on its
            way. It expires shortly — request a new one if it has run out.
          </p>
          <Link
            href="/login"
            className="text-sm underline-offset-4 hover:underline"
          >
            ← Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <CardContent className="p-0">
        <form onSubmit={onSubmit} className="flex flex-col gap-6 p-6 md:p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-bold">Forgot password</h1>
            <p className="text-sm text-balance text-muted-foreground">
              Enter your admin email and we'll send you a reset link
            </p>
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
              />
            </Field>
            <Field>
              <FieldError>{error}</FieldError>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingAnimation size="compact" label="Sending" />
                    Sending…
                  </span>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </Field>
          </FieldGroup>
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/login"
              className="underline-offset-4 hover:underline"
            >
              ← Back to sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
