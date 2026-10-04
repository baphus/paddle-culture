import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { bookingSlots, holds } from "@/db/schema";
import { LIVE_SLOT_STATES } from "./constants";
import { isSlotOpen, loadOpenRules } from "./hours";
import { isFutureSlot, slotsForDate } from "./slots";

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
 * booking_slots rows in a live state outrank holds. Past slots report
 * state but bookable:false (slot_start > now() enforced server-side).
 */
export async function getAvailability(
  db: Db,
  args: { date: string; courtIds: string[] },
): Promise<CourtAvailability[]> {
  const instants = slotsForDate(args.date);
  const starts = instants.map((s) => s.start);
  const now = new Date();

  const slotConds = starts.flatMap((start) =>
    args.courtIds.map((courtId) =>
      and(eq(bookingSlots.courtId, courtId), eq(bookingSlots.slotStart, start)),
    ),
  );
  const liveSlotRows = await db
    .select({
      courtId: bookingSlots.courtId,
      slotStart: bookingSlots.slotStart,
      state: bookingSlots.state,
    })
    .from(bookingSlots)
    .where(
      and(
        or(...slotConds),
        inArray(bookingSlots.state, [...LIVE_SLOT_STATES]),
      ),
    );

  const holdConds = starts.flatMap((start) =>
    args.courtIds.map((courtId) =>
      and(eq(holds.courtId, courtId), eq(holds.slotStart, start)),
    ),
  );
  const liveHoldRows = await db
    .select({ courtId: holds.courtId, slotStart: holds.slotStart })
    .from(holds)
    .where(and(or(...holdConds), gt(holds.expiresAt, sql`now()`)));

  const key = (courtId: string, t: number) => `${courtId}|${t}`;
  const slotState = new Map<string, SlotState>();
  for (const r of liveSlotRows) {
    if (!isLiveState(r.state)) continue;
    const k = key(r.courtId, r.slotStart.getTime());
    const prev = slotState.get(k) ?? "free";
    if (STATE_PRECEDENCE[r.state] > STATE_PRECEDENCE[prev]) {
      slotState.set(k, r.state);
    }
  }
  for (const r of liveHoldRows) {
    const k = key(r.courtId, r.slotStart.getTime());
    if ((STATE_PRECEDENCE[slotState.get(k) ?? "free"] ?? 0) < STATE_PRECEDENCE.held) {
      slotState.set(k, "held");
    }
  }

  // Operating hours / closures: closed slots stay visible with their state
  // but are never bookable (read-only rule load).
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
