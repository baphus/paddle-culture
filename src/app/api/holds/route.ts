import { randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { and, gt, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { courts, holds } from "@/db/schema";
import { getAvailability } from "@/lib/booking/availability";
import { HOLD_TTL_MINUTES, MAX_SLOTS_PER_BOOKING } from "@/lib/booking/constants";
import { LaneError, err } from "@/lib/booking/errors";
import { isFutureSlot, isOnSlotGrid, selectionDateStr } from "@/lib/booking/slots";
import { holdsBodySchema, releaseHoldsBodySchema } from "@/lib/booking/validation";

export const runtime = "nodejs";

// POST /api/holds — creates one hold row per (court, slot) pair.
// holds.hold_token is the PK, so a booking is an array of single-slot tokens
// that share one deadline (min expires_at). Returns deadlineMs for the
// hand-written client countdown (cosmetic only — server enforces
// expires_at > now()).
//
// Contract:
//   request:  { courtId, slotStarts[] }            (single-court, legacy)  OR
//             { courtIds[], slotStarts[] }         (multi-court: SAME slots
//              reserved on EVERY listed court)
//   response: { holds: [{ holdToken, courtId, slotStart }]  (one row per
//              (court, slot) pair), expiresAt, deadlineMs }
// Total pairs (courts × slots) are capped at MAX_SLOTS_PER_BOOKING so the
// token set always fits the submit/upload-url 12-token limit.
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

    const courtRows = await db
      .select({ id: courts.id, status: courts.status })
      .from(courts)
      .where(inArray(courts.id, courtIds));
    if (courtRows.length !== courtIds.length) {
      return err("UNKNOWN_COURT", "One or more courts do not exist.", 404);
    }
    const inactive = courtRows.find((c) => c.status !== "active");
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
    // Same slots across every court, so consecutiveness is checked once.
    const ordered = [...starts].sort((a, b) => a.getTime() - b.getTime());
    for (let i = 1; i < ordered.length; i++) {
      if ((ordered[i] as Date).getTime() - (ordered[i - 1] as Date).getTime() !== 3_600_000) {
        return err("NON_CONSECUTIVE_SLOTS", "Slots for a court must be consecutive hours.", 400);
      }
    }

    // All requested (court, slot) pairs must be free + bookable right now
    // (re-checked inside the submit transaction — this is a fast-fail only).
    // Grouped by Manila date so bookings crossing midnight check the right
    // day grids.
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
        holdToken: randomBytes(16).toString("hex"),
        courtId: p.courtId,
        slotStart: p.start,
        expiresAt,
      }));
    let rows = buildRows();
    try {
      await db.insert(holds).values(rows);
    } catch (e) {
      if (isUniqueViolation(e)) {
        // Token collision (negligible odds): single retry with fresh tokens.
        rows = buildRows();
        await db.insert(holds).values(rows);
      } else {
        throw e;
      }
    }
    return NextResponse.json({
      holds: rows.map((r) => ({
        holdToken: r.holdToken,
        courtId: r.courtId,
        slotStart: r.slotStart.toISOString(),
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

// DELETE /api/holds — release an unfinished selection immediately. Tokens are
// random capability values and only live, unexpired rows are eligible.
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
      .delete(holds)
      .where(and(inArray(holds.holdToken, parsed.data.holdTokens), gt(holds.expiresAt, new Date())));
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
