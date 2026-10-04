import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import type { Db } from "@/db/client";
import { bookingSlots, bookings } from "@/db/schema";
import { MANILA_TZ } from "@/lib/booking/constants";
import { manilaDateStr } from "@/lib/booking/slots";
import type { BookingDetail } from "./bookings";
import { listBookings } from "./bookings";

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
  revenueToday: number; // cents
  totalApproved: number;
  recentBookings: BookingDetail[];
}

export async function getDashboardStats(db: Db): Promise<DashboardStats> {
  const today = manilaToday();
  const todayStart = manilaDayStart(today);
  const tomorrowStart = addDays(todayStart, 1);

  // Count pending bookings (need admin attention)
  const pendingRows = await db
    .select({ n: count() })
    .from(bookings)
    .where(eq(bookings.status, "Pending"));
  const pending = pendingRows[0]?.n ?? 0;

  // Count all-time approved bookings
  const approvedRows = await db
    .select({ n: count() })
    .from(bookings)
    .where(eq(bookings.status, "Approved"));
  const totalApproved = approvedRows[0]?.n ?? 0;

  // Today's approved bookings by service date (earliest slot Manila date)
  const todaySlotsRows = await db
    .selectDistinct({ bookingId: bookingSlots.bookingId })
    .from(bookingSlots)
    .where(
      and(
        gte(bookingSlots.slotStart, todayStart),
        lt(bookingSlots.slotStart, tomorrowStart),
      ),
    );
  const candidateIds = todaySlotsRows.map((r) => r.bookingId);

  let approvedToday = 0;
  let revenueToday = 0;

  if (candidateIds.length > 0) {
    // Re-use inArray import via drizzle (already imported above)
    const { inArray } = await import("drizzle-orm");
    const approvedTodayRows = await db
      .select({ total: bookings.total })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, "Approved"),
          inArray(bookings.id, candidateIds),
        ),
      );
    approvedToday = approvedTodayRows.length;
    revenueToday = approvedTodayRows.reduce(
      (sum, r) => sum + Math.round(Number(r.total) * 100),
      0,
    );
  }

  // 8 most recent bookings (any status), newest first
  const { rows: recentBookings } = await listBookings(db, {
    q: "",
    status: "all",
    from: "",
    to: "",
    page: 1,
  });

  return {
    pending,
    approvedToday,
    revenueToday,
    totalApproved,
    recentBookings: recentBookings.slice(0, 8),
  };
}
