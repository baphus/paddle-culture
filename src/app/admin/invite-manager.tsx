"use client";

import { useEffect, useState } from "react";
import { TZDate } from "@date-fns/tz";
import { Copy, Link as LinkIcon, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Invite {
  tokenHash: string;
  createdAt: string;
  usedAt: string | null;
  status: "used" | "pending";
}

/** "Oct 18, 2026, 12:05 PM" — Manila wall clock. */
function formatCreatedAt(dateStr: string): string {
  return new TZDate(dateStr, "Asia/Manila").toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InviteManager() {
  const [open, setOpen] = useState(false);
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
    if (open) void refresh();
  }, [open]);

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="h-9">
            <UserPlus />
            Invite
          </Button>
        }
      />
      <DialogContent className="max-w-xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Invite an admin</DialogTitle>
          <DialogDescription>
            Generate a single-use link to invite a new admin.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          {/* Generate */}
          <Button type="button" onClick={generate} disabled={busy}>
            <LinkIcon />
            {busy ? "Generating…" : "Generate invite link"}
          </Button>

          {/* Generated link */}
          {link && (
            <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-card p-3">
              <code
                className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                title={link}
              >
                {link}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={copyLink}
                className="shrink-0"
                title="Copy link"
              >
                <Copy />
              </Button>
            </div>
          )}

          {/* Existing invites */}
          {invites.length > 0 && (
            <div className="min-w-0 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Existing invites
              </p>
              <div className="divide-y overflow-hidden rounded-lg border bg-card">
                {invites.map((i) => (
                  <div
                    key={i.tokenHash}
                    className="flex min-w-0 items-center justify-between gap-4 px-4 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge
                        variant={i.status === "used" ? "secondary" : "default"}
                        className="shrink-0"
                      >
                        {i.status === "used" ? "Used" : "Pending"}
                      </Badge>
                      <span className="min-w-0 truncate text-xs text-muted-foreground">
                        {formatCreatedAt(i.createdAt)}
                      </span>
                    </div>
                    {i.status === "pending" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => revoke(i.tokenHash)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        title="Revoke invite"
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
