"use client";

import { useEffect, useState } from "react";
import { Copy, Link as LinkIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Invite {
  tokenHash: string;
  createdAt: string;
  usedAt: string | null;
  status: "used" | "pending";
}

export default function InviteManager({
  email,
  name,
}: {
  email: string;
  name: string | null;
}) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [link, setLink] = useState<string | null>(null);
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
    setLink(null);
    try {
      const res = await fetch("/api/auth/invites", { method: "POST" });
      const body = (await res.json()) as {
        inviteLink?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        toast.error(body.error?.message ?? "Could not generate invite.");
        return;
      }
      setLink(body.inviteLink ?? null);
      await refresh();
    } catch {
      toast.error("Could not generate invite.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(tokenHash: string) {
    try {
      const res = await fetch(
        `/api/auth/invites/revoke?tokenHash=${encodeURIComponent(tokenHash)}`,
        { method: "DELETE" },
      );
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(body.error?.message ?? "Could not revoke invite.");
        return;
      }
      toast.success("Invite revoked.");
      await refresh();
    } catch {
      toast.error("Could not revoke invite.");
    }
  }

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link).then(
      () => toast.success("Invite link copied."),
      () => toast.error("Copy failed."),
    );
  }

  return (
    <div className="space-y-4">
      {/* Current user */}
      <div className="flex items-center justify-between gap-4 rounded-xl bg-oat/60 px-4 py-3">
        <div>
          {name ? (
            <p className="text-sm font-semibold text-ink">{name}</p>
          ) : null}
          <p className="text-xs text-warm-muted">{email}</p>
        </div>
      </div>

      {/* Generate */}
      <Button
        type="button"
        onClick={generate}
        disabled={busy}
        className="h-9 rounded-lg bg-pine px-4 text-xs font-bold text-white hover:bg-pine/90"
      >
        <LinkIcon className="mr-1.5 size-3.5" />
        {busy ? "Generating…" : "Generate invite link"}
      </Button>

      {/* Generated link */}
      {link && (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-white p-3">
          <code className="min-w-0 flex-1 truncate text-xs text-ink/70">
            {link}
          </code>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={copyLink}
            className="h-7 w-7 shrink-0 rounded-lg border-line"
            title="Copy link"
          >
            <Copy className="size-3.5" />
          </Button>
        </div>
      )}

      {/* Existing invites */}
      {invites.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-ink/50">
            Existing invites
          </p>
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {invites.map((i) => (
              <div
                key={i.tokenHash}
                className="flex items-center justify-between gap-4 px-4 py-2.5"
              >
                <div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      i.status === "used"
                        ? "bg-oat text-warm-muted"
                        : "bg-live text-pine"
                    }`}
                  >
                    {i.status === "used" ? "Used" : "Pending"}
                  </span>
                  <span className="ml-2 text-xs text-warm-muted">
                    {i.createdAt}
                  </span>
                </div>
                {i.status === "pending" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => revoke(i.tokenHash)}
                    className="h-7 w-7 shrink-0 rounded-lg border-line text-warm-muted hover:border-error/30 hover:bg-error/5 hover:text-error"
                    title="Revoke invite"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
