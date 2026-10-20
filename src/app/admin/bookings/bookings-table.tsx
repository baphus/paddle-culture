"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AdminFilterDropdown,
  FilterGroupSection,
} from "@/components/admin/admin-filter-dropdown";
import {
  BOOKINGS_PAGE_SIZE,
  BOOKING_STATUSES,
  type BookingDetail,
} from "@/lib/admin/bookings";
import { columns } from "./columns";
import BookingCard from "./booking-card";

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
  focusId,
  newBookingHref,
}: {
  rows: BookingDetail[];
  page: number;
  pageCount: number;
  filters: BookingsFilters;
  /** Booking id to highlight + scroll to (from a notification click). */
  focusId?: string;
  newBookingHref: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  // Re-runs the server render with the same URL, so filters, page and search
  // all survive while isPending keeps the button spinning.
  const [isRefreshing, startRefresh] = useTransition();

  function refresh() {
    startRefresh(() => router.refresh());
  }

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

  const filterActions = (
    <AdminFilterDropdown
      label={filters.status !== "all" ? `Filter: ${filters.status}` : "Filter"}
      count={[filters.from, filters.to].filter(Boolean).length}
      onApply={(values) =>
        router.push(
          href({
            status: values.status || "all",
            from: values.from ?? "",
            to: values.to ?? "",
          }),
        )
      }
      onReset={() => router.push(href({ status: "all", from: "", to: "" }))}
    >
      <FilterGroupSection title="Status">
        <div className="flex flex-col gap-1.5">
          {["all", ...BOOKING_STATUSES].map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="status"
                value={s}
                defaultChecked={filters.status === s}
                className="size-3.5 accent-primary"
              />
              {s === "all" ? "All" : s}
            </label>
          ))}
        </div>
      </FilterGroupSection>

      <FilterGroupSection title="Date Range">
        <div className="flex flex-col gap-2">
          <div className="space-y-0.5">
            <Label htmlFor="filter-from" className="text-[11px] font-semibold">
              From
            </Label>
            <Input
              id="filter-from"
              name="from"
              type="date"
              defaultValue={filters.from}
              className="w-full"
            />
          </div>
          <div className="space-y-0.5">
            <Label htmlFor="filter-to" className="text-[11px] font-semibold">
              To
            </Label>
            <Input
              id="filter-to"
              name="to"
              type="date"
              defaultValue={filters.to}
              className="w-full"
            />
          </div>
        </div>
      </FilterGroupSection>
    </AdminFilterDropdown>
  );

  return (
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
      focusId={focusId}
      getRowId={(b) => b.id}
      actions={filterActions}
      toolbarActions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-lg"
            onClick={refresh}
            disabled={isRefreshing}
            title="Refresh"
          >
            {isRefreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            <span className="sr-only">Refresh</span>
          </Button>
          <Button
            className="h-9"
            nativeButton={false}
            render={<Link href={newBookingHref} />}
          >
            New booking
          </Button>
        </div>
      }
      gridCard={(b) => <BookingCard booking={b} />}
    />
  );
}
