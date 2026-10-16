import { Suspense } from "react";
import Link from "next/link";
import { TZDate } from "@date-fns/tz";
import { addDays, subDays } from "date-fns";
import {
  BarChart2,
  BookOpen,
  BookOpenCheck,
  CalendarCheck,
  Clock,
  DollarSign,
  ScrollText,
  Settings,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { BookingStatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/lib/admin/session";
import { getDashboardStats, type DashboardStats } from "@/lib/admin/dashboard";
import { manilaDateToday } from "@/lib/admin/calendar";
import { formatPesosFromCents, revenueByDay, revenueByMonth } from "@/lib/admin/bookings";
import { manilaDateStr } from "@/lib/booking/slots";
import RevenueChartLoader from "@/components/admin/revenue-chart-loader";

export const dynamic = "force-dynamic";

// DB not configured or query failure → empty fallback keeps the skeleton UI rendering
function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return fn().catch(() => fallback);
  } catch {
    return Promise.resolve(fallback);
  }
}

type DayArr = Awaited<ReturnType<typeof revenueByDay>>["days"];
type MonthArr = Awaited<ReturnType<typeof revenueByMonth>>["months"];

export default async function AdminPage() {
  const session = await requireAdmin();

  const todayStart = new TZDate(`${manilaDateToday()}T00:00:00`, "Asia/Manila") as unknown as Date;

  // Queries start here, but nothing awaits them yet: the shell below paints
  // immediately and each section streams in behind its own Suspense boundary.
  const statsPromise = safe(() => getDashboardStats(getDb()), null);
  const chartDaysPromise = safe(
    // Mini revenue chart data — last 30 days daily
    async () =>
      (await revenueByDay(getDb(), { from: subDays(todayStart, 29), to: addDays(todayStart, 1) })).days,
    [] as DayArr,
  );
  // all-time monthly
  const chartMonthsPromise = safe(async () => (await revenueByMonth(getDb())).months, [] as MonthArr);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {`Good ${getGreeting()}, ${session.name?.split(" ")[0] ?? "Admin"}`}
        </h1>
        <p className="text-muted-foreground">
          Here&apos;s what&apos;s happening at CK Grounds today.
        </p>
      </div>

      {/* Stat cards */}
      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[132px] rounded-xl" />
            ))}
          </div>
        }
      >
        <StatCards stats={statsPromise} days={chartDaysPromise} />
      </Suspense>

      {/* Mini revenue chart */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Revenue</CardTitle>
          <CardAction>
            <Link href="/admin/revenue" className="text-sm text-muted-foreground hover:text-foreground">
              Full report
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-52" />}>
            <MiniRevenueChart days={chartDaysPromise} months={chartMonthsPromise} />
          </Suspense>
        </CardContent>
      </Card>

      {/* Recent bookings */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Recent bookings</CardTitle>
          <CardAction>
            <Link href="/admin/bookings" className="text-sm text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          <Suspense fallback={<Skeleton className="mx-4 h-32" />}>
            <RecentBookings stats={statsPromise} />
          </Suspense>
        </CardContent>
      </Card>

      {/* Quick links */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Quick access</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink href="/admin/bookings" icon={BookOpen} label="Manage Bookings" desc="Review, approve, or reject" />
          <QuickLink href="/admin/revenue" icon={BarChart2} label="Revenue" desc="Daily breakdown & chart" />
          <QuickLink href="/admin/audit" icon={ScrollText} label="Audit Log" desc="Full action history" />
          <QuickLink href="/admin/courts" icon={Settings} label="Courts" desc="Activate or deactivate courts" />
          <QuickLink href="/admin/pricing" icon={DollarSign} label="Pricing" desc="Update rates" />
          <QuickLink href="/admin/hours" icon={Clock} label="Hours & Closures" desc="Operating hours and closures" />
        </div>
      </section>
    </div>
  );
}

// ─── streamed sections ───────────────────────────────────────────────────────

async function StatCards({
  stats: statsPromise,
  days: daysPromise,
}: {
  stats: Promise<DashboardStats | null>;
  days: Promise<DayArr>;
}) {
  const [stats, days] = await Promise.all([statsPromise, daysPromise]);

  // chartDays is [today-29 … today]; split it in half so each badge compares
  // the trailing 15 days with the 15 before them (like-for-like periods).
  const cutoff = manilaDateStr(subDays(new TZDate(Date.now(), "Asia/Manila"), 14));
  const recent = days.filter((d) => d.date >= cutoff);
  const prior = days.filter((d) => d.date < cutoff);
  const total = (rows: DayArr, key: "revenueCents" | "bookings") =>
    rows.reduce((sum, d) => sum + d[key], 0);

  const revenueCents = total(recent, "revenueCents");
  const bookings = total(recent, "bookings");

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Total Revenue"
        value={stats ? formatPesosFromCents(revenueCents) : "—"}
        icon={DollarSign}
        href="/admin/revenue"
        trend={pctChange(revenueCents, total(prior, "revenueCents"))}
        trendLabel="vs prior 15 days"
        subtitle="Last 15 days"
      />
      <StatCard
        label="Total Bookings"
        value={stats ? bookings.toLocaleString() : "—"}
        icon={BookOpenCheck}
        href="/admin/bookings"
        trend={pctChange(bookings, total(prior, "bookings"))}
        trendLabel="vs prior 15 days"
        subtitle="Last 15 days"
      />
      <StatCard
        label="Pending review"
        value={stats ? String(stats.pending) : "—"}
        icon={Clock}
        href="/admin/bookings?status=Pending"
        subtitle="Awaiting decision"
      />
      <StatCard
        label="Approved today"
        value={stats ? String(stats.approvedToday) : "—"}
        icon={CalendarCheck}
        href="/admin/bookings?status=Approved"
        subtitle="Approved today"
      />
    </div>
  );
}

