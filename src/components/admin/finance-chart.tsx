"use client";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { bucketFinanceDays, type FinanceDay } from "@/lib/admin/finance";

export function FinanceChart({ days }: { days: FinanceDay[] }) {
  const { granularity, buckets } = bucketFinanceDays(days);
  const data = buckets.map((bucket) => ({ date: bucket.date, revenue: bucket.revenueCents / 100, profit: bucket.profitCents / 100 }));
  if (!data.length) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No Finance data in this range.</div>;
  return <div className="h-72 w-full"><ResponsiveContainer><LineChart data={data}><CartesianGrid strokeDasharray="4 4" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tickFormatter={(value) => `₱${value}`} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`} /><Line type="monotone" dataKey="revenue" name="Booking Revenue" stroke="var(--chart-2)" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="profit" name="Net Profit" stroke="var(--chart-3)" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer><p className="sr-only">Showing {granularity} totals.</p></div>;
}
