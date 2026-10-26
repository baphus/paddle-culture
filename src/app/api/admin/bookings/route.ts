import * as Sentry from "@sentry/nextjs";
import { NextResponse, after } from "next/server";
import { LIVE_SLOT_STATES } from "@/lib/booking/constants";
import { LaneError, err } from "@/lib/booking/errors";
import { assertSlotsOpen } from "@/lib/booking/hours";
import { recalculateTotal } from "@/lib/booking/pricing";
import { verifyProofFile } from "@/lib/booking/proof";
import { isBookableSlot, isOnSlotGrid } from "@/lib/booking/slots";
import { adminCreateBookingBodySchema } from "@/lib/booking/validation";
import { createBookingAdmin } from "@/lib/admin/bookings";
import { getDbOrThrow } from "@/lib/admin/decisions";
import { requireAdmin } from "@/lib/admin/session";
import { drainOutboxBestEffort } from "@/lib/mail/worker";

export const runtime = "nodejs";

// POST /api/admin/bookings — admin-only walk-in / phone booking (Q1–Q16).
//
// Same pre-flight checks as POST /api/submit, minus holds and plus the admin
// extras: slots are picked directly off the live grid, the booking is born
// Approved, the proof is optional, and the customer email is opt-in.
//
// Ordering note: the proof is verified BEFORE the RPC because it is immutable
// storage I/O and must not run inside the write transaction; the RPC re-checks
// reuse under FOR UPDATE.
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();

    const parsed = adminCreateBookingBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const body = parsed.data;
    const db = getDbOrThrow();

    const slotPairs = body.slots.map((s) => ({
      courtId: s.courtId,
      start: new Date(s.slotStart),
    }));

    // Future-only, and on the hourly Manila calendar-day grid.
    for (const p of slotPairs) {
      if (!isOnSlotGrid(p.start) || !isBookableSlot(p.start)) {
        return err("SLOT_INVALID", "That slot is no longer bookable.", 422);
      }
    }

    // Q7: operating hours and closures are enforced — the admin edits the
    // hours record rather than punching through it.
    await assertSlotsOpen(db, slotPairs);

    const startIsos = slotPairs.map((p) => p.start.toISOString());
    const courtIds = [...new Set(slotPairs.map((p) => p.courtId))];

    // Fast-fail on live bookings. Held slots are *not* a failure here — Q15
    // says the admin overrides them and the RPC evicts the rows.
    const { data: clashRows, error: clashError } = await db
      .from("booking_slots")
      .select("court_id")
      .in("court_id", courtIds)
      .in("slot_start", startIsos)
      .in("state", [...LIVE_SLOT_STATES]);

    if (clashError) return err("INTERNAL", "Could not check availability.", 500);
    if ((clashRows ?? []).length > 0) {
      return err(
        "SLOT_TAKEN",
        "A selected slot is already booked. Pick another time.",
        409,
      );
    }

    // Verify every court exists — otherwise the RPC inserts slots against a
    // dangling id and the failure only surfaces later as a bad tracking page.
    const { data: courtRows } = await db.from("courts").select("id,name").in("id", courtIds);
    const courtNames = new Map(
      ((courtRows ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
    );
    if (courtNames.size !== courtIds.length) {
      return err("COURT_NOT_FOUND", "One or more courts no longer exist.", 404);
    }

    // Q5: server-side recalc, no override. Q2: the proof is optional.
    const [{ total, lines }, proof] = await Promise.all([
      recalculateTotal(db, {
        slots: slotPairs,
        paddleQty: body.rentals.paddleQty,
        paddleHours: body.rentals.paddleHours,
        ball: body.rentals.ball,
      }),
      body.proof ? verifyProofFile(body.proof) : Promise.resolve(null),
    ]);

    const result = await createBookingAdmin(db, admin, {
      body,
      total,
      lines,
      proof,
      courtNames,
    });

    // Q9: no email was written when notify is off, so there is nothing to drain.
    if (!result.deduped && result.notify) {
      after(() => drainOutboxBestEffort().catch(() => {}));
    }

    return NextResponse.json(result, { status: result.deduped ? 200 : 201 });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin create booking failed", e);
    Sentry.captureException(e);
    return err("INTERNAL", "Could not create the booking.", 500);
  }
}
