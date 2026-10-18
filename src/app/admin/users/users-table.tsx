"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { UserStatusBadge } from "@/components/admin/status-badge";
import { DataTable } from "@/components/ui/data-table";
import type { AdminUserRecord } from "@/lib/admin/users";

export default function UsersTable({
  users,
  actions,
}: {
  users: AdminUserRecord[];
  actions?: React.ReactNode;
}) {
  const columns = useMemo<ColumnDef<AdminUserRecord>[]>(
    () => [
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
    ],
    [],
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
      actions={actions}
    />
  );
}
