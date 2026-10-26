import { randomBytes } from "node:crypto";
import type { Db } from "@/db/client";
import { getAvailability } from "./availability";
import { HOLD_GRACE_MINUTES, HOLD_TTL_MINUTES, LIVE_SLOT_STATES, MAX_SLOTS_PER_BOOKING } from "./constants";
import { isBookableSlot, isOnSlotGrid, selectionDateStr } from "./slots";

/**
 * Hold ownership (ADR-03 amendment).
 *
 * A hold row carries an `owner_token` minted in the customer's browser. It
 * exists for exactly one reason: a customer who leaves the page — a refresh,
 * a trip to their banking app — must be able to get back to *their own* hold
 * instead of finding the slots stuck as "held" and a payment already sent.
 *
 * The token is a capability, not an identity: nothing about the person is
 * stored with it. It never widens who may *book* a slot — every write path
 * still re-validates availability, the unique hold index and the slot clash
 * check — it only widens who can *name* a hold row.
 */

export interface HoldOwnerRow {
  hold_token: string;
  court_id: string;
  slot_start: string;
  expires_at: string;
}

/** Length of the reclaim window in milliseconds. */
export function graceWindowMs(): number {
  return HOLD_GRACE_MINUTES * 60_000;
}

/** Cutoff past which an expired hold may no longer be reclaimed. */
export function graceCutoffMs(nowMs = Date.now()): number {
  return nowMs - graceWindowMs();
}

/**
 * True when an expired hold still sits inside the reclaim window, i.e. it
 * expired no earlier than HOLD_GRACE_MINUTES ago.
 */
export function isWithinGrace(expiresAtIso: string, nowMs = Date.now()): boolean {
  return new Date(expiresAtIso).getTime() > graceCutoffMs(nowMs);
}

/** An expired hold's last reclaim moment (expires_at + grace). */
export function reclaimDeadlineMs(expiresAtIso: string): number {
  return new Date(expiresAtIso).getTime() + graceWindowMs();
}

/**
 * Every hold row carrying `ownerToken`, live or not. Callers decide what the
 * expiry means; this read exists so reclaim, proof-upload and submit can all
 * apply the same rule to the same set.
 */
export async function loadHoldRowsByOwner(
  db: Db,
  ownerToken: string,
): Promise<HoldOwnerRow[]> {
  const { data, error } = await db
    .from("holds")
    .select("hold_token,court_id,slot_start,expires_at")
    .eq("owner_token", ownerToken);
  if (error) throw new Error(error.message);
  return (data ?? []) as HoldOwnerRow[];
}

/** True when every named hold token belongs to this owner token. */
export function ownerTokenCovers(rows: HoldOwnerRow[], holdTokens: string[]): boolean {
  const owned = new Set(rows.map((r) => r.hold_token));
  return holdTokens.every((t) => owned.has(t));
}

export type ReclaimFailure = { ok: false; code: string; message: string; status: number };
export type ReclaimSuccess = {
  ok: true;
  /** "live" = still valid, deadline extended. "revived" = re-inserted. */
  status: "live" | "revived";
  rows: HoldOwnerRow[];
  expiresAt: string;
  deadlineMs: number;
};
export type ReclaimResult = ReclaimSuccess | ReclaimFailure;

/**
 * Bring the owner's holds back to life.
 *
 * - live:    every named token still has expires_at > now() → push the
 *            deadline out to a full TTL, rows and tokens unchanged.
 * - revived: the rows expired inside the grace window and every (court, slot)
 *            pair is still free → replace them with fresh rows + tokens under
 *            the same owner token.
 * - failed:  past the grace window, a pair booked/held by someone else, or a
 *            pair that is no longer open for booking.
 *
 * Shared by POST /api/holds/reclaim (explicit "restore my slots" button) and
 * POST /api/submit (a submit that arrives while the hold is lapsing), so both
 * paths can never disagree about whether a reclaim is allowed.
 *
 * `holdTokens` narrows the revival to a page's own subset; omitting it means
 * "everything this owner token has".
 */
