/**
 * Pure helpers for the admin new-booking notification bell.
 *
 * This module is imported by the client `NotificationBell` component, so it
 * must stay free of `server-only`, `@/db/*`, and anything that touches the
 * request scope. The route handler (`/api/admin/notifications`) is the only
 * place that talks to the DB; these helpers operate on plain data the route
 * returns. Keeping the logic here makes it unit-testable — the repo's test
 * harness only runs pure functions (AGENTS.md), and the bell's state/IO lives
 * in the component, not here.
 *
 * Read model: a booking is "unread" while it is pending AND its id is not in
 * the admin's local "viewed" set. The dropdown lists ONLY unread bookings —
 * not every pending booking. A booking is marked viewed the moment the admin
 * clicks its row (which navigates to the pending queue). On the very first
 * visit the existing pending bookings are seeded into the viewed set so the
 * bell starts empty and only genuinely new bookings notify from then on.
 *
 * "New booking received" = a `bookings` row with `status='Pending'`. Admin
 * walk-in/phone bookings are born `Approved` (rpc_admin_create_booking), so
 * they are naturally excluded — only customer `booking.submit` rows surface.
 */

export interface NotifRow {
  id: string;
  fullName: string;
  /** Play date as YYYY-MM-DD — the authoritative value written by the RPC. */
  date: string;
  /** Total amount in pesos (numeric string, e.g. "1500.00"). */
  total: string;
  /** Number of individual booked slots (booking_slots rows). */
  slotCount: number;
  /** UTC ISO string (bookings.created_at). */
  createdAt: string;
}

/** localStorage key holding the JSON array of viewed booking ids (FIFO). */
export const VIEWED_IDS_KEY = "admin.notif.viewedIds";
/** localStorage flag ("1") set after the first-visit seeding so reloads keep unviewed state. */
export const SEEDED_KEY = "admin.notif.seeded";
/** Cap on the viewed-ids array to bound localStorage growth (FIFO drop-oldest). */
export const VIEWED_IDS_CAP = 1000;

/** Poll cadence for the bell while the admin shell is mounted. */
export const POLL_INTERVAL_MS = 30_000;

/** How many pending bookings the route returns (newest-first). */
export const NOTIF_LIST_LIMIT = 20;

/**
 * The unread rows: pending bookings whose id is NOT in the viewed set. This
 * is what the bell lists and what the badge counts. Order is preserved
 * (the route returns newest-first).
 */
export function filterUnviewed(
  rows: readonly NotifRow[],
  viewedIds: ReadonlySet<string>,
): NotifRow[] {
  return rows.filter((r) => !viewedIds.has(r.id));
}

/**
 * Merge `additions` into the viewed-ids array, de-duplicating and capping to
 * `cap` (drop oldest = front). Returns a fresh array safe to persist. Used
 * both for the first-visit seed (additions = every current pending id) and
 * for per-booking "view this one" clicks.
 */
export function mergeViewed(
  existing: readonly string[],
  additions: readonly string[],
  cap: number,
): string[] {
  const seen = new Set(existing);
  const merged = [...existing];
  for (const id of additions) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  if (merged.length > cap) return merged.slice(merged.length - cap);
  return merged;
}

/**
 * Rows created strictly after the previous poll's newest `createdAt`. The
 * bell toasts these as "new booking received" arrivals. `prevMaxMs` is
 * floored at the current time on first seed so the baseline set never toasts
 * (loading the page must not fire a burst of toasts for bookings that were
 * already pending). Returns oldest-first so the toast for the earliest
 * arrival reads as the "first" new booking.
 */
export function newArrivals(rows: NotifRow[], prevMaxMs: number): NotifRow[] {
  if (!Number.isFinite(prevMaxMs)) return [];
  return rows
    .filter((r) => new Date(r.createdAt).getTime() > prevMaxMs)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

/**
 * Manila-pinned display date — e.g. "October 19, 2026". Mirrors
 * `formatBookingDate` in `@/lib/admin/bookings` but lives here so the client
 * component does not import that server-adjacent module (and pull its graph).
 */
export function formatNotifDate(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Total as "₱1,500.00" (en-PH, two decimals). Mirrors the `pesos()` helper
 * used by the admin bookings table — kept here so the client does not import
 * the server-adjacent bookings module.
 */
export function formatNotifTotal(total: string): string {
  return `₱${Number(total).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Relative "received" time for the row, e.g. "just now", "5m ago", "3h ago",
 * "2d ago", "1w ago". `nowMs` is taken explicitly so the helper is pure and
 * testable; the component passes Date.now(). Future timestamps (clock skew)
 * collapse to "just now".
 */
export function formatRelativeTime(iso: string, nowMs: number): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const diff = nowMs - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return `${Math.floor(diff / 604_800_000)}w ago`;
}

/**
 * One-line toast description summarising the booking:
 * "${fullName} — ${date} · ₱${total} · ${slotCount} slot(s)".
 */
export function formatNotifDescription(row: NotifRow): string {
  const date = formatNotifDate(row.date);
  const slotWord = row.slotCount === 1 ? "slot" : "slots";
  return `${row.fullName} — ${date} · ${formatNotifTotal(row.total)} · ${row.slotCount} ${slotWord}`;
}
