"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [valid, setValid] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setValid(false);
      return;
    }
    fetch(`/api/auth/invites/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((b: { valid?: boolean }) => setValid(b.valid === true))
      .catch(() => setValid(false));
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, name, email, password }),
      });
      const body = (await res.json()) as {
        error?: { message?: string };
        hasSession?: boolean;
      };
      if (!res.ok) {
        setError(body.error?.message ?? "Registration failed.");
        return;
      }
      router.push(body.hasSession ? "/admin" : "/login");
      router.refresh();
    } catch {
      setError("Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  if (valid === null) return <p>Checking invite…</p>;
  if (!valid) return <p role="alert">This invite link is invalid or already used.</p>;

  return (
    <form onSubmit={onSubmit}>
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Creating account…" : "Create admin account"}
      </Button>
    </form>
  );
}
