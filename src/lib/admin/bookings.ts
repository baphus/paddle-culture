import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import type { Db } from "@/db/client";
import { MANILA_TZ } from "@/lib/booking/constants";
import { manilaDateStr } from "@/lib/booking/slots";

// All Drizzle ORM imports replaced with @supabase/supabase-js HTTP client.

export const BOOKINGS_PAGE_SIZE = 20;
export const BOOKING_STATUSES = ["Pending", "Approved", "Rejected"] as const;

export interface BookingSlotView {
  courtId: string;
  courtName: string;
  slotStart: string;
}

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

function manilaDayStart(dateStr: string): Date {
  return new TZDate(`${dateStr}T00:00:00`, MANILA_TZ);
}

function hourLabel(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? "AM" : "PM"}`;
}

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

function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Newest-first bookings + filters (read-only). */
export async function listBookings(
  db: Db,
  params: BookingListParams,
): Promise<BookingListResult> {
  // ── Date-range pre-filter via booking_slots ───────────────────────────────
  let idListFromDate: string[] | null = null;
  if (params.from || params.to) {
    const lo = params.from ? manilaDayStart(params.from).toISOString() : new Date(0).toISOString();
    const hi = params.to
      ? addDays(manilaDayStart(params.to), 1).toISOString()
      : new Date(8640000000000000).toISOString();

    const { data: slotIdRows } = await db
      .from("booking_slots")
      .select("booking_id")
      .gte("slot_start", lo)
      .lt("slot_start", hi);

    idListFromDate = [...new Set((slotIdRows ?? []).map((r: { booking_id: string }) => r.booking_id))];
    if (idListFromDate.length === 0) {
      return { rows: [], page: 1, totalPages: 0, total: 0 };
    }
  }

  // ── Build the bookings query ──────────────────────────────────────────────
  let countQuery = db.from("bookings").select("id", { count: "exact", head: true });
  let dataQuery = db
    .from("bookings")
    .select("id,tracking_token,tracking_code,status,full_name,email,phone,total,reject_reason,created_at")
    .order("created_at", { ascending: false });

  if (params.q) {
    const escaped = `%${escapeIlike(params.q)}%`;
    countQuery = countQuery.ilike("full_name", escaped);
    dataQuery = dataQuery.ilike("full_name", escaped);
  }
  if ((BOOKING_STATUSES as readonly string[]).includes(params.status)) {
    countQuery = countQuery.eq("status", params.status);
    dataQuery = dataQuery.eq("status", params.status);
  }
  if (idListFromDate !== null) {
    countQuery = countQuery.in("id", idListFromDate);
    dataQuery = dataQuery.in("id", idListFromDate);
  }

  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;
  const totalPages = Math.ceil(total / BOOKINGS_PAGE_SIZE);
  if (total === 0) return { rows: [], page: 1, totalPages: 0, total: 0 };

  const page = Math.min(Math.max(1, params.page), totalPages);
  const offset = (page - 1) * BOOKINGS_PAGE_SIZE;

  const { data: bookingRows, error: dataError } = await dataQuery
    .range(offset, offset + BOOKINGS_PAGE_SIZE - 1);
  if (dataError) throw new Error(dataError.message);

  const ids = (bookingRows ?? []).map((b: { id: string }) => b.id);
  if (ids.length === 0) return { rows: [], page, totalPages, total };

  // ── Parallel fetch of related data ───────────────────────────────────────
  const [slotsResult, rentalsResult, proofsResult] = await Promise.all([
    db
      .from("booking_slots")
      .select("booking_id,court_id,slot_start,courts(name)")
      .in("booking_id", ids),
    db
      .from("booking_rentals")
      .select("booking_id,paddle_qty,paddle_hours,ball_fee")
      .in("booking_id", ids),
    db
      .from("payment_proofs")
      .select("booking_id,path")
      .in("booking_id", ids),
  ]);

  type SlotRow = { booking_id: string; court_id: string; slot_start: string; courts: unknown };
  function courtName(s: SlotRow): string {
    const c = s.courts;
    if (!c) return s.court_id;
    if (Array.isArray(c)) return (c[0] as { name?: string })?.name ?? s.court_id;
    return (c as { name?: string })?.name ?? s.court_id;
  }
  type RentalRow = { booking_id: string; paddle_qty: number; paddle_hours: string | null; ball_fee: string | null };
  type ProofRow = { booking_id: string; path: string };

  const slotsByBooking = new Map<string, SlotRow[]>();
  for (const s of (slotsResult.data ?? []) as SlotRow[]) {
    const list = slotsByBooking.get(s.booking_id);
    if (list) list.push(s);
    else slotsByBooking.set(s.booking_id, [s]);
  }
  const rentalByBooking = new Map(
    ((rentalsResult.data ?? []) as RentalRow[]).map((r) => [r.booking_id, r]),
  );
  const proofByBooking = new Map(
    ((proofsResult.data ?? []) as ProofRow[]).map((p) => [p.booking_id, p.path]),
  );

  type BookingRow = {
    id: string; tracking_token: string; tracking_code: string; status: string;
    full_name: string; email: string; phone: string; total: string;
    reject_reason: string | null; created_at: string;
  };

  const rows: BookingDetail[] = (bookingRows as BookingRow[]).map((b) => {
    const rawSlots = (slotsByBooking.get(b.id) ?? [])
      .slice()
      .sort((a, c) => new Date(a.slot_start).getTime() - new Date(c.slot_start).getTime());
    const rental = rentalByBooking.get(b.id);
    const courtNames = [...new Set(rawSlots.map((s) => courtName(s)))].join(", ");
    return {
      id: b.id,
      fullName: b.full_name,
      email: b.email,
      phone: b.phone,
      total: b.total,
      status: b.status,
      rejectReason: b.reject_reason,
      createdAt: b.created_at,
      trackingToken: b.tracking_token,
      courts: courtNames,
      date: rawSlots.length > 0 ? manilaDateStr(new Date(rawSlots[0]!.slot_start)) : "—",
      slotLabels: rawSlots.map((s) => slotLabel(new Date(s.slot_start))),
      slots: rawSlots.map((s) => ({
        courtId: s.court_id,
        courtName: courtName(s),
        slotStart: s.slot_start,
      })),
      paddleQty: rental?.paddle_qty ?? 0,
      paddleHours: rental?.paddle_hours ?? null,
      hasBall: rental?.ball_fee != null,
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
 * Revenue from Approved bookings only.
 */
export async function revenueByDay(
  db: Db,
  args: { from: Date; to: Date },
): Promise<RevenueResult> {
  const { data: inRangeData } = await db
    .from("booking_slots")
    .select("booking_id")
    .gte("slot_start", args.from.toISOString())
    .lt("slot_start", args.to.toISOString());

  const candidateIds = [...new Set((inRangeData ?? []).map((r: { booking_id: string }) => r.booking_id))];
  if (candidateIds.length === 0) {
    return { days: [], totalBookings: 0, totalCents: 0 };
  }

  const { data: approvedData } = await db
    .from("bookings")
    .select("id,total")
    .eq("status", "Approved")
    .in("id", candidateIds);

  const approved = new Map(
    ((approvedData ?? []) as { id: string; total: string }[]).map((b) => [b.id, b.total]),
  );
  if (approved.size === 0) return { days: [], totalBookings: 0, totalCents: 0 };

  const { data: allSlotsData } = await db
    .from("booking_slots")
    .select("booking_id,slot_start")
    .in("booking_id", [...approved.keys()]);

  const minByBooking = new Map<string, number>();
  for (const s of (allSlotsData ?? []) as { booking_id: string; slot_start: string }[]) {
    const t = new Date(s.slot_start).getTime();
    const prev = minByBooking.get(s.booking_id);
    if (prev === undefined || t < prev) minByBooking.set(s.booking_id, t);
  }

  const days = new Map<string, { bookings: number; revenueCents: number }>();
  let totalBookings = 0;
  let totalCents = 0;

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

export interface RevenueMonth {
  month: string;
  bookings: number;
  revenueCents: number;
}

export interface RevenueMonthResult {
  months: RevenueMonth[];
  totalBookings: number;
  totalCents: number;
}

export async function revenueByMonth(db: Db): Promise<RevenueMonthResult> {
  const { data: approvedData } = await db
    .from("bookings")
    .select("id,total")
    .eq("status", "Approved");

  if (!approvedData || approvedData.length === 0) {
    return { months: [], totalBookings: 0, totalCents: 0 };
  }

  const approved = new Map(
    (approvedData as { id: string; total: string }[]).map((b) => [b.id, b.total]),
  );

  const { data: allSlotsData } = await db
    .from("booking_slots")
    .select("booking_id,slot_start")
    .in("booking_id", [...approved.keys()]);

  const minByBooking = new Map<string, number>();
  for (const s of (allSlotsData ?? []) as { booking_id: string; slot_start: string }[]) {
    const t = new Date(s.slot_start).getTime();
    const prev = minByBooking.get(s.booking_id);
    if (prev === undefined || t < prev) minByBooking.set(s.booking_id, t);
  }

  const monthMap = new Map<string, { bookings: number; revenueCents: number }>();
  let totalBookings = 0;
  let totalCents = 0;

  for (const [id, total] of approved) {
    const min = minByBooking.get(id);
    if (min === undefined) continue;
    const day = manilaDateStr(new Date(min));
    const monthKey = day.slice(0, 7);
    const cents = Math.round(Number(total) * 100);
    const entry = monthMap.get(monthKey);
    if (entry) {
      entry.bookings += 1;
      entry.revenueCents += cents;
    } else {
      monthMap.set(monthKey, { bookings: 1, revenueCents: cents });
    }
    totalBookings += 1;
    totalCents += cents;
  }

  const months: RevenueMonth[] = [...monthMap.entries()]
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));

  return { months, totalBookings, totalCents };
}

/** Fetch a single booking by ID with full detail. */
export async function getBookingById(
  db: Db,
  id: string,
): Promise<BookingDetail | null> {
  const { data: booking, error: bookingError } = await db
    .from("bookings")
    .select("id,tracking_token,tracking_code,status,full_name,email,phone,total,reject_reason,created_at")
    .eq("id", id)
    .single();
  if (bookingError || !booking) return null;

  const b = booking as {
    id: string; tracking_token: string; tracking_code: string; status: string;
    full_name: string; email: string; phone: string; total: string;
    reject_reason: string | null; created_at: string;
  };

  const [slotsResult, rentalsResult, proofsResult] = await Promise.all([
    db
      .from("booking_slots")
      .select("booking_id,court_id,slot_start,courts(name)")
      .eq("booking_id", id),
    db
      .from("booking_rentals")
      .select("booking_id,paddle_qty,paddle_hours,ball_fee")
      .eq("booking_id", id),
    db
      .from("payment_proofs")
      .select("path")
      .eq("booking_id", id),
  ]);

  type SlotRow = { booking_id: string; court_id: string; slot_start: string; courts: unknown };
  function courtName(s: SlotRow): string {
    const c = s.courts;
    if (!c) return s.court_id;
    if (Array.isArray(c)) return (c[0] as { name?: string })?.name ?? s.court_id;
    return (c as { name?: string })?.name ?? s.court_id;
  }
  type RentalRow = { booking_id: string; paddle_qty: number; paddle_hours: string | null; ball_fee: string | null };

  const rawSlots = ((slotsResult.data ?? []) as SlotRow[])
    .slice()
    .sort((a, c) => new Date(a.slot_start).getTime() - new Date(c.slot_start).getTime());
  const rental = ((rentalsResult.data ?? []) as RentalRow[])[0];
  const courtNames = [...new Set(rawSlots.map((s) => courtName(s)))].join(", ");

  return {
    id: b.id,
    fullName: b.full_name,
    email: b.email,
    phone: b.phone,
    total: b.total,
    status: b.status,
    rejectReason: b.reject_reason,
    createdAt: b.created_at,
    trackingToken: b.tracking_token,
    courts: courtNames,
    date: rawSlots.length > 0 ? manilaDateStr(new Date(rawSlots[0]!.slot_start)) : "—",
    slotLabels: rawSlots.map((s) => slotLabel(new Date(s.slot_start))),
    slots: rawSlots.map((s) => ({
      courtId: s.court_id,
      courtName: courtName(s),
      slotStart: s.slot_start,
    })),
    paddleQty: rental?.paddle_qty ?? 0,
    paddleHours: rental?.paddle_hours ?? null,
    hasBall: rental?.ball_fee != null,
    proofPath: ((proofsResult.data ?? []) as { path: string }[])[0]?.path ?? null,
  };
}
