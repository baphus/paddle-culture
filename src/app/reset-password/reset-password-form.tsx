"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingAnimation } from "@/components/ui/loading-animation";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      if (!res.ok) {
        if (body.error?.code === "RESET_EXPIRED") {
          setError(
            "This reset link expired or was already used. Request a new one.",
          );
        } else {
          setError(body.error?.message ?? "Could not update the password.");
        }
        return;
      }
      // The recovery exchange left us signed in — go straight to the panel.
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Could not update the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-0">
      <CardContent className="p-0">
        <form onSubmit={onSubmit} className="flex flex-col gap-6 p-6 md:p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className="text-2xl font-bold">Set a new password</h1>
            <p className="text-sm text-balance text-muted-foreground">
              Choose a password with at least 8 characters
            </p>
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="password">New password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                minLength={8}
                required
              />
            </Field>
            <Field>
              <FieldError>{error}</FieldError>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingAnimation size="compact" label="Saving" />
                    Saving…
                  </span>
                ) : (
                  "Update password"
                )}
              </Button>
            </Field>
          </FieldGroup>
          {error && (
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/forgot-password"
                className="underline-offset-4 hover:underline"
              >
                Request a new reset link
              </Link>
            </p>
          )}
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
