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

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
  mode,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  label?: string;
  mode: "full" | "mini";
}) {
  if (!active || !payload?.length) return null;
  const rev = payload.find((p) => p.name === "revenue");
  const bk = payload.find((p) => p.name === "bookings");
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{label}</p>
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

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  days: RevenueDay[];
  months: RevenueMonth[];
  mode?: "full" | "mini";
}

type Toggle = "daily" | "monthly";

// ─── main component ───────────────────────────────────────────────────────────

export default function RevenueChart({ days, months, mode = "full" }: Props) {
  const [toggle, setToggle] = useState<Toggle>("daily");
  const isMini = mode === "mini";

  // Build chart data — daily sorted oldest→newest, trim label to MM-DD / Mon-YY
  const dailyData = useMemo(
    () =>
      [...days].sort((a, b) => (a.date < b.date ? -1 : 1)).map((d) => ({
        label: d.date.slice(5), // MM-DD
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
          revenue: m.revenueCents / 100,
          bookings: m.bookings,
        };
      }),
    [months],
  );

  const data = toggle === "daily" ? dailyData : monthlyData;
  const hasData = data.length > 0;
  const chartHeight = isMini ? 130 : 280;

  return (
    <div className="space-y-0">
      {/* Toggle + heading row */}
      <div className={`flex items-center justify-between ${isMini ? "mb-3" : "mb-4"}`}>
        {!isMini && (
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {toggle === "daily" ? "Daily revenue (approved bookings)" : "Monthly revenue (approved bookings)"}
          </p>
        )}
        <div className={`flex items-center gap-1 rounded-lg border border-border bg-muted p-0.5 ${isMini ? "ml-auto" : ""}`}>
          {(["daily", "monthly"] as Toggle[]).map((t) => (
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

      {/* Full mode legend */}
      {!isMini && hasData && (
        <div className="mt-3 flex items-center gap-5">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span className="inline-block h-0.5 w-4 rounded-full bg-chart-2" />
            Revenue
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span
              className="inline-block h-px w-4"
              style={{
                background: `repeating-linear-gradient(90deg, var(--chart-3) 0, var(--chart-3) 4px, transparent 4px, transparent 7px)`,
              }}
            />
            Bookings
          </span>
        </div>
      )}
    </div>
  );
}
