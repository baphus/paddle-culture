import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import type { Db } from "@/db/client";
import { MANILA_TZ } from "@/lib/booking/constants";
import { manilaWallClock } from "@/lib/booking/slots";
import type { BookingDetail } from "./bookings";
import { listBookings } from "./bookings";

// All Drizzle ORM imports replaced with @supabase/supabase-js HTTP client.

function manilaToday(): string {
  const z = new TZDate(Date.now(), MANILA_TZ);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

function manilaDayStart(dateStr: string): Date {
  return manilaWallClock(dateStr);
}

/** UTC ISO string — see note in admin/bookings.ts (TZDate.toISOString is zoned). */
function utcIso(d: Date): string {
  return new Date(d.getTime()).toISOString();
}

export interface DashboardStats {
  pending: number;
  approvedToday: number;
  /** Bookings with a slot today, any status. */
  todayTotal: number;
  revenueToday: number;
  totalApproved: number;
  recentBookings: BookingDetail[];
}

/** Rows the dashboard table pages through client-side. */
export const DASHBOARD_RECENT_LIMIT = 50;

export async function getDashboardStats(db: Db): Promise<DashboardStats> {
  const today = manilaToday();
  const todayStart = manilaDayStart(today);
  const tomorrowStart = addDays(todayStart, 1);

  // Run these reads in parallel
  const [pendingResult, approvedResult, todaySlotsResult, recentResult] = await Promise.all([
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
      .gte("slot_start", utcIso(todayStart))
      .lt("slot_start", utcIso(tomorrowStart))
      .limit(2000),
    listBookings(db, {
      q: "",
      status: "all",
      from: "",
      to: "",
      page: 1,
      limit: DASHBOARD_RECENT_LIMIT,
    }),

  ]);

  const pending = pendingResult.count ?? 0;
  const totalApproved = approvedResult.count ?? 0;
  const candidateIds = [
    ...new Set(
      ((todaySlotsResult.data ?? []) as { booking_id: string }[]).map((r) => r.booking_id),
    ),
  ];
  // Today's bookings regardless of status — same slot-today candidate set the
  // approved/revenue tally below narrows down.
  const todayTotal = candidateIds.length;

  let approvedToday = 0;
  let revenueToday = 0;

  if (candidateIds.length > 0) {
    // .in() ids are chunked so the URL stays under the PostgREST/proxy length limit.
    const approvedTodayRows: { total: string }[] = [];
    for (let i = 0; i < candidateIds.length; i += 100) {
      const { data } = await db
        .from("bookings")
        .select("total")
        .eq("status", "Approved")
        .in("id", candidateIds.slice(i, i + 100));
      approvedTodayRows.push(...((data ?? []) as { total: string }[]));
    }

    approvedToday = approvedTodayRows.length;
    revenueToday = approvedTodayRows.reduce(
      (sum, r) => sum + Math.round(Number(r.total) * 100),
      0,
    );
  }

  const { rows: recentBookings } = recentResult;

  return {
    pending,
    approvedToday,
    todayTotal,
    revenueToday,
    totalApproved,
    recentBookings,
  };
}
