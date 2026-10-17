import Link from "next/link";
import { getDb } from "@/db/client";
import { BOOKING_STATUSES, listBookings } from "@/lib/admin/bookings";
import { requireAdmin } from "@/lib/admin/session";
import PageHeader from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import BookingsTable from "./bookings-table";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const q = first(sp.q).slice(0, 100);
  const rawStatus = first(sp.status);
  const status = (BOOKING_STATUSES as readonly string[]).includes(rawStatus)
    ? rawStatus
    : "all";
  const from = first(sp.from).slice(0, 10);
  const to = first(sp.to).slice(0, 10);
  const requestedPage = Math.max(1, Number.parseInt(first(sp.page), 10) || 1);

  let db;
  try {
    db = getDb();
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title="Bookings" />
        <p className="text-sm text-muted-foreground">Database is not configured.</p>
      </div>
    );
  }

  let result: Awaited<ReturnType<typeof listBookings>>;
  try {
    result = await listBookings(db, {
      q,
      status,
      from,
      to,
      page: requestedPage,
    });
  } catch (err) {
    console.error("[bookings] listBookings failed:", err);
    return (
      <div className="space-y-6">
        <PageHeader title="Bookings" />
        <p className="text-sm text-muted-foreground">
          Could not load bookings. Check your database connection and try again.
        </p>
      </div>
    );
  }

  const { rows, page, totalPages } = result;

  return (
    <div className="space-y-5">
      <PageHeader title="Bookings">
        <Button
          size="sm"
          nativeButton={false}
          render={<Link href="/admin/bookings/new" />}
        >
          New booking
        </Button>
      </PageHeader>
      <BookingsTable
        rows={rows}
        page={page}
        pageCount={totalPages}
        filters={{ q, status, from, to }}
      />
    </div>
  );
}