export async function reclaimHolds(
  db: Db,
  args: { ownerToken: string; holdTokens?: string[] },
  nowMs = Date.now(),
): Promise<ReclaimResult> {
  const allRows = await loadHoldRowsByOwner(db, args.ownerToken);
  if (allRows.length === 0) {
    return {
      ok: false,
      code: "HOLD_NOT_FOUND",
      message: "We have no saved slots for this session.",
      status: 404,
    };
  }

  const named = args.holdTokens
    ? allRows.filter((r) => args.holdTokens!.includes(r.hold_token))
    : allRows;
  if (named.length === 0 || (args.holdTokens && !ownerTokenCovers(allRows, args.holdTokens))) {
    return {
      ok: false,
      code: "HOLD_INVALID",
      message: "Those slots no longer belong to this session. Re-select your slots.",
      status: 409,
    };
  }

  const expiresAt = new Date(nowMs + HOLD_TTL_MINUTES * 60_000);
  const expiresIso = expiresAt.toISOString();
  const nowIso = new Date(nowMs).toISOString();
  const liveNamed = named.filter((r) => new Date(r.expires_at).getTime() > nowMs);

  // ── 1. Still live: extend the deadline, keep rows and tokens ──────────────
  if (liveNamed.length === named.length) {
    const { error: bumpError } = await db
      .from("holds")
      .update({ expires_at: expiresIso })
      .eq("owner_token", args.ownerToken)
      .in(
        "hold_token",
        named.map((r) => r.hold_token),
      )
      .gt("expires_at", nowIso);
    if (bumpError) throw new Error(bumpError.message);
    return {
      ok: true,
      status: "live",
      rows: named.map((r) => ({ ...r, expires_at: expiresIso })),
      expiresAt: expiresIso,
      deadlineMs: expiresAt.getTime(),
    };
  }

  // ── 2. Expired: only inside the grace window ─────────────────────────────
  if (!named.every((r) => isWithinGrace(r.expires_at, nowMs))) {
    return {
      ok: false,
      code: "RECLAIM_EXPIRED",
      message:
        "Your slots were released because the booking window passed. Please pick your times again.",
      status: 409,
    };
  }
  if (named.length > MAX_SLOTS_PER_BOOKING) {
    return { ok: false, code: "TOO_MANY_SLOTS", message: "Too many slots to restore.", status: 400 };
  }
  for (const r of named) {
    const start = new Date(r.slot_start);
    if (!isOnSlotGrid(start)) {
      return { ok: false, code: "OFF_GRID", message: "A held slot is off the grid.", status: 400 };
    }
    if (!isBookableSlot(start)) {
      return {
        ok: false,
        code: "SLOT_INVALID",
        message: "A slot you held has already ended.",
        status: 422,
      };
    }
  }

  const courtIds = [...new Set(named.map((r) => r.court_id))];
  const startIsos = [...new Set(named.map((r) => r.slot_start))];
  const key = (courtId: string, startIso: string) => `${courtId}|${new Date(startIso).getTime()}`;

  // Booked by someone else since we let go?
  const { data: clashRows, error: clashError } = await db
    .from("booking_slots")
    .select("court_id,slot_start")
    .in("court_id", courtIds)
    .in("slot_start", startIsos)
    .in("state", [...LIVE_SLOT_STATES]);
  if (clashError) throw new Error(clashError.message);

  // Claimed by another session's live hold? (Our own expired rows cannot match
  // expires_at > now().)
  const { data: liveHoldRows, error: liveHoldError } = await db
    .from("holds")
    .select("court_id,slot_start")
    .in("court_id", courtIds)
    .in("slot_start", startIsos)
    .gt("expires_at", nowIso);
  if (liveHoldError) throw new Error(liveHoldError.message);

  const blocked = new Set(
    [...((clashRows ?? []) as { court_id: string; slot_start: string }[]),
     ...((liveHoldRows ?? []) as { court_id: string; slot_start: string }[])].map((r) =>
      key(r.court_id, r.slot_start),
    ),
  );
  if (named.some((r) => blocked.has(key(r.court_id, r.slot_start)))) {
    return {
      ok: false,
      code: "SLOT_TAKEN",
      message: "Someone else took one of your slots while you were away. Please pick a different time.",
      status: 409,
    };
  }

  // Availability also knows closures and operating hours, which a clash query
  // cannot see. One read per selection date.
  const byDate = new Map<string, string[]>();
  for (const iso of startIsos) {
    const d = selectionDateStr(new Date(iso));
    const list = byDate.get(d);
    if (list) list.push(iso);
    else byDate.set(d, [iso]);
  }
  const openByPair = new Map<string, boolean>();
  const availability = await Promise.all(
    [...byDate.keys()].map((date) => getAvailability(db, { date, courtIds })),
  );
  for (const avail of availability) {
    for (const court of avail) {
      for (const s of court.slots) {
        openByPair.set(key(court.courtId, s.start), s.bookable);
      }
    }
  }
  if (named.some((r) => !openByPair.get(key(r.court_id, r.slot_start)))) {
    return {
      ok: false,
      code: "SLOT_CLOSED",
      message: "One of your slots is no longer open for booking. Please pick another time.",
      status: 409,
    };
  }

  // ── 3. Revive: swap the dead rows for fresh rows under the same owner ────
  // One atomic RPC, not DELETE-then-INSERT over two HTTP statements: the
  // window between those two statements let a concurrent submit's FOR UPDATE
  // or another session's insert land on the freed slot. The RPC scopes its
  // delete to this owner_token and these exact pairs, and
  // holds_court_slot_unique_idx arbitrates a true race as 23505.
  const newTokens = named.map(() => randomBytes(16).toString("hex"));
  const { error: swapError } = await db.rpc("rpc_reclaim_holds", {
    p_owner_token: args.ownerToken,
    p_pairs: named.map((r) => ({ court_id: r.court_id, slot_start: r.slot_start })),
    p_expires_at: expiresIso,
    p_new_tokens: newTokens,
  });
  if (swapError) {
    if (isUniqueViolation(swapError)) {
      return {
        ok: false,
        code: "SLOT_TAKEN",
        message: "Someone else took one of your slots while you were away. Please pick a different time.",
        status: 409,
      };
    }
    throw new Error(swapError.message);
  }

  const newRows = named.map((r, i) => ({
    hold_token: newTokens[i]!,
    court_id: r.court_id,
    slot_start: r.slot_start,
    expires_at: expiresIso,
  }));

  return {
    ok: true,
    status: "revived",
    rows: newRows,
    expiresAt: expiresIso,
    deadlineMs: expiresAt.getTime(),
  };
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "23505"
  );
}
