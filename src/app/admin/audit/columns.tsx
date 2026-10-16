import type { ColumnDef } from "@tanstack/react-table";
import { AuditActionBadge } from "@/components/admin/status-badge";

export type AuditRow = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  at: string;
};

function summarize(value: unknown): string {
  if (value == null) return "—";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > 100 ? `${s.slice(0, 100)}…` : s;
}

function formatAt(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const summary = (value: unknown) => (
  <span className="block max-w-[200px] truncate text-xs text-muted-foreground">
    {summarize(value)}
  </span>
);

export function buildColumns(withDiff: boolean): ColumnDef<AuditRow>[] {
  const columns: ColumnDef<AuditRow>[] = [
    {
      accessorKey: "at",
      header: "Time (Manila)",
      cell: ({ row }) => (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {formatAt(row.original.at)}
        </span>
      ),
    },
    {
      accessorKey: "actor",
      header: "Actor",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-[120px] truncate text-xs text-muted-foreground">
          {row.original.actor}
        </span>
      ),
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => <AuditActionBadge action={row.original.action} />,
    },
    {
      accessorKey: "entity",
      header: "Entity",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.entity}
        </span>
      ),
    },
    {
      accessorKey: "entity_id",
      header: "Entity ID",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="block max-w-[100px] truncate font-mono text-xs text-muted-foreground">
          {row.original.entity_id}
        </span>
      ),
    },
  ];

  // Diff columns are off by default and revealed by the table's own toggle,
  // so they are excluded from the Columns menu (one control per column).
  if (withDiff) {
    columns.push(
      {
        accessorKey: "before",
        header: "Before",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => summary(row.original.before),
      },
      {
        accessorKey: "after",
        header: "After",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => summary(row.original.after),
      },
    );
  }

  return columns;
}
