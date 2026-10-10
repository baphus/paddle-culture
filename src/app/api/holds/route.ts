import { randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAvailability } from "@/lib/booking/availability";
import { HOLD_TTL_MINUTES, MAX_SLOTS_PER_BOOKING } from "@/lib/booking/constants";
import { LaneError, err } from "@/lib/booking/errors";
import { isFutureSlot, isOnSlotGrid, selectionDateStr } from "@/lib/booking/slots";
import { holdsBodySchema, releaseHoldsBodySchema } from "@/lib/booking/validation";

export const runtime = "nodejs";

// POST /api/holds
export async function POST(request: Request) {
  try {
    const parsed = holdsBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    let db;
    try {
      db = getDb();
    } catch {
      return err("NOT_CONFIGURED", "Database is not configured.", 500);
    }

    const courtIds =
      parsed.data.courtIds ?? ([parsed.data.courtId] as string[]);
    if (new Set(courtIds).size !== courtIds.length) {
      return err("DUPLICATE_COURT", "Duplicate courts in request.", 400);
    }

    const { data: courtRows, error: courtError } = await db
      .from("courts")
      .select("id,status")
      .in("id", courtIds);
    if (courtError) return err("INTERNAL", "Could not verify courts.", 500);
    if ((courtRows ?? []).length !== courtIds.length) {
      return err("UNKNOWN_COURT", "One or more courts do not exist.", 404);
    }
    const inactive = (courtRows as { id: string; status: string }[]).find(
      (c) => c.status !== "active",
    );
    if (inactive) {
      return err("COURT_UNAVAILABLE", "A selected court is not bookable.", 409);
    }

    const starts = parsed.data.slotStarts.map((s) => new Date(s));
    for (const start of starts) {
      if (!isOnSlotGrid(start)) {
        return err("OFF_GRID", `Slot ${start.toISOString()} is not on the hourly grid.`, 400);
      }
      if (!isFutureSlot(start)) {
        return err("SLOT_PAST", `Slot ${start.toISOString()} is not in the future.`, 422);
      }
    }
    const seen = new Set(starts.map((s) => s.getTime()));
    if (seen.size !== starts.length) {
      return err("DUPLICATE_SLOT", "Duplicate slots in request.", 400);
    }
    if (starts.length > MAX_SLOTS_PER_BOOKING) {
      return err("TOO_MANY_SLOTS", `Max ${MAX_SLOTS_PER_BOOKING} slots per booking.`, 400);
    }
    if (starts.length * courtIds.length > MAX_SLOTS_PER_BOOKING) {
      return err(
        "TOO_MANY_SLOTS",
        `Max ${MAX_SLOTS_PER_BOOKING} court-hours per booking (courts × hours).`,
        400,
      );
    }

    const byDate = new Map<string, Date[]>();
    for (const s of starts) {
      const d = selectionDateStr(s);
      const list = byDate.get(d);
      if (list) list.push(s);
      else byDate.set(d, [s]);
    }
    const openByPair = new Map<string, boolean>();
    for (const [date] of byDate) {
      const avail = await getAvailability(db, { date, courtIds });
      for (const court of avail) {
        for (const s of court.slots) {
          openByPair.set(`${court.courtId}|${new Date(s.start).getTime()}`, s.bookable);
        }
      }
    }
    for (const courtId of courtIds) {
      for (const start of starts) {
        if (!openByPair.get(`${courtId}|${start.getTime()}`)) {
          return err(
            "SLOT_UNAVAILABLE",
            `Slot ${start.toISOString()} on court ${courtId} is not available.`,
            409,
          );
        }
      }
    }

    const expiresAt = new Date(Date.now() + HOLD_TTL_MINUTES * 60_000);
    const pairs = courtIds.flatMap((courtId) =>
      starts.map((start) => ({ courtId, start })),
    );
    const buildRows = () =>
      pairs.map((p) => ({
        hold_token: randomBytes(16).toString("hex"),
        court_id: p.courtId,
        slot_start: p.start.toISOString(),
        expires_at: expiresAt.toISOString(),
      }));

    // Expired holds live until a DELETE reaches them, and a lingering row
    // would block this (court, slot) forever — even though availability.ts
    // ignores expired holds and would offer the slot. Delete the expired rows
    // for exactly the pairs we are about to insert (courtIds × slotStarts is
    // the full cross product, so these two .in() filters are the pair set).
    // Deleting an expired row costs its owner nothing: submit already requires
    // expires_at > now(), so that row was dead on arrival.
    await db
      .from("holds")
      .delete()
      .in("court_id", courtIds)
      .in(
        "slot_start",
        starts.map((s) => s.toISOString()),
      )
      .lte("expires_at", new Date().toISOString());

    let rows = buildRows();
    let insertError;
    ({ error: insertError } = await db.from("holds").insert(rows));
    if (insertError) {
      if (isUniqueViolation(insertError)) {
        // Two possible causes now that holds_court_slot_unique_idx exists:
        //   1. someone else already holds this (court, slot) — a real clash
        //   2. the random 128-bit hold_token collided — essentially never
        // Distinguish by constraint name and only retry on (2), so a genuine
        // clash surfaces as 409 instead of a confusing 500 after a retry.
        if (isSlotHoldViolation(insertError)) {
          throw new LaneError(
            "SLOT_TAKEN",
            "That slot was just taken by another session. Pick a different time.",
            409,
          );
        }
        // Token collision: single retry with fresh tokens
        rows = buildRows();
        const retryResult = await db.from("holds").insert(rows);
        if (retryResult.error) throw retryResult.error;
      } else {
        throw insertError;
      }
    }

    return NextResponse.json({
      holds: rows.map((r) => ({
        holdToken: r.hold_token,
        courtId: r.court_id,
        slotStart: r.slot_start,
      })),
      expiresAt: expiresAt.toISOString(),
      deadlineMs: expiresAt.getTime(),
    });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("holds failed", e);
    Sentry.captureException(e);
    return err("INTERNAL", "Hold creation failed.", 500);
  }
}

// DELETE /api/holds
export async function DELETE(request: Request) {
  try {
    const parsed = releaseHoldsBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    let db;
    try {
      db = getDb();
    } catch {
      return err("NOT_CONFIGURED", "Database is not configured.", 500);
    }
    await db
      .from("holds")
      .delete()
      .in("hold_token", parsed.data.holdTokens)
      .gt("expires_at", new Date().toISOString());
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("hold release failed", e);
    Sentry.captureException(e);
    return err("INTERNAL", "Could not release held slots.", 500);
  }
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "23505"
  );
}

/**
 * True when a 23505 came from holds_court_slot_unique_idx — i.e. another
 * session already holds this (court, slot). PostgREST reports the index name
 * in `constraint` and the detail text; check both so a trust-boundary
 * mismatch in either field cannot turn a clash into a silent retry.
 */
function isSlotHoldViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const constraint = (e as { constraint?: unknown }).constraint;
  const detail = (e as { detail?: unknown }).detail;
  const message = (e as { message?: unknown }).message;
  for (const field of [constraint, detail, message]) {
    if (typeof field === "string" && field.includes("holds_court_slot_unique_idx")) {
      return true;
    }
  }
  return false;
}
