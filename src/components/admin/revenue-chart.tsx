"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RevenueDay } from "@/lib/admin/bookings";

// Admin-only revenue chart (ADR-10: recharts behind next/dynamic, ssr:false).
// Pure presentational: data comes from the existing revenueByDay() result.
export default function RevenueChart({ days }: { days: RevenueDay[] }) {
  const data = [...days]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => ({ date: d.date.slice(5), revenue: d.revenueCents / 100, bookings: d.bookings }));
  if (data.length === 0) {
    return <p>No approved bookings in this range — chart appears once there are some.</p>;
  }
  return (
    <div style={{ width: "100%", height: 280 }} role="img" aria-label="Revenue by day bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(v: number) => `₱${Number(v).toLocaleString("en-PH")}`}
          />
          <Tooltip
            formatter={(value, name) => [
              name === "revenue" ? `₱${Number(value ?? 0).toFixed(2)}` : String(value ?? ""),
              name === "revenue" ? "Revenue" : "Bookings",
            ]}
          />
          <Bar dataKey="revenue" name="revenue" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
