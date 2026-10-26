"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { UserStatusBadge } from "@/components/admin/status-badge";
import { DataTable } from "@/components/ui/data-table";
import type { AdminUserRecord } from "@/lib/admin/users";

export default function UsersTable({
  users,
  currentUserId,
  actions,
}: {
  users: AdminUserRecord[];
  currentUserId: string;
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<AdminUserRecord | null>(null);

  async function deleteUser(user: AdminUserRecord) {
    setPendingDelete(null);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        toast.error(body.error?.message ?? "Could not delete user.");
        return;
      }
      toast.success("Admin user deleted.");
      router.refresh();
    } catch {
      toast.error("Could not delete user.");
    }
  }

  const columns = useMemo<ColumnDef<AdminUserRecord>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span>{row.original.name ?? <span className="text-muted-foreground">—</span>}</span>
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
        cell: ({ row }) => <UserStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "createdAt",
        header: "Date added",
        cell: ({ row }) => {
          const value = row.original.createdAt;
          if (!value) {
            return <span className="text-muted-foreground">—</span>;
          }
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) {
            return <span className="text-muted-foreground">{value}</span>;
          }
          return (
            <span className="text-muted-foreground">
              {date.toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) =>
          row.original.id === currentUserId ? (
            <span className="text-xs text-muted-foreground">Current user</span>
          ) : (
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              title={`Delete ${row.original.email}`}
              aria-label={`Delete ${row.original.email}`}
              onClick={() => setPendingDelete(row.original)}
            >
              <Trash2 />
            </Button>
          ),
      },
    ],
    [currentUserId],
  );

  if (users.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No admin users found.
      </div>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={users}
        searchKey="email"
        placeholder="Filter users…"
        actions={actions}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete admin user?"
        description={
          pendingDelete
            ? `Delete ${pendingDelete.name || pendingDelete.email}? This permanently removes the admin account.`
            : ""
        }
        onConfirm={() => {
          if (pendingDelete) void deleteUser(pendingDelete);
        }}
      />
    </>
  );
}
