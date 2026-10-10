"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminUserRecord } from "@/lib/admin/users";

export default function UsersTable({
  users,
  actorId,
}: {
  users: AdminUserRecord[];
  actorId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function handleAction(
    userId: string,
    action: "deactivate" | "reactivate",
  ) {
    setBusy(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/${action}`, {
        method: "POST",
      });
      const body = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(body.error?.message ?? `Could not ${action} user.`);
        return;
      }
      toast.success(
        action === "deactivate" ? "User deactivated." : "User reactivated.",
      );
      router.refresh();
    } catch {
      toast.error("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  if (users.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-warm-muted">
        No admin users found.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-line bg-oat/40 hover:bg-oat/40">
          <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
            Name
          </TableHead>
          <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
            Email
          </TableHead>
          <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
            Status
          </TableHead>
          <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const isSelf = user.id === actorId;
          const active = user.status === "active";
          return (
            <TableRow
              key={user.id}
              className="border-b border-line/60 transition-colors hover:bg-oat/20"
            >
              <TableCell className="px-4 py-3 font-medium text-ink">
                {user.name ?? "—"}
              </TableCell>
              <TableCell className="px-4 py-3 text-sm text-ink/70">
                {user.email}
              </TableCell>
              <TableCell className="px-4 py-3">
                <Badge
                  variant={active ? "default" : "secondary"}
                  className="text-[11px]"
                >
                  {active ? "Active" : "Deactivated"}
                </Badge>
              </TableCell>
              <TableCell className="px-4 py-3 text-right">
                {!isSelf && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={busy === user.id}
                    onClick={() =>
                      handleAction(user.id, active ? "deactivate" : "reactivate")
                    }
                    className="rounded-lg border-line text-xs font-bold"
                  >
                    {active ? "Deactivate" : "Reactivate"}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
