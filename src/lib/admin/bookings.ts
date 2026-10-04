import { and, count, desc, eq, gte, ilike, inArray, lt } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import type { Db } from "@/db/client";
import {
  bookingRentals,
  bookingSlots,
  bookings,
  courts,
  paymentProofs,
} from "@/db/schema";
import { MANILA_TZ } from "@/lib/booking/constants";
import { manilaDateStr } from "@/lib/booking/slots";

export const BOOKINGS_PAGE_SIZE = 20;
export const BOOKING_STATUSES = ["Pending", "Approved", "Rejected"] as const;

export interface BookingSlotView {
  courtId: string;
  courtName: string;
  slotStart: string;
}

// JSON-serializable (safe to pass to client components).
export interface BookingDetail {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  total: string;
  status: string;
  rejectReason: string | null;
  createdAt: string;
  trackingToken: string;
  courts: string;
  date: string;
  slotLabels: string[];
  slots: BookingSlotView[];
  paddleQty: number;
  paddleHours: string | null;
  hasBall: boolean;
  proofPath: string | null;
}

function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function manilaDayStart(dateStr: string): Date {
  return new TZDate(`${dateStr}T00:00:00`, MANILA_TZ);
}

function hourLabel(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? "AM" : "PM"}`;
}

/** "6–7AM" style label for a slot start instant (Manila wall clock). */
export function slotLabel(start: Date): string {
  const z = new TZDate(start, MANILA_TZ);
  const h = z.getHours();
  return `${hourLabel(h)}–${hourLabel((h + 1) % 24)}`;
}

export interface BookingListParams {
  q: string;
  status: string;
  from: string;
  to: string;
  page: number;
}

export interface BookingListResult {
  rows: BookingDetail[];
  page: number;
  totalPages: number;
  total: number;
}

/** Newest-first bookings + filters (read-only). */
export async function listBookings(
  db: Db,
  params: BookingListParams,
): Promise<BookingListResult> {
  const filters = [];
  if (params.q) {
    filters.push(ilike(bookings.fullName, `%${escapeIlike(params.q)}%`));
  }
  if ((BOOKING_STATUSES as readonly string[]).includes(params.status)) {
    filters.push(eq(bookings.status, params.status));
  }
  if (params.from || params.to) {
    const lo = params.from ? manilaDayStart(params.from) : new Date(0);
    const hi = params.to
      ? addDays(manilaDayStart(params.to), 1)
      : new Date(8640000000000000);
    const idRows = await db
      .selectDistinct({ id: bookingSlots.bookingId })
      .from(bookingSlots)
      .where(and(gte(bookingSlots.slotStart, lo), lt(bookingSlots.slotStart, hi)));
    const idList = idRows.map((r) => r.id);
    if (idList.length === 0) {
      return { rows: [], page: 1, totalPages: 0, total: 0 };
    }
    filters.push(inArray(bookings.id, idList));
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;
  const totalRows = await db
    .select({ n: count() })
    .from(bookings)
    .where(whereClause);
  const total = totalRows[0]?.n ?? 0;
  const totalPages = Math.ceil(total / BOOKINGS_PAGE_SIZE);
  if (total === 0) return { rows: [], page: 1, totalPages: 0, total: 0 };
  const page = Math.min(Math.max(1, params.page), totalPages);

  const bookingRows = await db
    .select()
    .from(bookings)
    .where(whereClause)
    .orderBy(desc(bookings.createdAt))
    .limit(BOOKINGS_PAGE_SIZE)
    .offset((page - 1) * BOOKINGS_PAGE_SIZE);

  const ids = bookingRows.map((b) => b.id);
  const slotRows = await db
    .select({
      bookingId: bookingSlots.bookingId,
      courtId: bookingSlots.courtId,
      courtName: courts.name,
      slotStart: bookingSlots.slotStart,
    })
    .from(bookingSlots)
    .innerJoin(courts, eq(bookingSlots.courtId, courts.id))
    .where(inArray(bookingSlots.bookingId, ids));
  const rentalRows = await db
    .select()
    .from(bookingRentals)
    .where(inArray(bookingRentals.bookingId, ids));
  const proofRows = await db
    .select({ bookingId: paymentProofs.bookingId, path: paymentProofs.path })
    .from(paymentProofs)
    .where(inArray(paymentProofs.bookingId, ids));

  const slotsByBooking = new Map<string, typeof slotRows>();
  for (const s of slotRows) {
    const list = slotsByBooking.get(s.bookingId);
    if (list) list.push(s);
    else slotsByBooking.set(s.bookingId, [s]);
  }
  const rentalByBooking = new Map(rentalRows.map((r) => [r.bookingId, r]));
  const proofByBooking = new Map(proofRows.map((p) => [p.bookingId, p.path]));

  const rows: BookingDetail[] = bookingRows.map((b) => {
    const slots = (slotsByBooking.get(b.id) ?? [])
      .slice()
      .sort((a, c) => a.slotStart.getTime() - c.slotStart.getTime());
    const rental = rentalByBooking.get(b.id);
    const courtNames = [...new Set(slots.map((s) => s.courtName))].join(", ");
    return {
      id: b.id,
      fullName: b.fullName,
      email: b.email,
      phone: b.phone,
      total: b.total,
      status: b.status,
      rejectReason: b.rejectReason,
      createdAt: b.createdAt.toISOString(),
      trackingToken: b.trackingToken,
      courts: courtNames,
      date: slots.length > 0 ? manilaDateStr(slots[0]!.slotStart) : "—",
      slotLabels: slots.map((s) => slotLabel(s.slotStart)),
      slots: slots.map((s) => ({
        courtId: s.courtId,
        courtName: s.courtName,
        slotStart: s.slotStart.toISOString(),
      })),
      paddleQty: rental?.paddleQty ?? 0,
      paddleHours: rental?.paddleHours ?? null,
      hasBall: rental?.ballFee != null,
      proofPath: proofByBooking.get(b.id) ?? null,
    };
  });

  return { rows, page, totalPages, total };
}

export interface RevenueDay {
  date: string;
  bookings: number;
  revenueCents: number;
}

export interface RevenueResult {
  days: RevenueDay[];
  totalBookings: number;
  totalCents: number;
}

function pesosToCents(amount: string): number {
  return Math.round(Number(amount) * 100);
}

export function formatPesosFromCents(cents: number): string {
  return `₱${(cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Revenue from Approved bookings only. Each booking's full total is
 * attributed to the Manila date of its earliest slot (service date).
 */
export async function revenueByDay(
  db: Db,
  args: { from: Date; to: Date },
): Promise<RevenueResult> {
  const inRange = await db
    .select({ bookingId: bookingSlots.bookingId })
    .from(bookingSlots)
    .where(
      and(gte(bookingSlots.slotStart, args.from), lt(bookingSlots.slotStart, args.to)),
    );
  const candidateIds = [...new Set(inRange.map((r) => r.bookingId))];
  const days = new Map<string, { bookings: number; revenueCents: number }>();
  let totalBookings = 0;
  let totalCents = 0;
  if (candidateIds.length === 0) {
    return { days: [], totalBookings, totalCents };
  }
  const approvedRows = await db
    .select({ id: bookings.id, total: bookings.total })
    .from(bookings)
    .where(
      and(eq(bookings.status, "Approved"), inArray(bookings.id, candidateIds)),
    );
  const approved = new Map(approvedRows.map((b) => [b.id, b.total]));
  if (approved.size === 0) {
    return { days: [], totalBookings, totalCents };
  }
  const allSlots = await db
    .select({ bookingId: bookingSlots.bookingId, slotStart: bookingSlots.slotStart })
    .from(bookingSlots)
    .where(inArray(bookingSlots.bookingId, [...approved.keys()]));
  const minByBooking = new Map<string, number>();
  for (const s of allSlots) {
    const t = s.slotStart.getTime();
    const prev = minByBooking.get(s.bookingId);
    if (prev === undefined || t < prev) minByBooking.set(s.bookingId, t);
  }
  for (const [id, total] of approved) {
    const min = minByBooking.get(id);
    if (min === undefined) continue;
    const day = manilaDateStr(new Date(min));
    const dayStart = manilaDayStart(day).getTime();
    if (dayStart < args.from.getTime() || dayStart >= args.to.getTime()) continue;
    const cents = pesosToCents(total);
    const entry = days.get(day);
    if (entry) {
      entry.bookings += 1;
      entry.revenueCents += cents;
    } else {
      days.set(day, { bookings: 1, revenueCents: cents });
    }
    totalBookings += 1;
    totalCents += cents;
  }
  return {
    days: [...days.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    totalBookings,
    totalCents,
  };
}
