import Link from "next/link";
import { CalendarDays, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/admin/admin-toolbar";
import BookingActions from "./booking-actions";

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

function statusAccent(s: string): "flame" | "pine" | "error" | "muted" {
  if (s === "Approved") return "pine";
  if (s === "Rejected") return "error";
  if (s === "Pending") return "flame";
  return "muted";
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
        <p className="text-sm text-warm-muted">Database is not configured.</p>
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
        <p className="text-sm text-warm-muted">
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

  const hasDateFilter = !!(from || to);
  const hasAnyFilter = !!(q || status !== "all" || hasDateFilter);

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
              accent={statusAccent(s)}
            />
          ))}
        </AdminToolbarFilters>
      </AdminToolbar>

      {/* ── Toolbar row 2: date range (collapsible inline) ────────────── */}
      <DateRangeBar from={from} to={to} q={q} status={status} />

      {/* ── Active filter summary ─────────────────────────────────────── */}
      {hasAnyFilter && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-ink/40 uppercase tracking-wider">
            Filtered:
          </span>
          {status !== "all" && (
            <FilterPill
              label={`Status: ${status}`}
              href={buildHref({ q, from, to })}
            />
          )}
          {q && (
            <FilterPill
              label={`"${q}"`}
              href={buildHref({ status: status !== "all" ? status : "", from, to })}
            />
          )}
          {from && (
            <FilterPill
              label={`From ${from}`}
              href={buildHref({ q, status: status !== "all" ? status : "", to })}
            />
          )}
          {to && (
            <FilterPill
              label={`To ${to}`}
              href={buildHref({ q, status: status !== "all" ? status : "", from })}
            />
          )}
          <Link
            href="/admin/bookings"
            className="ml-1 text-xs font-semibold text-flame hover:underline"
          >
            Clear all
          </Link>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        {/* Table header bar */}
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <p className="text-xs font-semibold text-ink/50">
            {total > 0
              ? `${total} booking${total === 1 ? "" : "s"}`
              : "No bookings found"}
          </p>
          {total > 0 && (
            <p className="text-xs text-warm-muted">
              Page {safePage} of {totalPages}
            </p>
          )}
        </div>

        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-oat/40 hover:bg-oat/40 border-b border-line">
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Name
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Contact
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Courts
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Date
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Slots
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Total
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Status
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((b) => (
                  <TableRow
                    key={b.id}
                    className="border-b border-line/60 transition-colors hover:bg-oat/20"
                  >
                    <TableCell className="px-4 py-3 font-medium text-ink">
                      {b.fullName}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="text-xs text-ink/70">{b.email}</div>
                      <div className="text-xs text-warm-muted">{b.phone}</div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-ink/70">
                      {b.courts || "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-ink/70">
                      {b.date}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-ink/70">
                      {b.slotLabels.join(", ") || "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-semibold text-ink">
                      ₱
                      {Number(b.total).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge
                        variant={statusVariant(b.status)}
                        className="text-[11px]"
                      >
                        {b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <BookingActions booking={b} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-warm-muted">
            No bookings match your filters.
          </div>
        )}
      </div>

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

// ─── DateRangeBar ─────────────────────────────────────────────────────────────
// A self-contained form row for the date range filter, styled as a secondary toolbar.

function DateRangeBar({
  from,
  to,
  q,
  status,
}: {
  from: string;
  to: string;
  q: string;
  status: string;
}) {
  const hasDate = !!(from || to);
  return (
    <form
      method="get"
      action="/admin/bookings"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white px-4 py-3"
    >
      {/* Preserve sibling filters */}
      {q && <input type="hidden" name="q" value={q} />}
      {status !== "all" && <input type="hidden" name="status" value={status} />}

      <div className="flex items-center gap-1.5 text-xs font-semibold text-ink/50">
        <CalendarDays className="size-3.5" />
        Date range
      </div>

      <div className="flex flex-1 flex-wrap items-end gap-3">
        <div className="space-y-0.5">
          <Label
            htmlFor="from"
            className="text-[11px] font-semibold text-ink/50"
          >
            From
          </Label>
          <Input
            id="from"
            name="from"
            type="date"
            defaultValue={from}
            className="h-8 rounded-lg border-line text-sm w-36"
          />
        </div>
        <div className="space-y-0.5">
          <Label
            htmlFor="to"
            className="text-[11px] font-semibold text-ink/50"
          >
            To
          </Label>
          <Input
            id="to"
            name="to"
            type="date"
            defaultValue={to}
            className="h-8 rounded-lg border-line text-sm w-36"
          />
        </div>
        <div className="flex items-end gap-2 pb-0">
          <Button
            type="submit"
            className="h-8 rounded-lg bg-flame px-4 text-xs font-bold text-white hover:bg-flame-hover"
          >
            Apply
          </Button>
          {hasDate && (
            <Link
              href={buildHref({ q, status: status !== "all" ? status : "" })}
              className="flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-semibold text-warm-muted hover:bg-oat hover:text-ink"
            >
              <X className="size-3" /> Clear dates
            </Link>
          )}
        </div>
      </div>
    </form>
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

function FilterPill({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-oat px-2.5 py-0.5 text-xs font-semibold text-ink hover:bg-oat/80"
    >
      {label}
      <X className="size-3 text-warm-muted" />
    </Link>
  );
}
