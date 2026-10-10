import type { Db } from "@/db/client";
import { LIVE_SLOT_STATES } from "./constants";
import { isSlotOpen, loadOpenRules } from "./hours";
import { isFutureSlot, slotsForDate } from "./slots";

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

function isLiveState(s: string): s is Exclude<SlotState, "free"> {
  return (LIVE_SLOT_STATES as readonly string[]).includes(s);
}

/**
 * Availability read (ADR-03): DB is source of truth. Lazy expiry — holds
 * count only when expires_at > now() enforced server-side (DB clock).
 */
export async function getAvailability(
  db: Db,
  args: { date: string; courtIds: string[] },
): Promise<CourtAvailability[]> {
  const instants = slotsForDate(args.date);
  const starts = instants.map((s) => s.start);
  const now = new Date();

  // Build ISO strings for the slot starts in this date
  const startIsos = starts.map((s) => s.toISOString());

  // ── Live booking_slots rows ──────────────────────────────────────────────
  // Filter: court_id in courtIds AND slot_start in startIsos AND state in LIVE_SLOT_STATES
  const { data: slotData, error: slotError } = await db
    .from("booking_slots")
    .select("court_id,slot_start,state")
    .in("court_id", args.courtIds)
    .in("slot_start", startIsos)
    .in("state", [...LIVE_SLOT_STATES]);

  if (slotError) throw new Error(slotError.message);

  // ── Live holds rows (server clock: expires_at > now()) ───────────────────
  const { data: holdData, error: holdError } = await db
    .from("holds")
    .select("court_id,slot_start")
    .in("court_id", args.courtIds)
    .in("slot_start", startIsos)
    .gt("expires_at", new Date().toISOString());

  if (holdError) throw new Error(holdError.message);

  const key = (courtId: string, t: number) => `${courtId}|${t}`;
  const slotState = new Map<string, SlotState>();

  for (const r of slotData ?? []) {
    if (!isLiveState(r.state)) continue;
    const k = key(r.court_id, new Date(r.slot_start).getTime());
    const prev = slotState.get(k) ?? "free";
    if (STATE_PRECEDENCE[r.state as SlotState] > STATE_PRECEDENCE[prev]) {
      slotState.set(k, r.state as SlotState);
    }
  }
  for (const r of holdData ?? []) {
    const k = key(r.court_id, new Date(r.slot_start).getTime());
    if ((STATE_PRECEDENCE[slotState.get(k) ?? "free"] ?? 0) < STATE_PRECEDENCE.held) {
      slotState.set(k, "held");
    }
  }

  // ── Operating hours / closures ────────────────────────────────────────────
  const ruleTimes = starts.map((s) => s.getTime());
  const rules = await loadOpenRules(db, {
    courtIds: args.courtIds,
    from: new Date(Math.min(...ruleTimes) - 3_600_000),
    to: new Date(Math.max(...ruleTimes) + 2 * 3_600_000),
  });

  return args.courtIds.map((courtId) => ({
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
