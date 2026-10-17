import { Suspense } from "react";
import Link from "next/link";
import { TZDate } from "@date-fns/tz";
import { addDays, subDays } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import RevenueChartLoader from "@/components/admin/revenue-chart-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDb } from "@/db/client";
import { MANILA_TZ } from "@/lib/booking/constants";
import { manilaWallClock } from "@/lib/booking/slots";
import {
  formatPesosFromCents,
  revenueByDay,
  revenueByMonth,
} from "@/lib/admin/bookings";

export const dynamic = "force-dynamic";

type DayReport = Awaited<ReturnType<typeof revenueByDay>>;
type MonthReport = Awaited<ReturnType<typeof revenueByMonth>>;

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function manilaToday(): string {
  const z = new TZDate(Date.now(), MANILA_TZ);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

function manilaDayStart(dateStr: string): Date {
  return manilaWallClock(dateStr);
}

// Quick-range presets (relative to today)
const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
] as const;

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
  const to = toStr
    ? addDays(manilaDayStart(toStr), 1)
    : addDays(defaultFrom, 1);

  // Determine which preset is active (for chip highlight)
  const activePreset = PRESETS.find(({ days }) => {
    const expectedFrom = subDays(defaultFrom, days - 1);
    return (
      !fromStr &&
      !toStr &&
      from.getTime() === expectedFrom.getTime()
    );
  });
  // The default (no params) matches "Last 30 days"
  const noParams = !fromStr && !toStr;

  let db;
  try {
    db = getDb();
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Revenue</h1>
        <p className="text-sm text-muted-foreground">Database is not configured.</p>
      </div>
    );
  }

  // Both queries start here and are awaited by the streamed sections below, so
  // the header + filter toolbar paint without waiting on Supabase.
  const daysPromise = revenueByDay(db, { from, to });
  const monthsPromise = revenueByMonth(db);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Revenue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Approved bookings only — counted on earliest slot date (Manila time).
        </p>
      </header>

      <Suspense
        fallback={
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[86px]" />
              ))}
            </div>
            <Skeleton className="h-56" />
          </div>
        }
      >
        <RevenueSummary days={daysPromise} months={monthsPromise} />
      </Suspense>

      {/* ── Date filter toolbar ───────────────────────────────────────── */}
      <Card className="py-0">
        <CardContent className="py-3">
        {/* Row 1: quick-range chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <CalendarDays className="size-3.5" />
            Range
          </span>

          {/* "Last N days" preset chips */}
          {PRESETS.map(({ label, days: d }) => {
            const presetFrom = format(subDays(defaultFrom, d - 1));
            const presetTo = format(defaultFrom);
            const isActive =
              fromStr === presetFrom && toStr === presetTo;
            return (
              <Link
                key={label}
                href={`/admin/revenue?from=${presetFrom}&to=${presetTo}`}
                className={chipClass(isActive)}
              >
                {label}
              </Link>
            );
          })}

          {/* All time chip */}
          <Link
            href="/admin/revenue"
            className={chipClass(noParams)}
          >
            Default (30 d)
          </Link>

          {(fromStr || toStr) && (
            <Link
              href="/admin/revenue"
              className="ml-auto flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" /> Clear
            </Link>
          )}
        </div>

        {/* Row 2: custom date range form */}
        <form
          method="get"
          action="/admin/revenue"
          className="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3"
        >
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider self-end pb-2">
            Custom
          </span>
          <div className="space-y-0.5">
            <Label htmlFor="from" className="text-[11px] font-semibold text-muted-foreground">
              From
            </Label>
            <Input
              id="from"
              name="from"
              type="date"
              defaultValue={fromStr}
              className="w-36"
            />
          </div>
          <div className="space-y-0.5">
            <Label htmlFor="to" className="text-[11px] font-semibold text-muted-foreground">
              To
            </Label>
            <Input
              id="to"
              name="to"
              type="date"
              defaultValue={toStr}
              className="w-36"
            />
          </div>
          <Button type="submit">Apply</Button>
        </form>
        </CardContent>
      </Card>

      <Suspense fallback={<Skeleton className="h-64" />}>
        <RevenueTables days={daysPromise} months={monthsPromise} />
      </Suspense>
    </div>
  );
}

