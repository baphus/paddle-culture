"use client";

import { CalendarX2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import type { BookingDetail } from "@/lib/admin/bookings";
import { columns } from "./bookings/columns";
import BookingCard from "./bookings/booking-card";
import { useBookingView } from "./recent-bookings-card";

// Client boundary for the dashboard slice: column defs hold render functions,
// so they cannot be passed from the server page. Pages client-side over the
// ~50-row slice the server fetched (same full columns + Actions as /bookings).
export default function RecentBookingsTable({
  rows,
}: {
  rows: BookingDetail[];
}) {
  const view = useBookingView();

  if (rows.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <CalendarX2 className="size-6 opacity-50" />
        <span>No bookings yet.</span>
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKey="fullName"
      placeholder="Search bookings…"
      pageSize={10}
      view={view}
      gridCard={(b) => <BookingCard booking={b} />}
      showColumnToggle={false}
      showSearch={false}
    />
  );
}
