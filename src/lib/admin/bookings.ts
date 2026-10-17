import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";
import type { Db } from "@/db/client";
import { MANILA_TZ, VENUE_PHONE_DISPLAY } from "@/lib/booking/constants";
import { LaneError } from "@/lib/booking/errors";
import { manilaDateStr, manilaWallClock } from "@/lib/booking/slots";
import {
  generateTrackingCode,
  generateTrackingToken,
  isTrackingCodeViolation,
} from "@/lib/booking/tracking";
import type { AdminCreateBookingBody } from "@/lib/booking/validation";
import { normalizePhone } from "@/lib/booking/phone";
import type { AdminSession } from "./session";
import type { TotalLine } from "@/lib/booking/pricing";

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
  return manilaWallClock(dateStr);
}

/**
 * UTC ISO string for a PostgREST bound. manilaWallClock returns a TZDate whose
 * overridden `toISOString` prints `...+08:00`; Postgres reads that as 16:00Z
 * the day before, which silently widened every date filter by 8h.
 */
function utcIso(d: Date): string {
  return new Date(d.getTime()).toISOString();
}

function hourLabelMinutes(h: number, min: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, "0")}${h < 12 ? "AM" : "PM"}`;
}

/**
 * Collapse a booking's slots into display ranges: dedupes equal starts
 * (two courts, same hour), sorts, and merges runs of consecutive hours —
 * ["1:00PM–5:00PM", "5:00PM–6:00PM"].
 */
/** Manila calendar date, rendered as "October 19, 2026" (UTC-pinned, no drift). */
export function formatBookingDate(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** One slot's display range, e.g. "1:00PM–2:00PM" (Manila wall clock). */
export function slotRangeLabel(startIso: string): string {
  return formatSlotRanges([startIso])[0]!;
}

export function formatSlotRanges(slotStarts: string[]): string[] {
  const ts = [...new Set(slotStarts.map((s) => new Date(s).getTime()))].sort(
    (a, b) => a - b,
  );
  if (ts.length === 0) return [];
  const label = (t: number) => {
    const z = new TZDate(new Date(t), MANILA_TZ);
    return hourLabelMinutes(z.getHours(), z.getMinutes());
  };
  const runs: string[] = [];
  let start = ts[0]!;
  for (let i = 1; i <= ts.length; i++) {
    const next = ts[i];
    if (next === undefined || next - ts[i - 1]! !== 3_600_000) {
      runs.push(`${label(start)}–${label(ts[i - 1]! + 3_600_000)}`);
      if (next !== undefined) start = next;
    }
  }
  return runs;
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
    ? utcIso(manilaDayStart(params.from))
    : new Date(0).toISOString();
  const hi = params.to
    ? utcIso(addDays(manilaDayStart(params.to), 1))
    : new Date(8640000000000000).toISOString();
  const isDateFiltered = Boolean(params.from || params.to);

  // ── Build the bookings query ──────────────────────────────────────────────
  // Count via range(0,0) + count:"exact" (one row, no body walk) so the
  // embedded filter applies to the count too.
  // booking_slots!inner must appear in the select when we filter on it;
  // omit it (and the range filters) when there is no date range so we avoid
  // an unnecessary join on every unfiltered count.
  let countQuery = isDateFiltered
    ? db
        .from("bookings")
        .select("id,booking_slots!inner(slot_start)", { count: "exact" })
        .range(0, 0)
        .gte("booking_slots.slot_start", lo)
        .lt("booking_slots.slot_start", hi)
    : db
        .from("bookings")
        .select("id", { count: "exact" })
        .range(0, 0);
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

  const pageSize = params.limit ?? BOOKINGS_PAGE_SIZE;
  const requestedPage = Math.max(1, params.page);

  const [countResult, dataResult] = await Promise.all([
    countQuery,
    dataQuery.range((requestedPage - 1) * pageSize, requestedPage * pageSize - 1),
  ]);
  if (countResult.error) throw new Error(countResult.error.message);
  const total = countResult.count ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  if (total === 0) return { rows: [], page: 1, totalPages: 0, total: 0 };
  if (dataResult.error) throw new Error(dataResult.error.message);

  const page = Math.min(requestedPage, totalPages);

  // Out-of-range request: the parallel read fetched the wrong slice, so re-read the clamped page.
  let bookingRows = dataResult.data;
  if (page !== requestedPage) {
    const offset = (page - 1) * pageSize;
    const { data, error } = await dataQuery.range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    bookingRows = data;
  }

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
      slotLabels: formatSlotRanges(rawSlots.map((s) => s.slot_start)),
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
 *
 * The walk is also bounded at the source: only bookings created in the
 * trailing 12 months are fetched, so a long-lived table does not stream
 * every Approved row on each render. Bookings are created at/near their
 * slot time, so this is the report's natural window.
 */
export async function revenueByMonth(db: Db): Promise<RevenueMonthResult> {
  // shortcut: a booking made up to the 12-month horizon before its slot can
  // fall just outside this bound; widen to 24 months if that matters.
  const since = new Date();
  since.setMonth(since.getMonth() - 12);

  const rows = await fetchPaged<{
    id: string;
    total: string;
    booking_slots: Array<{ slot_start: string }>;
  }>((from, to) =>
    db
      .from("bookings")
      .select("id,total,booking_slots(slot_start)")
      .eq("status", "Approved")
      .gte("created_at", since.toISOString())
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
    slotLabels: formatSlotRanges(rawSlots.map((s) => s.slot_start)),
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

// ── Admin booking creation ───────────────────────────────────────────────────

export interface CreatedBooking {
  id: string;
  status: string;
  trackingCode: string;
  trackingToken: string;
  total: string;
  notify: boolean;
  deduped: boolean;
  evictedHolds: number;
}

export interface CreateBookingAdminInput {
  /** Validated request body (adminCreateBookingBodySchema). */
  body: AdminCreateBookingBody;
  /** Server-recalculated total — never the client's number. */
  total: string;
  /** Pricing lines from recalculateTotal, echoed into the outbox payload. */
  lines: TotalLine[];
  /** Optional verified proof (null when the admin attached none). */
  proof: { path: string; mime: string; bytes: number } | null;
  /** Court names resolved by the caller, for the outbox payload. */
  courtNames: Map<string, string>;
}

/**
 * Create an admin booking (Q1–Q16). Mirrors applyDecision(): one RPC call,
 * Postgres exception messages translated back into LaneErrors.
 *
 * Availability (open hours, horizon, clashes) and pricing are checked by the
 * route handler before this runs — same order as POST /api/submit. What this
 * adds is the admin-only write shape: slots born `approved`, no holds, an
 * optional proof, and an optional customer email.
 */
export async function createBookingAdmin(
  db: Db,
  admin: AdminSession,
  input: CreateBookingAdminInput,
): Promise<CreatedBooking> {
  const { body } = input;
  const notify = body.notify;
  const slotPairs = body.slots.map((s) => ({
    courtId: s.courtId,
    start: new Date(s.slotStart),
  }));

  // Q13: when the customer is not being notified there is no real identity to
  // collect, so the booking is attributed to the admin and the free-text
  // description becomes the name. `phone` must still be a non-empty string
  // only if the schema demands it — it does not, so '' is allowed.
  const fullName = notify
    ? (body.customer?.fullName ?? body.description)
    : body.description;
  const email = notify
    ? (body.customer?.email ?? admin.email).toLowerCase()
    : admin.email.toLowerCase();
  const phone = notify
    ? normalizePhone(body.customer?.phone ?? "")
    : normalizePhone(VENUE_PHONE_DISPLAY);

  const slotSummary = slotPairs.map((p) => ({
    courtId: p.courtId,
    courtName: input.courtNames.get(p.courtId) ?? p.courtId,
    slotStart: p.start.toISOString(),
  }));

  // Same rental defaults as the customer path: paddleHours falls back to the
  // slot count, ball fee is whatever the pricing engine charged.
  const paddleHoursStr =
    body.rentals.paddleQty > 0
      ? String(body.rentals.paddleHours ?? slotPairs.length)
      : null;
  const ballFeeStr = body.rentals.ball
    ? (input.lines.find((l) => l.kind === "ball")?.amount ?? null)
    : null;

  const trackingToken = generateTrackingToken();

  type RpcResult = {
    booking_id: string;
    tracking_token: string;
    tracking_code: string;
    total: string;
    status: string;
    notify: boolean;
    deduped: boolean;
    evicted_holds: number;
  };

  let rpcResult: RpcResult | null = null;
  let lastError: { message?: string; code?: string } | null = null;

  // Retry up to 5× on a tracking_code collision, exactly like /api/submit.
  for (let attempt = 0; attempt <= 4; attempt++) {
    const { data, error } = await db.rpc("rpc_admin_create_booking", {
      p_idempotency_key: body.idempotencyKey,
      p_tracking_token: trackingToken,
      p_tracking_code: generateTrackingCode(),
      p_full_name: fullName,
      p_email: email,
      p_phone: phone,
      p_total: input.total,
      p_slots: slotPairs.map((p) => ({
        court_id: p.courtId,
        slot_start: p.start.toISOString(),
      })),
      p_slot_summary: slotSummary,
      p_paddle_qty: body.rentals.paddleQty,
      p_paddle_hours: paddleHoursStr,
      p_ball_fee: ballFeeStr,
      p_proof_path: input.proof?.path ?? null,
      p_proof_mime: input.proof?.mime ?? null,
      p_proof_bytes: input.proof?.bytes ?? null,
      p_notify: notify,
      p_lines: input.lines,
      p_actor_email: admin.email,
    });

    if (!error) {
      rpcResult = data as RpcResult;
      break;
    }
    if (isTrackingCodeViolation(error) && attempt < 4) continue;
    lastError = error;
    break;
  }

  if (lastError || !rpcResult) {
    const msg = lastError?.message ?? "";
    if (msg.includes("SLOT_TAKEN") || lastError?.code === "23505") {
      throw new LaneError(
        "SLOT_TAKEN",
        "A selected slot is no longer available.",
        409,
      );
    }
    if (msg.includes("PROOF_ALREADY_USED")) {
      throw new LaneError(
        "PROOF_ALREADY_USED",
        "This payment proof was already used for another booking.",
        409,
      );
    }
    if (msg.includes("IDEMPOTENCY_IN_PROGRESS")) {
      throw new LaneError(
        "IDEMPOTENCY_IN_PROGRESS",
        "A booking with this key is already being processed. Retry shortly.",
        409,
      );
    }
    console.error("rpc_admin_create_booking failed", lastError);
    throw new LaneError("INTERNAL", "Could not create the booking.", 500);
  }

  return {
    id: rpcResult.booking_id,
    status: rpcResult.status,
    trackingCode: rpcResult.tracking_code,
    trackingToken: rpcResult.tracking_token,
    total: rpcResult.total,
    notify: rpcResult.notify,
    deduped: rpcResult.deduped,
    evictedHolds: rpcResult.evicted_holds ?? 0,
  };
}
