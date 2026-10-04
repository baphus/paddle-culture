"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Invite {
  tokenHash: string;
  createdAt: string;
  usedAt: string | null;
  status: "used" | "pending";
}

export default function InviteManager({ email, name }: { email: string; name: string | null }) {
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/auth/invites");
    if (!res.ok) return;
    const body = (await res.json()) as { invites?: Invite[] };
    setInvites(body.invites ?? []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function generate() {
    setBusy(true);
    setError(null);
    setLink(null);
    try {
      const res = await fetch("/api/auth/invites", { method: "POST" });
      const body = (await res.json()) as { inviteLink?: string; error?: { message?: string } };
      if (!res.ok) {
        setError(body.error?.message ?? "Could not generate invite.");
        return;
      }
      setLink(body.inviteLink ?? null);
      await refresh();
    } catch {
      setError("Could not generate invite.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(tokenHash: string) {
    setError(null);
    try {
      const res = await fetch(`/api/auth/invites/revoke?tokenHash=${encodeURIComponent(tokenHash)}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(body.error?.message ?? "Could not revoke invite.");
        return;
      }
      await refresh();
    } catch {
      setError("Could not revoke invite.");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div>
      <p>
        Signed in as {name ?? email} ({email})
      </p>
      <Button type="button" onClick={logout}>
        Sign out
      </Button>
      <h2>Admin invites</h2>
      <Button type="button" onClick={generate} disabled={busy}>
        {busy ? "Generating…" : "Generate invite link"}
      </Button>
      {link ? (
        <p>
          Copy this link (e.g. to Messenger): <code>{link}</code>
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <ul>
        {invites.map((i) => (
          <li key={i.tokenHash}>
            {i.status} · created {i.createdAt}
            {i.status === "pending" ? (
              <Button type="button" onClick={() => revoke(i.tokenHash)}>
                Revoke
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
