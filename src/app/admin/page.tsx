import { Suspense } from "react";
import Link from "next/link";
import { TZDate } from "@date-fns/tz";
import { addDays, subDays } from "date-fns";
import {
  BarChart2,
  BookOpen,
  BookOpenCheck,
  CalendarCheck,
  CalendarX2,
  Clock,
  DollarSign,
  ScrollText,
  Settings,
} from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatCard } from "@/components/admin/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/lib/admin/session";
import { getDashboardStats, type DashboardStats } from "@/lib/admin/dashboard";
import { manilaDateToday } from "@/lib/admin/calendar";
import { formatPesosFromCents, revenueByDay, revenueByMonth } from "@/lib/admin/bookings";
import { manilaDateStr, manilaWallClock } from "@/lib/booking/slots";
import RevenueChartLoader from "@/components/admin/revenue-chart-loader";
import RecentBookingsCard from "./recent-bookings-card";
import RecentBookingsTable from "./recent-bookings-table";

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

  const todayStart = manilaWallClock(manilaDateToday()) as unknown as Date;

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
      <RecentBookingsCard>
        <Suspense fallback={<Skeleton className="h-32" />}>
          <RecentBookingsSection stats={statsPromise} />
        </Suspense>
      </RecentBookingsCard>

      {/* Quick links */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Quick access</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink href="/admin/bookings" icon={BookOpen} label="Manage Bookings" desc="Review, approve, or reject" />
          <QuickLink href="/admin/revenue" icon={BarChart2} label="Revenue" desc="Daily breakdown & chart" />
          <QuickLink href="/admin/activity" icon={ScrollText} label="Activity" desc="Full action history" />
          <QuickLink href="/admin/courts" icon={Settings} label="Courts & Pricing" desc="Courts, status, and rates" />
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
        label="Today's bookings"
        value={stats ? String(stats.todayTotal) : "—"}
        icon={CalendarCheck}
        href="/admin/bookings"
        subtitle="Any status today"
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

async function RecentBookingsSection({ stats: statsPromise }: { stats: Promise<DashboardStats | null> }) {
  const stats = await statsPromise;

  if (!stats || stats.recentBookings.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <CalendarX2 className="size-6 opacity-50" />
        <span>{stats ? "No bookings yet." : "Database not configured."}</span>
      </div>
    );
  }

  return <RecentBookingsTable rows={stats.recentBookings} />;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new TZDate(Date.now(), "Asia/Manila").getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
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
