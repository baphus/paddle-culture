"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
    <Card className="p-0">
      <CardContent className="grid p-0 md:grid-cols-2">
        <form onSubmit={onSubmit} className="flex flex-col gap-6 p-6 md:p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <Image
              src="/images/ck-grounds-logo.jpg"
              alt="CK Grounds"
              width={96}
              height={96}
              priority
              className="size-20 rounded-xl object-contain"
            />
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-sm text-balance text-muted-foreground">
              Sign in to your CK Grounds admin account
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
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>

            <Field>
              <FieldError>{error}</FieldError>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingAnimation size="compact" label="Signing in" />
                    Signing in…
                  </span>
                ) : (
                  "Sign in"
                )}
              </Button>
            </Field>
          </FieldGroup>
        </form>

        <div className="relative hidden md:block">
          <Image
            src="/images/net.jpg"
            alt="Pickleball court at CK Grounds"
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover dark:brightness-[0.2] dark:grayscale"
          />
        </div>
      </CardContent>
    </Card>
  );
}
