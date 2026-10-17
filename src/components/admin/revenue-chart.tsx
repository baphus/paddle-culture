"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import type { RevenueDay, RevenueMonth } from "@/lib/admin/bookings";

// ─── stock chart tokens (globals.css --chart-*) ──────────────────────────────
const REVENUE_COLOR = "var(--chart-2)";
const BOOKINGS_COLOR = "var(--chart-3)";
const GRID_COLOR = "var(--border)";
const AXIS_COLOR = "var(--muted-foreground)";

// ─── helpers ─────────────────────────────────────────────────────────────────

function pesosShort(v: number): string {
  if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `₱${(v / 1_000).toFixed(0)}k`;
  return `₱${v.toFixed(0)}`;
}

function pesosLong(v: number): string {
  return `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format a YYYY-MM-DD string to a human-readable label. */
function formatDateLabel(key: string, mode: "full" | "mini"): string {
  if (!key) return "";
  // Monthly keys are "YYYY-MM" without day
  const parts = key.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = parts[2] ? Number(parts[2]) : 1;
  if (isNaN(year) || isNaN(month)) return key;
  const dt = new Date(year, month - 1, day);
  if (mode === "mini") {
    return dt.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  }
  return dt.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
  mode,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; label?: string; dateKey?: string }>;
  label?: string;
  mode: "full" | "mini";
}) {
  if (!active || !payload?.length) return null;
  const rev = payload.find((p) => p.name === "revenue");
  const bk = payload.find((p) => p.name === "bookings");
  // Derive the display label from payload data, falling back to Recharts' label prop
  const dataLabel = payload[0]?.dateKey ? formatDateLabel(payload[0].dateKey, mode) :
                    payload[0]?.label ?? label ?? "";
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{dataLabel}</p>
      {rev && (
        <p className="font-semibold text-chart-2">
          {pesosLong(rev.value)}
        </p>
      )}
      {bk && mode === "full" && (
        <p className="text-muted-foreground">
          {bk.value} booking{bk.value !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

// ─── weekly rollup ─────────────────────────────────────────────────────────────

/** Roll daily rows into Monday-start weeks (Manila dates, YYYY-MM-DD). */
function rollupByWeek(days: RevenueDay[]) {
  const weeks = new Map<string, { revenue: number; bookings: number }>();
  for (const d of days) {
    const key = weekStart(d.date);
    const entry = weeks.get(key);
    if (entry) {
      entry.revenue += d.revenueCents / 100;
      entry.bookings += d.bookings;
    } else {
      weeks.set(key, { revenue: d.revenueCents / 100, bookings: d.bookings });
    }
  }
  return [...weeks.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, v]) => ({ label: key.slice(5), dateKey: key, revenue: v.revenue, bookings: v.bookings }));
}

// Mirrors weekStartManila in lib/admin/calendar.ts — kept local so this client
// component never imports the server admin modules.
function weekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcNoon = Date.UTC(y as number, (m as number) - 1, d as number, 12);
  const dow = new Date(utcNoon).getUTCDay();
  const daysToMon = dow === 0 ? -6 : 1 - dow;
  const dt = new Date(utcNoon + daysToMon * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  days: RevenueDay[];
  months: RevenueMonth[];
  mode?: "full" | "mini";
}

type Toggle = "daily" | "weekly" | "monthly";

// ─── main component ───────────────────────────────────────────────────────────

export default function RevenueChart({ days, months, mode = "full" }: Props) {
  const [toggle, setToggle] = useState<Toggle>("monthly");
  const isMini = mode === "mini";

  // Build chart data — daily sorted oldest→newest, trim label to MM-DD / Mon-YY
  const dailyData = useMemo(
    () =>
      [...days].sort((a, b) => (a.date < b.date ? -1 : 1)).map((d) => ({
        label: d.date.slice(5), // MM-DD
        dateKey: d.date,
        revenue: d.revenueCents / 100,
        bookings: d.bookings,
      })),
    [days],
  );

  const monthlyData = useMemo(
    () =>
      [...months].sort((a, b) => (a.month < b.month ? -1 : 1)).map((m) => {
        const [y, mo] = m.month.split("-");
        const date = new Date(Number(y), Number(mo) - 1, 1);
        return {
          label: date.toLocaleString("en-PH", { month: "short", year: "2-digit" }),
          dateKey: m.month,
          revenue: m.revenueCents / 100,
          bookings: m.bookings,
        };
      }),
    [months],
  );

  const weeklyData = useMemo(() => rollupByWeek(days), [days]);

  const data = toggle === "daily" ? dailyData : toggle === "weekly" ? weeklyData : monthlyData;
  const hasData = data.length > 0;
  const chartHeight = isMini ? 130 : 280;

  return (
    <div className="space-y-0">
      {/* Toggle + heading row */}
      <div className={`flex items-center justify-between ${isMini ? "mb-3" : "mb-4"}`}>
        {!isMini && (
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {toggle === "daily"
              ? "Daily revenue (approved bookings)"
              : toggle === "weekly"
                ? "Weekly revenue (approved bookings)"
                : "Monthly revenue (approved bookings)"}
          </p>
        )}
        <div className={`flex items-center gap-1 rounded-lg border border-border bg-muted p-0.5 ${isMini ? "ml-auto" : ""}`}>
          {(["monthly", "weekly", "daily"] as Toggle[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setToggle(t)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                toggle === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Range label */}
      <div className={`mb-3 text-xs text-muted-foreground ${isMini ? "" : "sr-only"}`}>
        {data.length > 0
          ? `${formatDateLabel((data[0] as any).dateKey ?? "", mode)} – ${formatDateLabel((data[data.length - 1] as any).dateKey ?? "", mode)}`
          : undefined}
      </div>

      {/* Chart */}
      {hasData ? (
        <div
          style={{ width: "100%", height: chartHeight }}
          role="img"
          aria-label={`${toggle} revenue chart`}
        >
          <ResponsiveContainer width="100%" height="100%">
            {isMini ? (
              // Mini: clean area, no axes, no grid
              <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="miniGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={REVENUE_COLOR} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={REVENUE_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  content={<ChartTooltip mode="mini" />}
                  cursor={{ stroke: GRID_COLOR, strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="revenue"
                  stroke={REVENUE_COLOR}
                  strokeWidth={2}
                  fill="url(#miniGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: REVENUE_COLOR, stroke: "var(--background)", strokeWidth: 2 }}
                />
              </AreaChart>
            ) : (
              // Full: composed chart — area for revenue + bar overlay + line for bookings
              <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={REVENUE_COLOR} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={REVENUE_COLOR} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke={GRID_COLOR}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: AXIS_COLOR }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="revenue"
                  orientation="left"
                  tick={{ fontSize: 11, fill: AXIS_COLOR }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={pesosShort}
                  width={60}
                />
                <YAxis
                  yAxisId="bookings"
                  orientation="right"
                  tick={{ fontSize: 11, fill: AXIS_COLOR }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={32}
                />
                <Tooltip
                  content={<ChartTooltip mode="full" />}
                  cursor={{ fill: "var(--accent)" }}
                />
                {/* Revenue bars */}
                <Bar
                  yAxisId="revenue"
                  dataKey="revenue"
                  name="revenue"
                  fill={REVENUE_COLOR}
                  fillOpacity={0.15}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={40}
                />
                {/* Revenue area line on top */}
                <Area
                  yAxisId="revenue"
                  type="monotone"
                  dataKey="revenue"
                  name="revenue"
                  stroke={REVENUE_COLOR}
                  strokeWidth={2}
                  fill="url(#revGrad)"
                  dot={false}
                  activeDot={{ r: 5, fill: REVENUE_COLOR, stroke: "var(--background)", strokeWidth: 2 }}
                />
                {/* Bookings count line */}
                <Line
                  yAxisId="bookings"
                  type="monotone"
                  dataKey="bookings"
                  name="bookings"
                  stroke={BOOKINGS_COLOR}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={{ r: 4, fill: BOOKINGS_COLOR, stroke: "var(--background)", strokeWidth: 2 }}
                />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          className={`flex flex-col items-center justify-center gap-2 rounded-lg bg-muted text-sm text-muted-foreground ${
            isMini ? "h-[130px]" : "h-[280px]"
          }`}
        >
          <BarChart3 className="size-6 opacity-50" />
          <span>No approved bookings in this range yet.</span>
        </div>
      )}

      {/* Legend */}
      <div className={`mt-3 flex items-center gap-5 ${isMini ? "mb-2" : ""}`}>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="inline-block h-0.5 w-4 rounded-full bg-chart-2" />
          Revenue
        </span>
        {!isMini && (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span
              className="inline-block h-px w-4"
              style={{
                background: `repeating-linear-gradient(90deg, var(--chart-3) 0, var(--chart-3) 4px, transparent 4px, transparent 7px)`,
              }}
            />
            Bookings
          </span>
        )}
      </div>
    </div>
  );
}
