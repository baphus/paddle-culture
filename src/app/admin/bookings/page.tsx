import { getDb } from "@/db/client";
import { listBookings } from "@/lib/admin/bookings";
import { requireAdmin } from "@/lib/admin/session";
import PageHeader from "@/components/admin/page-header";
import BookingsTable from "./bookings-table";

export const dynamic = "force-dynamic";

// Full client-side table: load the whole list in one pass. listBookings pages
// internally at 500 rows/request, so 500 is the largest single-page fetch.
const FETCH_LIMIT = 500;

export default async function BookingsPage() {
  await requireAdmin();

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

  let rows: Awaited<ReturnType<typeof listBookings>>["rows"];
  try {
    ({ rows } = await listBookings(db, {
      q: "",
      status: "all",
      from: "",
      to: "",
      page: 1,
      limit: FETCH_LIMIT,
    }));
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

  return (
    <div className="space-y-5">
      <PageHeader title="Bookings" />
      <BookingsTable rows={rows} />
    </div>
  );
}
