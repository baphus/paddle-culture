import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/db/client";
import { BOOKING_STATUSES, listBookings } from "@/lib/admin/bookings";
import PageHeader from "@/components/admin/page-header";
import AdminPagination from "@/components/admin/admin-pagination";
import {
  AdminToolbar,
  AdminToolbarSearch,
  AdminToolbarFilters,
  AdminToolbarChip,
  AdminToolbarAllChip,
  AdminActiveFilters,
} from "@/components/admin/admin-toolbar";
import BookingActions from "./booking-actions";
import BookingsFilterDropdown from "./bookings-filter-dropdown";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Approved") return "default";
  if (status === "Rejected") return "destructive";
  if (status === "Pending") return "secondary";
  return "outline";
}

function pageHref(base: Record<string, string>, page: number): string {
  const sp = new URLSearchParams({ ...base, page: String(page) });
  return `/admin/bookings?${sp.toString()}`;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  // "_all" is posted by the All chip — treat it as clearing status
  const q = first(sp.q).slice(0, 100);
  const rawStatus = first(sp.status);
  const status =
    sp._all === "1" || !(BOOKING_STATUSES as readonly string[]).includes(rawStatus)
      ? "all"
      : rawStatus;
  const from = first(sp.from).slice(0, 10);
  const to = first(sp.to).slice(0, 10);
  const page = Math.max(1, Number.parseInt(first(sp.page), 10) || 1);

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

  let listResult: Awaited<ReturnType<typeof listBookings>>;
  try {
    listResult = await listBookings(db, { q, status, from, to, page });
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
  const { rows, page: safePage, totalPages, total } = listResult;

  // Build base params (no page) for pagination links
  const base: Record<string, string> = {};
  if (q) base.q = q;
  if (status !== "all") base.status = status;
  if (from) base.from = from;
  if (to) base.to = to;

  const activeFilters = [
    ...(status !== "all"
      ? [{ label: `Status: ${status}`, clearHref: buildHref({ q, from, to }) }]
      : []),
    ...(q
      ? [{ label: `"${q}"`, clearHref: buildHref({ status: status !== "all" ? status : undefined, from, to }) }]
      : []),
    ...(from
      ? [{ label: `From ${from}`, clearHref: buildHref({ q, status: status !== "all" ? status : undefined, to }) }]
      : []),
    ...(to
      ? [{ label: `To ${to}`, clearHref: buildHref({ q, status: status !== "all" ? status : undefined, from }) }]
      : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Bookings" />

      {/* ── Toolbar row 1: search + status chips ─────────────────────── */}
      <AdminToolbar action="/admin/bookings" hiddenParams={{ from, to }}>
        <AdminToolbarSearch
          name="q"
          defaultValue={q}
          placeholder="Search by name…"
        />

        <AdminToolbarFilters>
          <AdminToolbarAllChip active={status === "all"} />
          {BOOKING_STATUSES.map((s) => (
            <AdminToolbarChip
              key={s}
              name="status"
              value={s}
              active={status === s}
              label={s}
            />
          ))}
          <BookingsFilterDropdown q={q} status={status} from={from} to={to} />
        </AdminToolbarFilters>
      </AdminToolbar>

      {/* ── Active filter summary ─────────────────────────────────────── */}
      <AdminActiveFilters filters={activeFilters} clearAllHref="/admin/bookings" />

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <Card className="gap-0 py-0">
        {/* Table header bar */}
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-xs font-semibold text-muted-foreground">
            {total > 0
              ? `${total} booking${total === 1 ? "" : "s"}`
              : "No bookings found"}
          </p>
          {total > 0 && (
            <p className="text-xs text-muted-foreground">
              Page {safePage} of {totalPages}
            </p>
          )}
        </div>

        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Name</TableHead>
                <TableHead className="px-4">Contact</TableHead>
                <TableHead className="px-4">Courts</TableHead>
                <TableHead className="px-4">Date</TableHead>
                <TableHead className="px-4">Slots</TableHead>
                <TableHead className="px-4">Total</TableHead>
                <TableHead className="px-4">Status</TableHead>
                <TableHead className="px-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="px-4 py-3 font-medium">
                    {b.fullName}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="text-xs text-muted-foreground">{b.email}</div>
                    <div className="text-xs text-muted-foreground">{b.phone}</div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                    {b.courts || "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                    {b.date}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs text-muted-foreground">
                    {b.slotLabels.join(", ") || "—"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm font-semibold">
                    ₱
                    {Number(b.total).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <BookingActions booking={b} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No bookings match your filters.
          </div>
        )}
      </Card>

      {/* ── Pagination ────────────────────────────────────────────────── */}
      <AdminPagination
        page={safePage}
        totalPages={totalPages}
        total={total}
        hrefFor={(p) => pageHref(base, p)}
      />
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const str = sp.toString();
  return `/admin/bookings${str ? `?${str}` : ""}`;
}
