import Link from "next/link";
import { TZDate } from "@date-fns/tz";
import { addDays, subDays } from "date-fns";
import { CalendarDays, X } from "lucide-react";
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
import {
  formatPesosFromCents,
  revenueByDay,
  revenueByMonth,
} from "@/lib/admin/bookings";
import PageHeader from "@/components/admin/page-header";

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
        <PageHeader title="Revenue" />
        <p className="text-sm text-warm-muted">Database is not configured.</p>
      </div>
    );
  }

  const [{ days, totalBookings, totalCents }, { months }] = await Promise.all([
    revenueByDay(db, { from, to }),
    revenueByMonth(db),
  ]);

  const avgPerDay =
    days.length > 0
      ? Math.round(totalCents / days.filter((d) => d.revenueCents > 0).length)
      : 0;
  const peakDay = days.reduce(
    (best, d) => (d.revenueCents > (best?.revenueCents ?? 0) ? d : best),
    null as (typeof days)[0] | null,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Revenue"
        description="Approved bookings only — counted on earliest slot date (Manila time)."
      />

      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total (filtered)"
          value={formatPesosFromCents(totalCents)}
          sub={`${totalBookings} booking${totalBookings !== 1 ? "s" : ""}`}
          accent="flame"
        />
        <KpiCard
          label="Avg per active day"
          value={avgPerDay > 0 ? formatPesosFromCents(avgPerDay) : "—"}
          sub={
            days.filter((d) => d.revenueCents > 0).length + " days with revenue"
          }
          accent="pine"
        />
        <KpiCard
          label="Peak day"
          value={peakDay ? formatPesosFromCents(peakDay.revenueCents) : "—"}
          sub={peakDay?.date ?? "—"}
          accent="pine"
        />
        <KpiCard
          label="All-time months"
          value={String(months.length)}
          sub={
            months.length > 0
              ? `${months[months.length - 1]!.month} → ${months[0]!.month}`
              : "No data yet"
          }
          accent="muted"
        />
      </div>

      {/* ── Chart ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-line bg-white p-5">
        <RevenueChartLoader days={days} months={months} mode="full" />
      </div>

      {/* ── Date filter toolbar ───────────────────────────────────────── */}
      <div className="rounded-xl border border-line bg-white px-4 py-3">
        {/* Row 1: quick-range chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold text-ink/50">
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
              className="ml-auto flex items-center gap-1 text-xs font-semibold text-warm-muted hover:text-ink"
            >
              <X className="size-3.5" /> Clear
            </Link>
          )}
        </div>

        {/* Row 2: custom date range form */}
        <form
          method="get"
          action="/admin/revenue"
          className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3"
        >
          <span className="text-[11px] font-semibold text-ink/40 uppercase tracking-wider self-end pb-2">
            Custom
          </span>
          <div className="space-y-0.5">
            <Label htmlFor="from" className="text-[11px] font-semibold text-ink/50">
              From
            </Label>
            <Input
              id="from"
              name="from"
              type="date"
              defaultValue={fromStr}
              className="h-8 w-36 rounded-lg border-line text-sm"
            />
          </div>
          <div className="space-y-0.5">
            <Label htmlFor="to" className="text-[11px] font-semibold text-ink/50">
              To
            </Label>
            <Input
              id="to"
              name="to"
              type="date"
              defaultValue={toStr}
              className="h-8 w-36 rounded-lg border-line text-sm"
            />
          </div>
          <Button
            type="submit"
            className="h-8 rounded-lg bg-flame px-4 text-xs font-bold text-white hover:bg-flame-hover"
          >
            Apply
          </Button>
        </form>
      </div>

      {/* ── Daily breakdown table ─────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-ink/50">
            Daily breakdown
          </p>
          <p className="text-xs text-warm-muted">
            {days.length} day{days.length !== 1 ? "s" : ""}
          </p>
        </div>
        {days.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-oat/40 hover:bg-oat/40 border-b border-line">
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Date (Manila)
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Bookings
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Revenue
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
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
                      className="border-b border-line/60 transition-colors hover:bg-oat/20"
                    >
                      <TableCell className="px-4 py-3 font-medium text-ink">
                        {d.date}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-ink/70">
                        {d.bookings}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm font-semibold text-ink">
                        {formatPesosFromCents(d.revenueCents)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-ink/60">
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
          <div className="flex h-24 items-center justify-center text-sm text-warm-muted">
            No approved bookings in this date range.
          </div>
        )}
      </div>

      {/* ── Monthly breakdown table ───────────────────────────────────── */}
      {months.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-xs font-bold uppercase tracking-wide text-ink/50">
              All-time monthly breakdown
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-oat/40 hover:bg-oat/40 border-b border-line">
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Month
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Bookings
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Revenue
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => (
                  <TableRow
                    key={m.month}
                    className="border-b border-line/60 transition-colors hover:bg-oat/20"
                  >
                    <TableCell className="px-4 py-3 font-medium text-ink">
                      {new Date(m.month + "-15").toLocaleString("en-PH", {
                        month: "long",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-ink/70">
                      {m.bookings}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-semibold text-ink">
                      {formatPesosFromCents(m.revenueCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function format(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function chipClass(active: boolean): string {
  return [
    "inline-flex h-7 items-center rounded-full border px-3 text-xs font-semibold transition-all",
    active
      ? "bg-flame border-flame text-white"
      : "bg-white border-line text-ink/70 hover:border-ink/30 hover:bg-oat/60",
  ].join(" ");
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: "flame" | "pine" | "muted";
}) {
  const valueClass =
    accent === "flame"
      ? "text-flame"
      : accent === "pine"
        ? "text-pine"
        : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-warm-muted">
        {label}
      </p>
      <p className={`mt-1 text-xl font-black tracking-tight ${valueClass}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-warm-muted">{sub}</p>
    </div>
  );
}
