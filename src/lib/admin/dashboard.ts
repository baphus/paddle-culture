import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import type { Db } from "@/db/client";
import { MANILA_TZ } from "@/lib/booking/constants";
import type { BookingDetail } from "./bookings";
import { listBookings } from "./bookings";

// All Drizzle ORM imports replaced with @supabase/supabase-js HTTP client.

function manilaToday(): string {
  const z = new TZDate(Date.now(), MANILA_TZ);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

function manilaDayStart(dateStr: string): Date {
  return new TZDate(`${dateStr}T00:00:00`, MANILA_TZ);
}

export interface DashboardStats {
  pending: number;
  approvedToday: number;
  revenueToday: number;
  totalApproved: number;
  recentBookings: BookingDetail[];
}

export async function getDashboardStats(db: Db): Promise<DashboardStats> {
  const today = manilaToday();
  const todayStart = manilaDayStart(today);
  const tomorrowStart = addDays(todayStart, 1);

  // Run these reads in parallel
  const [pendingResult, approvedResult, todaySlotsResult] = await Promise.all([
    db
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "Pending"),
    db
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "Approved"),
    db
      .from("booking_slots")
      .select("booking_id")
      .gte("slot_start", todayStart.toISOString())
      .lt("slot_start", tomorrowStart.toISOString()),
  ]);

  const pending = pendingResult.count ?? 0;
  const totalApproved = approvedResult.count ?? 0;
  const candidateIds = [
    ...new Set(
      ((todaySlotsResult.data ?? []) as { booking_id: string }[]).map((r) => r.booking_id),
    ),
  ];

  let approvedToday = 0;
  let revenueToday = 0;

  if (candidateIds.length > 0) {
    const { data: approvedTodayData } = await db
      .from("bookings")
      .select("total")
      .eq("status", "Approved")
      .in("id", candidateIds);

    approvedToday = (approvedTodayData ?? []).length;
    revenueToday = ((approvedTodayData ?? []) as { total: string }[]).reduce(
      (sum, r) => sum + Math.round(Number(r.total) * 100),
      0,
    );
  }

  const { rows: recentBookings } = await listBookings(db, {
    q: "",
    status: "all",
    from: "",
    to: "",
    page: 1,
    limit: 8,
  });

  return {
    pending,
    approvedToday,
    revenueToday,
    totalApproved,
    recentBookings,
  };
}
