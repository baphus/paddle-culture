import Link from "next/link";
import { TZDate } from "@date-fns/tz";
import { DollarSign, ReceiptText, TrendingUp, CalendarDays } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard, STAT_CARD_GRID } from "@/components/admin/stat-card";
import { FinanceChart } from "@/components/admin/finance-chart";
import { getDb } from "@/db/client";
import { getFinanceReport, normalizeFinanceRange } from "@/lib/admin/finance";
import { listExpenses, listExpensesForExport } from "@/lib/admin/expenses";
import { formatPesosFromCents } from "@/lib/admin/bookings";
import { ExpenseActions, FinanceExport, FinanceFilters } from "./finance-controls";

export const dynamic = "force-dynamic";
function today() { const d = new TZDate(Date.now(), "Asia/Manila"); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function shiftDate(date: string, delta: number) { const [year, month, day] = date.split("-").map(Number); const result = new Date(Date.UTC(year!, month! - 1, day! + delta)); return `${result.getUTCFullYear()}-${String(result.getUTCMonth()+1).padStart(2,"0")}-${String(result.getUTCDate()).padStart(2,"0")}`; }
function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams; const now = today();
  const { from, to } = normalizeFinanceRange(first(params.from), first(params.to), now);
  try {
    const db = getDb(); const category = first(params.category); const q = first(params.q);
    const [report, expenses, exportExpenses] = await Promise.all([getFinanceReport(db, from, to), listExpenses(db, { from, to, category, q, limit: 100 }), listExpensesForExport(db, { from, to, category, q })]);
    return <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">Finance</h1><p className="mt-1 text-sm text-muted-foreground">Cash-based booking revenue, expenses, and profitability in Manila time.</p></div><div className="flex flex-wrap gap-2">{[7,30,90].map((days) => { const start = shiftDate(now, -(days - 1)); return <Button key={days} size="sm" variant="outline" nativeButton={false} render={<Link href={`/admin/finance?from=${start}&to=${now}`} />}>{`Last ${days} days`}</Button>; })}<FinanceExport days={report.days} expenses={exportExpenses} range={`${from}_${to}`} /><ExpenseActions today={now} /></div></header>
      <FinanceFilters from={from} to={to} category={first(params.category)} q={first(params.q)} />
      <p className="text-sm text-muted-foreground">Reporting period: {from} to {to}. {report.days.length} reporting dates · {expenses.total} expenses matching current filters.</p>
      <div className={STAT_CARD_GRID}><StatCard label="Booking Revenue" value={formatPesosFromCents(report.revenueCents)} icon={DollarSign} subtitle="Approved booking totals in range" /><StatCard label="Expenses" value={formatPesosFromCents(report.expenseCents)} icon={ReceiptText} subtitle="Total recorded paid expenses" /><StatCard label="Net Profit" value={formatPesosFromCents(report.profitCents)} icon={TrendingUp} subtitle="Booking Revenue − Expenses" /><StatCard label="Profit Margin" value={report.profitMargin === null ? "—" : `${report.profitMargin.toFixed(1)}%`} icon={CalendarDays} subtitle="Net Profit ÷ Booking Revenue × 100" /><StatCard label="Booking Count" value={String(report.bookings)} icon={CalendarDays} subtitle="Approved bookings with slots in range" /><StatCard label="Avg Revenue / Booking" value={report.averageRevenueCents === null ? "—" : formatPesosFromCents(report.averageRevenueCents)} icon={DollarSign} subtitle="Booking Revenue ÷ Booking Count" /></div>
      <Card><CardHeader><CardTitle>Revenue and profit trend</CardTitle><CardDescription>Daily, weekly, or monthly totals based on the selected range.</CardDescription></CardHeader><CardContent><FinanceChart days={report.days} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Expenses</CardTitle><CardDescription>Newest paid expenses in the selected reporting period.</CardDescription></CardHeader><CardContent>{expenses.rows.length ? <div className="divide-y">{expenses.rows.map((e) => <div key={e.id} className="flex items-center justify-between gap-4 py-3 text-sm"><div className="min-w-0"><p className="font-medium">{e.title}</p><p className="text-muted-foreground">{e.paidDate} · {e.category}{e.vendor ? ` · ${e.vendor}` : ""}</p></div><div className="flex items-center gap-4"><p className="font-medium">{formatPesosFromCents(e.amountCentavos)}</p><ExpenseActions expense={e} today={now} /></div></div>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">No expenses recorded for this period.</p>}</CardContent></Card>
    </div>;
  } catch { return <div><h1 className="text-2xl font-semibold">Finance</h1><p className="mt-2 text-sm text-muted-foreground">Finance data is unavailable until the expense SQL has been applied.</p></div>; }
}
