"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  BOOKINGS_PAGE_SIZE,
  BOOKING_STATUSES,
  type BookingDetail,
} from "@/lib/admin/bookings";
import { columns } from "./columns";
import BookingsFilterDropdown from "./bookings-filter-dropdown";

export interface BookingsFilters {
  q: string;
  status: string;
  from: string;
  to: string;
}

export default function BookingsTable({
  rows,
  page,
  pageCount,
  filters,
}: {
  rows: BookingDetail[];
  page: number;
  pageCount: number;
  filters: BookingsFilters;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);

  // Server-side URL state; page resets to 1 whenever a filter changes.
  function href(next: Partial<BookingsFilters> & { page?: number }): string {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.status && merged.status !== "all") params.set("status", merged.status);
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const qs = params.toString();
    return `/admin/bookings${qs ? `?${qs}` : ""}`;
  }

  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => router.replace(href({ q })), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {["all", ...BOOKING_STATUSES].map((s) => (
          <Button
            key={s}
            type="button"
            size="sm"
            variant={filters.status === s ? "default" : "outline"}
            className="rounded-full"
            onClick={() => router.push(href({ status: s }))}
          >
            {s === "all" ? "All" : s}
          </Button>
        ))}
        <BookingsFilterDropdown
          q={filters.q}
          status={filters.status}
          from={filters.from}
          to={filters.to}
        />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        manualPagination
        pageCount={pageCount}
        pageIndex={page - 1}
        onPageChange={(p) => router.push(href({ page: p + 1 }))}
        searchValue={q}
        onSearchChange={setQ}
        placeholder="Search by name…"
        pageSize={BOOKINGS_PAGE_SIZE}
      />
    </div>
  );
}
