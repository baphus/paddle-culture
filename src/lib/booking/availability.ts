import type { Db } from "@/db/client";
import { LIVE_SLOT_STATES } from "./constants";
import { isSlotOpen, loadOpenRules } from "./hours";
import { isFutureSlot, slotsForDate, type SlotInstant } from "./slots";

// All Drizzle ORM imports replaced with @supabase/supabase-js HTTP client.

export type SlotState = "free" | "held" | "pending" | "approved";

export interface SlotAvailability {
  index: number;
  start: string;
  state: SlotState;
  bookable: boolean;
}

export interface CourtAvailability {
  courtId: string;
  slots: SlotAvailability[];
}

const STATE_PRECEDENCE: Record<SlotState, number> = {
  free: 0,
  held: 1,
  pending: 2,
  approved: 3,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isLiveState(s: string): s is Exclude<SlotState, "free"> {
  return (LIVE_SLOT_STATES as readonly string[]).includes(s);
}

/** Booked/held state for every (court, slot-start) in a window, keyed
 *  `courtId|epochMs`. Shared by the per-day and per-month readers so the
 *  precedence merge exists exactly once. */
function buildStateMap(
  jobRows: Array<{ court_id: string; slot_start: string; state?: string }>,
  holdRows: Array<{ court_id: string; slot_start: string }>,
): Map<string, SlotState> {
  const key = (courtId: string, t: number) => `${courtId}|${t}`;
  const slotState = new Map<string, SlotState>();

  for (const r of jobRows) {
    if (!r.state || !isLiveState(r.state)) continue;
    const k = key(r.court_id, new Date(r.slot_start).getTime());
    const prev = slotState.get(k) ?? "free";
    if (STATE_PRECEDENCE[r.state as SlotState] > STATE_PRECEDENCE[prev]) {
      slotState.set(k, r.state as SlotState);
    }
  }
  for (const r of holdRows) {
    const k = key(r.court_id, new Date(r.slot_start).getTime());
    if ((STATE_PRECEDENCE[slotState.get(k) ?? "free"] ?? 0) < STATE_PRECEDENCE.held) {
      slotState.set(k, "held");
    }
  }
  return slotState;
}

/**
 * Availability for every slot-start the caller names, resolved against one
 * rules window.
 *
 * Split out from `getAvailability` so a whole month can be read in a single
 * pass of five DB calls instead of five per day. `instants` must be the exact
 * grid slot starts for the dates in question — everything else (pricing bands,
 * past-ness, closures, hours) is derived per instant, so a month-wide ruleset
 * works unchanged.
 */
export async function getAvailabilityForInstants(
  db: Db,
  args: { instants: SlotInstant[]; courtIds: string[] },
): Promise<CourtAvailability[]> {
  const { instants, courtIds } = args;
  if (instants.length === 0) return courtIds.map((courtId) => ({ courtId, slots: [] }));

  const now = new Date();
  const times = instants.map((s) => s.start.getTime());
  const from = new Date(Math.min(...times) - 3_600_000);
  const to = new Date(Math.max(...times) + 2 * 3_600_000);

  // ── Slots + holds + operating hours/closures, issued together ────────────
  const [slotRes, holdRes, rules] = await Promise.all([
    // Live booking_slots rows overlapping the window. Range predicates (not a
    // giant `in` list) so a month's ~650 starts don't bloat the URL.
    db
      .from("booking_slots")
      .select("court_id,slot_start,state")
      .in("court_id", courtIds)
      .gte("slot_start", from.toISOString())
      .lte("slot_start", to.toISOString())
      .in("state", [...LIVE_SLOT_STATES]),
    // Live holds rows (server clock: expires_at > now())
    db
      .from("holds")
      .select("court_id,slot_start")
      .in("court_id", courtIds)
      .gte("slot_start", from.toISOString())
      .lte("slot_start", to.toISOString())
      .gt("expires_at", now.toISOString()),
    loadOpenRules(db, { courtIds, from, to }),
  ]);

  const { data: slotData, error: slotError } = slotRes;
  if (slotError) throw new Error(slotError.message);

  const { data: holdData, error: holdError } = holdRes;
  if (holdError) throw new Error(holdError.message);

  const slotState = buildStateMap(slotData ?? [], holdData ?? []);
  const key = (courtId: string, t: number) => `${courtId}|${t}`;

  return courtIds.map((courtId) => ({
    courtId,
    slots: instants.map(({ index, start }) => {
      const state = slotState.get(key(courtId, start.getTime())) ?? "free";
      return {
        index,
        start: start.toISOString(),
        state,
        bookable:
          state === "free" &&
          isFutureSlot(start, now) &&
          isSlotOpen(rules, courtId, start),
      };
    }),
  }));
}

/** Every date string (YYYY-MM-DD) in a "YYYY-MM" month. */
export function datesInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const len = new Date(Date.UTC(y as number, m as number, 0, 12)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= len; d++) out.push(`${month}-${pad2(d)}`);
  return out;
}

/**
 * Split flat per-court availability into `days[date][courtId] = slots`.
 *
 * Each instant is attributed to its Manila calendar date, where the booking
 * UI shows it.
 */
export function groupByDate(
  month: string,
  courtIds: string[],
  perCourt: CourtAvailability[],
): Record<string, Record<string, SlotAvailability[]>> {
  const owner = new Map<string, string>();
  for (const date of datesInMonth(month)) {
    for (const inst of slotsForDate(date)) owner.set(inst.start.toISOString(), date);
  }
  const days: Record<string, Record<string, SlotAvailability[]>> = Object.fromEntries(
    datesInMonth(month).map((d) => [d, Object.fromEntries(courtIds.map((c) => [c, []]))]),
  );
  for (const court of perCourt) {
    for (const slot of court.slots) {
      const date = owner.get(slot.start);
      if (date) days[date]![court.courtId]!.push(slot);
    }
  }
  return days;
}

/**
 * Availability read (ADR-03): DB is source of truth. Lazy expiry — holds
 * count only when expires_at > now() enforced server-side (DB clock).
 */
export async function getAvailability(
  db: Db,
  args: { date: string; courtIds: string[] },
): Promise<CourtAvailability[]> {
  return getAvailabilityForInstants(db, {
    instants: slotsForDate(args.date),
    courtIds: args.courtIds,
  });
}
