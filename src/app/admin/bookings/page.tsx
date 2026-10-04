import Link from "next/link";
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
import BookingActions from "./booking-actions";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Approved") return "default";
  if (status === "Rejected") return "destructive";
  if (status === "Pending") return "secondary";
  return "outline";
}

function pageHref(
  base: Record<string, string>,
  page: number,
): string {
  const sp = new URLSearchParams({ ...base, page: String(page) });
  return `/admin/bookings?${sp.toString()}`;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = first(sp.q).slice(0, 100);
  const rawStatus = first(sp.status);
  const status = (BOOKING_STATUSES as readonly string[]).includes(rawStatus)
    ? rawStatus
    : "all";
  const from = first(sp.from).slice(0, 10);
  const to = first(sp.to).slice(0, 10);
  const page = Math.max(1, Number.parseInt(first(sp.page), 10) || 1);

  let db;
  try {
    db = getDb();
  } catch {
    return (
      <main>
        <h1>Bookings</h1>
        <p>Database is not configured.</p>
      </main>
    );
  }
  const { rows, page: safePage, totalPages, total } = await listBookings(db, {
    q,
    status,
    from,
    to,
    page,
  });
  const base = { q, status, from, to };

  return (
    <main>
      <h1>Bookings</h1>
      <p>
        <Link href="/admin">← Admin home</Link>
      </p>
      <form method="get" action="/admin/bookings">
        <div>
          <Label htmlFor="q">Search name</Label>
          <Input id="q" name="q" defaultValue={q} placeholder="Customer name" />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" defaultValue={status}>
            <option value="all">All</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="from">From (slot date)</Label>
          <Input id="from" name="from" type="date" defaultValue={from} />
        </div>
        <div>
          <Label htmlFor="to">To (slot date)</Label>
          <Input id="to" name="to" type="date" defaultValue={to} />
        </div>
        <Button type="submit">Filter</Button>
      </form>
      <p>
        {total} booking(s){totalPages > 1 ? ` — page ${safePage} of ${totalPages}` : null}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Court(s)</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Time slots</TableHead>
            <TableHead>Paddles</TableHead>
            <TableHead>Ball</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => (
            <TableRow key={b.id}>
              <TableCell>{b.fullName}</TableCell>
              <TableCell>{b.email}</TableCell>
              <TableCell>{b.courts || "—"}</TableCell>
              <TableCell>{b.date}</TableCell>
              <TableCell>{b.slotLabels.join(", ") || "—"}</TableCell>
              <TableCell>
                {b.paddleQty > 0
                  ? `${b.paddleQty}${b.paddleHours ? ` × ${b.paddleHours}h` : ""}`
                  : "—"}
              </TableCell>
              <TableCell>{b.hasBall ? "Yes" : "—"}</TableCell>
              <TableCell>₱{b.total}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
              </TableCell>
              <TableCell>
                <BookingActions booking={b} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {totalPages > 1 ? (
        <div>
          {safePage > 1 ? (
            <Link href={pageHref(base, safePage - 1)}>← Prev</Link>
          ) : null}{" "}
          {safePage < totalPages ? (
            <Link href={pageHref(base, safePage + 1)}>Next →</Link>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
