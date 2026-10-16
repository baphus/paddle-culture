import { Suspense } from "react";
import Link from "next/link";
import { TZDate } from "@date-fns/tz";
import { addDays, subDays } from "date-fns";
import {
  BarChart2,
  BookOpen,
  CalendarCheck,
  Clock,
  DollarSign,
  ScrollText,
  Settings,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { getCalendarBookings, manilaDateToday, manilaYearMonth } from "@/lib/admin/calendar";
import { formatPesosFromCents, revenueByDay, revenueByMonth } from "@/lib/admin/bookings";
import PageHeader from "@/components/admin/page-header";
import CalendarView from "@/components/admin/calendar-view";
import RevenueChartLoader from "@/components/admin/revenue-chart-loader";

export const dynamic = "force-dynamic";

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Approved") return "default";
  if (status === "Rejected") return "destructive";
  if (status === "Pending") return "secondary";
  return "outline";
}

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
type CalEvents = Awaited<ReturnType<typeof getCalendarBookings>>;

export default async function AdminPage() {
  const session = await requireAdmin();

  const { year: calYear, month: calMonth } = manilaYearMonth();
  const today = manilaDateToday();
  const todayStart = new TZDate(`${manilaDateToday()}T00:00:00`, "Asia/Manila") as unknown as Date;

  // Queries start here, but nothing awaits them yet: the shell below paints
  // immediately and each section streams in behind its own Suspense boundary.
  const statsPromise = safe(() => getDashboardStats(getDb()), null);
  const calendarPromise = safe(
    () => getCalendarBookings(getDb(), calYear, calMonth),
    [] as CalEvents,
  );
  const chartDaysPromise = safe(
    // Mini revenue chart data — last 30 days daily
    async () =>
      (await revenueByDay(getDb(), { from: subDays(todayStart, 29), to: addDays(todayStart, 1) })).days,
    [] as DayArr,
  );
  // all-time monthly
  const chartMonthsPromise = safe(async () => (await revenueByMonth(getDb())).months, [] as MonthArr);

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Good ${getGreeting()}, ${session.name?.split(" ")[0] ?? "Admin"}`}
        description="Here's what's happening at CK Grounds today."
      />

      {/* Stat cards */}
      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[74px] rounded-xl bg-oat/60" />
            ))}
          </div>
        }
      >
        <StatCards stats={statsPromise} />
      </Suspense>

      {/* Mini revenue chart */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">Revenue</h2>
          <Link
            href="/admin/revenue"
            className="text-xs font-semibold text-flame hover:underline"
          >
            Full report →
          </Link>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <Suspense fallback={<Skeleton className="h-52 bg-oat/60" />}>
            <MiniRevenueChart days={chartDaysPromise} months={chartMonthsPromise} />
          </Suspense>
        </div>
      </section>

      {/* Recent bookings */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">Recent bookings</h2>
          <Link
            href="/admin/bookings"
            className="text-xs font-semibold text-flame hover:underline"
          >
            View all →
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <Suspense fallback={<Skeleton className="h-32 bg-oat/60" />}>
            <RecentBookings stats={statsPromise} />
          </Suspense>
        </div>
      </section>

      {/* Mini calendar */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">This month</h2>
          <Link
            href="/admin/calendar"
            className="text-xs font-semibold text-flame hover:underline"
          >
            Full calendar →
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-white px-3 pb-3 pt-2">
          <Suspense fallback={<Skeleton className="h-80 bg-oat/60" />}>
            <MiniCalendar
              events={calendarPromise}
              year={calYear}
              month={calMonth}
              today={today}
            />
          </Suspense>
        </div>
      </section>

      {/* Quick links */}
      <section>
        <h2 className="mb-3 text-sm font-bold text-ink">Quick access</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

async function StatCards({ stats: statsPromise }: { stats: Promise<DashboardStats | null> }) {
  const stats = await statsPromise;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Pending review"
        value={stats ? String(stats.pending) : "—"}
        icon={Clock}
        accent={stats && stats.pending > 0 ? "flame" : "muted"}
        href="/admin/bookings?status=Pending"
      />
      <StatCard
        label="Approved today"
        value={stats ? String(stats.approvedToday) : "—"}
        icon={CalendarCheck}
        accent="pine"
        href="/admin/bookings?status=Approved"
      />
      <StatCard
        label="Revenue today"
        value={stats ? formatPesosFromCents(stats.revenueToday) : "—"}
        icon={DollarSign}
        accent="pine"
        href="/admin/revenue"
      />
      <StatCard
        label="All-time approved"
        value={stats ? stats.totalApproved.toLocaleString() : "—"}
        icon={BarChart2}
        accent="muted"
        href="/admin/revenue"
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
      <div className="flex h-32 items-center justify-center text-sm text-warm-muted">
        {stats ? "No bookings yet." : "Database not configured."}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-oat/40 hover:bg-oat/40 border-b border-line">
            <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">Name</TableHead>
            <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">Courts</TableHead>
            <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">Date</TableHead>
            <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">Total</TableHead>
            <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">Status</TableHead>
            <TableHead className="px-4"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stats.recentBookings.map((b) => (
            <TableRow key={b.id} className="border-b border-line/60 transition-colors hover:bg-oat/20">
              <TableCell className="px-4 py-3 font-medium text-ink">
                {b.fullName}
              </TableCell>
              <TableCell className="px-4 py-3 text-sm text-ink/70">{b.courts || "—"}</TableCell>
              <TableCell className="px-4 py-3 text-sm text-ink/70">{b.date}</TableCell>
              <TableCell className="px-4 py-3 text-sm font-semibold text-ink">
                ₱{Number(b.total).toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </TableCell>
              <TableCell className="px-4 py-3">
                <Badge variant={statusVariant(b.status)} className="text-[11px]">
                  {b.status}
                </Badge>
              </TableCell>
              <TableCell className="px-4 py-3">
                <Link
                  href="/admin/bookings"
                  className="text-xs font-semibold text-flame hover:underline"
                >
                  View all
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

async function MiniCalendar({
  events: eventsPromise,
  year,
  month,
  today,
}: {
  events: Promise<CalEvents>;
  year: number;
  month: number;
  today: string;
}) {
  const events = await eventsPromise;
  return (
    <CalendarView events={events} year={year} month={month} today={today} mode="mini" />
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
  accent: "flame" | "pine" | "muted";
  href: string;
}

function StatCard({ label, value, icon: Icon, accent, href }: StatCardProps) {
  const accentMap = {
    flame: {
      bg: "bg-flame/10",
      icon: "text-flame",
      value: "text-flame",
    },
    pine: {
      bg: "bg-pine/10",
      icon: "text-pine",
      value: "text-pine",
    },
    muted: {
      bg: "bg-oat",
      icon: "text-warm-muted",
      value: "text-ink",
    },
  };
  const colors = accentMap[accent];

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border border-line bg-white p-4 transition-all hover:border-line-warm hover:shadow-[0_4px_16px_rgba(66,48,45,0.08)]"
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${colors.bg}`}>
        <Icon className={`size-5 ${colors.icon}`} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-warm-muted">
          {label}
        </p>
        <p className={`mt-0.5 text-xl font-black tracking-tight ${colors.value}`}>
          {value}
        </p>
      </div>
    </Link>
  );
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
      className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 transition-all hover:border-line-warm hover:shadow-[0_4px_16px_rgba(66,48,45,0.08)]"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-oat">
        <Icon className="size-4 text-ink/60" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-[11px] text-warm-muted">{desc}</p>
      </div>
    </Link>
  );
}
