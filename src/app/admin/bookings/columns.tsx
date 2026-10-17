"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { BookingStatusBadge } from "@/components/admin/status-badge";
import { formatBookingDate, type BookingDetail } from "@/lib/admin/bookings";
import BookingActions from "./booking-actions";

function pesos(total: string): string {
  return `₱${Number(total).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const columns: ColumnDef<BookingDetail>[] = [
  {
    accessorKey: "fullName",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.fullName}</span>
    ),
  },
  {
    accessorKey: "email",
    id: "contact",
    header: "Contact",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="text-xs text-muted-foreground">
        <div>{row.original.email}</div>
        <div>{row.original.phone}</div>
      </div>
    ),
  },
  {
    accessorKey: "courts",
    header: "Courts",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.courts || "—"}
      </span>
    ),
  },
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {formatBookingDate(row.original.date)}
      </span>
    ),
  },
  {
    id: "slots",
    header: "Slots",
    accessorFn: (b) => b.slotLabels.join(", "),
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {row.original.slotLabels.join(", ") || "—"}
      </span>
    ),
  },
  {
    id: "total",
    header: "Total",
    accessorFn: (b) => Number(b.total),
    sortingFn: "basic",
    cell: ({ row }) => (
      <span className="text-sm font-semibold">{pesos(row.original.total)}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <BookingStatusBadge status={row.original.status} />,
  },
  {
    id: "actions",
    header: "Actions",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => <BookingActions booking={row.original} />,
  },
];
