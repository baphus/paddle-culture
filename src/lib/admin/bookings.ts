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
  /** Max rows to return (dashboard uses 8; the bookings page uses the default). */
  limit?: number;
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

// PostgREST caps every response at 1000 rows (server default) unless the
// request is page-walked with .range(), so all unbounded reads here go
// through fetchPaged. It also puts every `.in()` value in the URL, which is
// why the date filters use the embedded booking_slots join instead of an
// id list — one month at this venue exceeds a comfortable URL.
const PAGE_SIZE = 500;

/** Walk an unbounded PostgREST read in PAGE_SIZE pages until a short page. */
async function fetchPaged<T>(
  run: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message?: string } | null;
  }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message ?? "db error");
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/** Newest-first bookings + filters (read-only). */
export async function listBookings(
  db: Db,
  params: BookingListParams,
): Promise<BookingListResult> {
  // ── Date-range filter via the booking_slots join ───────────────────────────
  // !inner keeps only bookings that have a slot in the range, so the filter
  // runs in Postgres instead of shipping a few hundred UUIDs back out in an
  // `.in(id, …)` URL.
  const lo = params.from
    ? manilaDayStart(params.from).toISOString()
    : new Date(0).toISOString();
  const hi = params.to
    ? addDays(manilaDayStart(params.to), 1).toISOString()
    : new Date(8640000000000000).toISOString();
  const isDateFiltered = Boolean(params.from || params.to);

  // ── Build the bookings query ──────────────────────────────────────────────
  // Count via range(0,0) + count:"exact" (one row, no body walk) so the
  // embedded filter applies to the count too.
  let countQuery = db
    .from("bookings")
    .select("id", { count: "exact" })
    .range(0, 0)
    .gte("booking_slots.slot_start", lo)
    .lt("booking_slots.slot_start", hi);
  let dataQuery = db
    .from("bookings")
    .select(
      "id,tracking_token,tracking_code,status,full_name,email,phone,total,reject_reason,created_at,booking_slots!inner(slot_start)",
    )
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
  if (isDateFiltered) {
    dataQuery = dataQuery
      .gte("booking_slots.slot_start", lo)
      .lt("booking_slots.slot_start", hi);
  }

  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;
  const pageSize = params.limit ?? BOOKINGS_PAGE_SIZE;
  const totalPages = Math.ceil(total / pageSize);
  if (total === 0) return { rows: [], page: 1, totalPages: 0, total: 0 };

  const page = Math.min(Math.max(1, params.page), totalPages);
  const offset = (page - 1) * pageSize;

  const { data: bookingRows, error: dataError } = await dataQuery
    .range(offset, offset + pageSize - 1);
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
 *
 * The date filter runs in Postgres (booking_slots!inner join) and the page
 * walk (fetchPaged) keeps the row count off the URL, so a busy month costs a
 * couple of requests instead of one oversized `.in(id, …)`.
 */
export async function revenueByDay(
  db: Db,
  args: { from: Date; to: Date },
): Promise<RevenueResult> {
  const rows = await fetchPaged<{
    id: string;
    total: string;
    booking_slots: Array<{ slot_start: string }>;
  }>((from, to) =>
    db
      .from("bookings")
      .select("id,total,booking_slots!inner(slot_start)")
      .eq("status", "Approved")
      .gte("booking_slots.slot_start", args.from.toISOString())
      .lt("booking_slots.slot_start", args.to.toISOString())
      .order("id", { ascending: true })
      .range(from, to),
  );

  const days = new Map<string, { bookings: number; revenueCents: number }>();
  let totalBookings = 0;
  let totalCents = 0;

  for (const b of rows) {
    const firstSlot = b.booking_slots?.[0];
    if (!firstSlot) continue;
    const day = manilaDateStr(new Date(firstSlot.slot_start));
    const dayStart = manilaDayStart(day).getTime();
    if (dayStart < args.from.getTime() || dayStart >= args.to.getTime()) continue;
    const cents = pesosToCents(b.total);
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

/**
 * Revenue by month, all Approved bookings.
 *
 * Each booking is grouped by its FIRST slot (the Manila day it starts on),
 * which is what the revenue pages label as "the" date. Paged walk, no id
 * list, so this stays bounded as the table grows.
 */
export async function revenueByMonth(db: Db): Promise<RevenueMonthResult> {
  const rows = await fetchPaged<{
    id: string;
    total: string;
    booking_slots: Array<{ slot_start: string }>;
  }>((from, to) =>
    db
      .from("bookings")
      .select("id,total,booking_slots(slot_start)")
      .eq("status", "Approved")
      .order("id", { ascending: true })
      .range(from, to),
  );

  const monthMap = new Map<string, { bookings: number; revenueCents: number }>();
  let totalBookings = 0;
  let totalCents = 0;

  for (const b of rows) {
    // Earliest slot of this booking = its Manila start day → month key.
    let min = Number.POSITIVE_INFINITY;
    for (const s of b.booking_slots ?? []) {
      const t = new Date(s.slot_start).getTime();
      if (t < min) min = t;
    }
    if (!Number.isFinite(min)) continue;
    const monthKey = manilaDateStr(new Date(min)).slice(0, 7);
    const cents = pesosToCents(b.total);
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
