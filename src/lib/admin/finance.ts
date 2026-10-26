import type { Db } from "@/db/client";
import { manilaDateStr } from "@/lib/booking/slots";

export interface FinanceDay { date: string; revenueCents: number; expenseCents: number; profitCents: number; bookings: number }
export interface FinanceReport { days: FinanceDay[]; revenueCents: number; expenseCents: number; profitCents: number; bookings: number; profitMargin: number | null; averageRevenueCents: number | null }
export type FinanceGranularity = "daily" | "weekly" | "monthly";
export interface FinanceBucket { date: string; revenueCents: number; profitCents: number }

export function normalizeFinanceRange(fromValue: string | undefined, toValue: string | undefined, today: string) {
  const fromCandidate = validDate(fromValue) ? fromValue : addDaysString(today, -29);
  const toCandidate = validDate(toValue) ? toValue : today;
  return fromCandidate <= toCandidate
    ? { from: fromCandidate, to: toCandidate }
    : { from: toCandidate, to: fromCandidate };
}

function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

export function bucketFinanceDays(days: FinanceDay[]): { granularity: FinanceGranularity; buckets: FinanceBucket[] } {
  const granularity: FinanceGranularity = days.length <= 45 ? "daily" : days.length <= 180 ? "weekly" : "monthly";
  const buckets = new Map<string, FinanceBucket>();
  for (const day of days) {
    const key = granularity === "daily" ? day.date : granularity === "weekly" ? weekStart(day.date) : day.date.slice(0, 7);
    const bucket = buckets.get(key) ?? { date: key, revenueCents: 0, profitCents: 0 };
    bucket.revenueCents += day.revenueCents;
    bucket.profitCents += day.profitCents;
    buckets.set(key, bucket);
  }
  return { granularity, buckets: [...buckets.values()] };
}

function weekStart(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day!));
  const offset = utc.getUTCDay() === 0 ? -6 : 1 - utc.getUTCDay();
  utc.setUTCDate(utc.getUTCDate() + offset);
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

function pesosToCents(amount: string): number {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount);
  if (!match) throw new Error("Booking total is not a decimal amount.");
  const fraction = match[3] ?? "";
  const sign = match[1] === "-" ? -1 : 1;
  const cents = Number(`${match[2]}${fraction.padEnd(2, "0").slice(0, 2) || "00"}`);
  const result = sign * (cents + (fraction.length > 2 && Number(fraction[2]) >= 5 ? 1 : 0));
  if (!Number.isSafeInteger(result)) throw new Error("Booking total exceeds safe centavo precision.");
  return result;
}

/**
 * Cash-basis revenue: each Approved booking's full total lands on the Manila
 * date it was approved (payment verified), never on its play dates. Expenses
 * land on their paid_date, so same-day profit is meaningful.
 */
export function aggregateFinanceRows(
  from: string, to: string,
  bookings: Array<{ total: string; approved_at: string }>,
  expenses: Array<{ paid_date: string; amount_centavos: number }>,
): FinanceReport {
  const days = new Map<string, Omit<FinanceDay, "date">>();
  let matchingBookingCount = 0;
  const ensure = (date: string) => days.get(date) ?? (days.set(date, { revenueCents: 0, expenseCents: 0, profitCents: 0, bookings: 0 }), days.get(date)!);
  for (const booking of bookings) {
    if (!booking.approved_at) continue;
    const date = manilaDateStr(new Date(booking.approved_at));
    if (date < from || date > to) continue;
    matchingBookingCount += 1;
    const day = ensure(date);
    day.revenueCents += pesosToCents(booking.total);
    day.bookings += 1;
  }
  for (const expense of expenses) if (expense.paid_date >= from && expense.paid_date <= to) ensure(expense.paid_date).expenseCents += expense.amount_centavos;
  for (let date = from; date <= to; date = addDaysString(date)) ensure(date);
  const result = [...days.entries()].map(([date, day]) => ({ date, ...day, profitCents: day.revenueCents - day.expenseCents })).sort((a, b) => a.date.localeCompare(b.date));
  const revenueCents = result.reduce((sum, row) => sum + row.revenueCents, 0);
  const expenseCents = result.reduce((sum, row) => sum + row.expenseCents, 0);
  return { days: result, revenueCents, expenseCents, profitCents: revenueCents - expenseCents, bookings: matchingBookingCount, profitMargin: revenueCents ? ((revenueCents - expenseCents) / revenueCents) * 100 : null, averageRevenueCents: matchingBookingCount ? Math.round(revenueCents / matchingBookingCount) : null };
}

export async function getFinanceReport(db: Db, from: string, to: string): Promise<FinanceReport> {
  const lo = new Date(`${from}T00:00:00+08:00`).toISOString();
  const hi = new Date(`${addDaysString(to)}T00:00:00+08:00`).toISOString();
  const [bookings, expenseResult] = await Promise.all([
    fetchApprovedBookings(db, lo, hi),
    db.from("expenses").select("paid_date,amount_centavos").gte("paid_date", from).lte("paid_date", to),
  ]);
  if (expenseResult.error) throw new Error(expenseResult.error.message);
  return aggregateFinanceRows(from, to, bookings, expenseResult.data ?? []);
}

/** Approved bookings whose approval instant falls in [fromIso, toIso). */
async function fetchApprovedBookings(db: Db, fromIso: string, toIso: string): Promise<Array<{ total: string; approved_at: string }>> {
  const rows: Array<{ total: string; approved_at: string }> = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("bookings").select("total,approved_at").eq("status", "Approved")
      .gte("approved_at", fromIso).lt("approved_at", toIso)
      .order("id", { ascending: true }).range(offset, offset + 499);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Array<{ total: string; approved_at: string | null }>;
    rows.push(...page.map((row) => ({ total: row.total, approved_at: row.approved_at ?? "" })));
    if (page.length < 500) return rows;
  }
}

function addDaysString(date: string, delta = 1): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + delta));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}
