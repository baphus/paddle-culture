"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
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

  const handleAction = useCallback(
    async (userId: string, action: "deactivate" | "reactivate") => {
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
    },
    [router],
  );

  const columns = useMemo<ColumnDef<AdminUserRecord>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name ?? "—"}</span>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.email}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge
            variant={row.original.status === "active" ? "default" : "secondary"}
          >
            {row.original.status === "active" ? "Active" : "Deactivated"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const user = row.original;
          const active = user.status === "active";
          if (user.id === actorId) return null;
          return (
            <div className="text-right">
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={busy === user.id}
                onClick={() =>
                  handleAction(user.id, active ? "deactivate" : "reactivate")
                }
              >
                {active ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          );
        },
      },
    ],
    [actorId, busy, handleAction],
  );

  if (users.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No admin users found.
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={users}
      searchKey="email"
      placeholder="Filter users…"
    />
  );
}
