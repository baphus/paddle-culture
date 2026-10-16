"use client";

import { DataTable } from "@/components/ui/data-table";
import type { BookingDetail } from "@/lib/admin/bookings";
import { columns } from "./columns";

export default function BookingsTable({ rows }: { rows: BookingDetail[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKey="fullName"
      placeholder="Search by name…"
      pageSize={20}
    />
  );
}
