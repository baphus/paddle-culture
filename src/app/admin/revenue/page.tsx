import Link from "next/link";
import { TZDate } from "@date-fns/tz";
import { addDays, subDays } from "date-fns";
import RevenueChartLoader from "@/components/admin/revenue-chart-loader";
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
import { MANILA_TZ } from "@/lib/booking/constants";
import { formatPesosFromCents, revenueByDay } from "@/lib/admin/bookings";

export const dynamic = "force-dynamic";

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function manilaToday(): string {
  const z = new TZDate(Date.now(), MANILA_TZ);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

function manilaDayStart(dateStr: string): Date {
  return new TZDate(`${dateStr}T00:00:00`, MANILA_TZ);
}

// Revenue from Approved bookings only, broken down by service (slot) date.
export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const today = manilaToday();
  const defaultFrom = manilaDayStart(today);
  const fromStr = first(sp.from).slice(0, 10);
  const toStr = first(sp.to).slice(0, 10);
  const from = fromStr ? manilaDayStart(fromStr) : subDays(defaultFrom, 29);
  const to = toStr ? addDays(manilaDayStart(toStr), 1) : addDays(defaultFrom, 1);

  let db;
  try {
    db = getDb();
  } catch {
    return (
      <main>
        <h1>Revenue</h1>
        <p>Database is not configured.</p>
      </main>
    );
  }
  const { days, totalBookings, totalCents } = await revenueByDay(db, { from, to });

  return (
    <main>
      <h1>Revenue (Approved bookings only)</h1>
      <p>
        <Link href="/admin">← Admin home</Link>
      </p>
      <form method="get" action="/admin/revenue">
        <div>
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={fromStr} />
        </div>
        <div>
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={toStr} />
        </div>
        <Button type="submit">Filter</Button>
      </form>
      <p>
        Total: {formatPesosFromCents(totalCents)} across {totalBookings} approved
        booking(s). Each booking counts once, on its earliest slot date.
      </p>
      <RevenueChartLoader days={days} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date (Manila)</TableHead>
            <TableHead>Bookings</TableHead>
            <TableHead>Revenue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map((d) => (
            <TableRow key={d.date}>
              <TableCell>{d.date}</TableCell>
              <TableCell>{d.bookings}</TableCell>
              <TableCell>{formatPesosFromCents(d.revenueCents)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
