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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
import { getCalendarBookings, manilaDateToday, manilaYearMonth } from "@/lib/admin/calendar";
import { formatPesosFromCents, revenueByDay, revenueByMonth } from "@/lib/admin/bookings";
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
              <Skeleton key={i} className="h-[74px] rounded-xl" />
            ))}
          </div>
        }
      >
        <StatCards stats={statsPromise} />
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

      {/* Mini calendar */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle>This month</CardTitle>
          <CardAction>
            <Link href="/admin/calendar" className="text-sm text-muted-foreground hover:text-foreground">
              Full calendar
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-80" />}>
            <MiniCalendar
              events={calendarPromise}
              year={calYear}
              month={calMonth}
              today={today}
            />
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

async function StatCards({ stats: statsPromise }: { stats: Promise<DashboardStats | null> }) {
  const stats = await statsPromise;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Pending review"
        value={stats ? String(stats.pending) : "—"}
        icon={Clock}
        href="/admin/bookings?status=Pending"
      />
      <StatCard
        label="Approved today"
        value={stats ? String(stats.approvedToday) : "—"}
        icon={CalendarCheck}
        href="/admin/bookings?status=Approved"
      />
      <StatCard
        label="Revenue today"
        value={stats ? formatPesosFromCents(stats.revenueToday) : "—"}
        icon={DollarSign}
        href="/admin/revenue"
      />
      <StatCard
        label="All-time approved"
        value={stats ? stats.totalApproved.toLocaleString() : "—"}
        icon={BarChart2}
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
              <Badge variant={statusVariant(b.status)}>{b.status}</Badge>
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
  href: string;
}

function StatCard({ label, value, icon: Icon, href }: StatCardProps) {
  return (
    <Link
      href={href}
      className="rounded-xl outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card size="sm" className="h-full">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
          <CardAction>
            <Icon className="size-4 text-muted-foreground" />
          </CardAction>
        </CardHeader>
      </Card>
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