async function MiniRevenueChart({
  days: daysPromise,
  months: monthsPromise,
}: {
  days: Promise<DayArr>;
  months: Promise<MonthArr>;
}) {
  const [days, months] = await Promise.all([daysPromise, monthsPromise]);
  return <RevenueChartLoader days={days} months={months} mode="mini" />;
}

async function RecentBookings({ stats: statsPromise }: { stats: Promise<DashboardStats | null> }) {
  const stats = await statsPromise;

  if (!stats || stats.recentBookings.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {stats ? "No bookings yet." : "Database not configured."}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50 hover:bg-muted/50">
          <TableHead className="px-4">Name</TableHead>
          <TableHead className="px-4">Courts</TableHead>
          <TableHead className="px-4">Date</TableHead>
          <TableHead className="px-4">Total</TableHead>
          <TableHead className="px-4">Status</TableHead>
          <TableHead className="px-4"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stats.recentBookings.map((b) => (
          <TableRow key={b.id}>
            <TableCell className="px-4 font-medium">{b.fullName}</TableCell>
            <TableCell className="px-4 text-muted-foreground">{b.courts || "—"}</TableCell>
            <TableCell className="px-4 text-muted-foreground">{b.date}</TableCell>
            <TableCell className="px-4 font-medium">
              ₱{Number(b.total).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </TableCell>
            <TableCell className="px-4">
              <BookingStatusBadge status={b.status} />
            </TableCell>
            <TableCell className="px-4">
              <Link
                href="/admin/bookings"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                View all
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new TZDate(Date.now(), "Asia/Manila").getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  trend?: number | null;
  trendLabel?: string;
  subtitle: string;
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
  trend,
  trendLabel,
  subtitle,
}: StatCardProps) {
  const up = trend != null && trend >= 0;
  return (
    <Link
      href={href}
      className="rounded-xl outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="@container/card h-full">
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </span>
            {label}
          </CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {value}
          </CardTitle>
          {trend != null ? (
            <CardAction>
              <Badge variant="outline">
                {up ? <TrendingUp /> : <TrendingDown />}
                {`${up ? "+" : ""}${trend.toFixed(1)}%`}
              </Badge>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {trend != null && trendLabel ? (
            <div className="line-clamp-1 flex gap-2 font-medium">
              {trendLabel}
              {up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
            </div>
          ) : null}
          <div className="text-muted-foreground">{subtitle}</div>
        </CardFooter>
      </Card>
    </Link>
  );
}

/** % change vs a prior period, or null when there is no baseline to compare. */
function pctChange(current: number, prior: number): number | null {
  return prior > 0 ? ((current - prior) / prior) * 100 : null;
}

interface QuickLinkProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
}

function QuickLink({ href, icon: Icon, label, desc }: QuickLinkProps) {
  return (
    <Link
      href={href}
      className="rounded-xl outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card size="sm" className="h-full">
        <CardContent className="flex items-center gap-3">
          <Icon className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate font-medium">{label}</p>
            <p className="truncate text-xs text-muted-foreground">{desc}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