// ─── streamed sections ───────────────────────────────────────────────────────

async function RevenueSummary({
  days: daysPromise,
  months: monthsPromise,
}: {
  days: Promise<DayReport>;
  months: Promise<MonthReport>;
}) {
  const [{ days, totalBookings, totalCents }, { months }] = await Promise.all([
    daysPromise,
    monthsPromise,
  ]);

  const activeDayCount = days.filter((d) => d.revenueCents > 0).length;
  const avgPerDay =
    days.length > 0 ? Math.round(totalCents / activeDayCount) : 0;
  const peakDay = days.reduce(
    (best, d) => (d.revenueCents > (best?.revenueCents ?? 0) ? d : best),
    null as (typeof days)[0] | null,
  );

  return (
    <>
      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total (filtered)"
          value={formatPesosFromCents(totalCents)}
          sub={`${totalBookings} booking${totalBookings !== 1 ? "s" : ""}`}
        />
        <KpiCard
          label="Avg per active day"
          value={avgPerDay > 0 ? formatPesosFromCents(avgPerDay) : "—"}
          sub={activeDayCount + " days with revenue"}
        />
        <KpiCard
          label="Peak day"
          value={peakDay ? formatPesosFromCents(peakDay.revenueCents) : "—"}
          sub={peakDay?.date ?? "—"}
        />
        <KpiCard
          label="All-time months"
          value={String(months.length)}
          sub={
            months.length > 0
              ? `${months[months.length - 1]!.month} → ${months[0]!.month}`
              : "No data yet"
          }
        />
      </div>

      {/* ── Chart ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
          <CardDescription>
            Approved bookings over the selected range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RevenueChartLoader days={days} months={months} mode="full" />
        </CardContent>
      </Card>
    </>
  );
}

async function RevenueTables({
  days: daysPromise,
  months: monthsPromise,
}: {
  days: Promise<DayReport>;
  months: Promise<MonthReport>;
}) {
  const [{ days, totalCents }, { months }] = await Promise.all([
    daysPromise,
    monthsPromise,
  ]);

  return (
    <>
      {/* ── Daily breakdown table ─────────────────────────────────────── */}
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm">Daily breakdown</CardTitle>
          <CardDescription>
            {days.length} day{days.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        {days.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">
                    Date (Manila)
                  </TableHead>
                  <TableHead className="px-4">
                    Bookings
                  </TableHead>
                  <TableHead className="px-4">
                    Revenue
                  </TableHead>
                  <TableHead className="px-4">
                    % of total
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...days]
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .map((d) => (
                    <TableRow
                      key={d.date}
                      className="transition-colors"
                    >
                      <TableCell className="px-4 py-3 font-medium text-foreground">
                        {d.date}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {d.bookings}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm font-semibold">
                        {formatPesosFromCents(d.revenueCents)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {totalCents > 0
                          ? `${((d.revenueCents / totalCents) * 100).toFixed(1)}%`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No approved bookings in this date range.
          </div>
        )}
      </Card>

      {/* ── Monthly breakdown table ───────────────────────────────────── */}
      {months.length > 0 && (
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b">
            <CardTitle className="text-sm">All-time monthly breakdown</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">
                    Month
                  </TableHead>
                  <TableHead className="px-4">
                    Bookings
                  </TableHead>
                  <TableHead className="px-4">
                    Revenue
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => (
                  <TableRow
                    key={m.month}
                    className="transition-colors"
                  >
                    <TableCell className="px-4 py-3 font-medium text-foreground">
                      {new Date(m.month + "-15").toLocaleString("en-PH", {
                        month: "long",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {m.bookings}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-semibold">
                      {formatPesosFromCents(m.revenueCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function format(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function chipClass(active: boolean): string {
  return [
    "inline-flex h-7 items-center rounded-full border px-3 text-xs font-semibold transition-colors",
    active
      ? "bg-primary border-primary text-primary-foreground"
      : "bg-background border-border text-muted-foreground hover:bg-muted",
  ].join(" ");
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="text-xs font-medium uppercase tracking-wider">
          {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
