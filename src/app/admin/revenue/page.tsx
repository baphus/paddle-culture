import { Suspense } from "react";
import Link from "next/link";
import { TZDate } from "@date-fns/tz";
import { addDays, subDays } from "date-fns";
import {
  CalendarDays,
  CalendarRange,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import RevenueChartLoader from "@/components/admin/revenue-chart-loader";
import {
  StatCard,
  STAT_CARD_GRID,
  STAT_CARD_MIN_HEIGHT,
} from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
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
import { RevenueExportDropdown } from "./revenue-export";
import { RevenueRangeFilter } from "./revenue-range-filter";

export const dynamic = "force-dynamic";

const PAGE_DESCRIPTION =
  "Track earnings and booking volume for the selected period.";

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

const DEFAULT_DAYS = 30;
const PRESETS = [7, 30, 90] as const;

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
  const noParams = !fromStr && !toStr;

  // Preset buttons are server-rendered links; the active one is a disabled
  // button so it can't navigate to the range it already represents.
  const presets = PRESETS.map((d) => {
    const presetFrom = format(subDays(defaultFrom, d - 1));
    const presetTo = format(defaultFrom);
    return {
      days: d,
      href: `/admin/revenue?from=${presetFrom}&to=${presetTo}`,
      active: noParams
        ? d === DEFAULT_DAYS
        : fromStr === presetFrom && toStr === presetTo,
    };
  });

  let db;
  try {
    db = getDb();
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Revenue</h1>
        <p className="mt-1 text-sm text-muted-foreground">{PAGE_DESCRIPTION}</p>
        <p className="text-sm text-muted-foreground">Database is not configured.</p>
      </div>
    );
  }

  // Both queries start here and are awaited by the streamed sections below, so
  // the header + filters paint without waiting on Supabase.
  const daysPromise = revenueByDay(db, { from, to });
  const monthsPromise = revenueByMonth(db);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Revenue</h1>
          <p className="mt-1 text-sm text-muted-foreground">{PAGE_DESCRIPTION}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            {presets.map(({ days: d, href, active }) =>
              active ? (
                <Button key={d} size="sm" disabled>
                  <CalendarDays className="size-3.5" />
                  {`Last ${d} days`}
                </Button>
              ) : (
                <Button
                  key={d}
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={href} />}
                >
                  <CalendarDays className="size-3.5" />
                  {`Last ${d} days`}
                </Button>
              ),
            )}
          </div>

          <RevenueRangeFilter from={fromStr} to={toStr} />

          <Suspense
            fallback={<Skeleton className="h-7 w-24 rounded-[12px]" />}
          >
            <Export
              days={daysPromise}
              months={monthsPromise}
              range={`${format(from)}_${format(subDays(to, 1))}`}
            />
          </Suspense>
        </div>
      </header>

      <Suspense
        fallback={
          <div className="space-y-5">
            <div className={STAT_CARD_GRID}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className={`${STAT_CARD_MIN_HEIGHT} rounded-xl`} />
              ))}
            </div>
            <Skeleton className="h-56" />
          </div>
        }
      >
        <RevenueSummary days={daysPromise} months={monthsPromise} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-64" />}>
        <RevenueTables days={daysPromise} months={monthsPromise} />
      </Suspense>
    </div>
  );
}

// ─── streamed sections ───────────────────────────────────────────────────────

async function Export({
  days: daysPromise,
  months: monthsPromise,
  range,
}: {
  days: Promise<DayReport>;
  months: Promise<MonthReport>;
  range: string;
}) {
  const [{ days }, { months }] = await Promise.all([daysPromise, monthsPromise]);
  return (
    <RevenueExportDropdown days={days} months={months} range={range} />
  );
}

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
      <div className={STAT_CARD_GRID}>
        <StatCard
          label="Total (filtered)"
          value={formatPesosFromCents(totalCents)}
          icon={DollarSign}
          subtitle={`${totalBookings} booking${totalBookings !== 1 ? "s" : ""}`}
        />
        <StatCard
          label="Avg per active day"
          value={avgPerDay > 0 ? formatPesosFromCents(avgPerDay) : "—"}
          icon={TrendingUp}
          subtitle={`${activeDayCount} days with revenue`}
        />
        <StatCard
          label="Peak day"
          value={peakDay ? formatPesosFromCents(peakDay.revenueCents) : "—"}
          icon={CalendarDays}
          subtitle={peakDay?.date ?? "—"}
        />
        <StatCard
          label="All-time months"
          value={String(months.length)}
          icon={CalendarRange}
          subtitle={
            months.length > 0
              ? `${months[months.length - 1]!.month} → ${months[0]!.month}`
              : "No data yet"
          }
        />
      </div>

      {/* ── Chart ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Revenue</CardTitle>
          <CardDescription>
            Approved bookings over the selected range.
          </CardDescription>
        </CardHeader>
        <div className="px-(--card-spacing)">
          <RevenueChartLoader days={days} months={months} mode="full" />
        </div>
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
        <CardHeader className="border-b pt-4">
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
          <CardHeader className="border-b pt-6">
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
