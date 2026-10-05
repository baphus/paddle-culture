import { randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { NextResponse, after } from "next/server";
import { getDb } from "@/db/client";
import {
  auditLog,
  bookingRentals,
  bookingSlots,
  bookings,
  courts,
  emailOutbox,
  holds,
  idempotencyKeys,
  paymentProofs,
} from "@/db/schema";
import {
  LIVE_SLOT_STATES,
  OUTBOX_TEMPLATE_CUSTOMER_SUBMITTED,
  OUTBOX_TEMPLATE_OWNER_ALERT,
  OWNER_ALERT_EMAIL,
} from "@/lib/booking/constants";
import { LaneError, err } from "@/lib/booking/errors";
import { assertSlotsOpen } from "@/lib/booking/hours";
import { recalculateTotal } from "@/lib/booking/pricing";
import { verifyProofFile } from "@/lib/booking/proof";
import { isFutureSlot, isOnSlotGrid } from "@/lib/booking/slots";
import { submitBodySchema } from "@/lib/booking/validation";
import { drainOutboxBestEffort } from "@/lib/mail/worker";

export const runtime = "nodejs";

// POST /api/submit — one serializable transaction (ADR-03):
//   idempotency insert → delete expired holds → load holds FOR UPDATE →
//   re-validate availability (live booking_slots FOR UPDATE) → server-side
//   total recalc → insert booking (Pending) + slots + rentals + proof →
//   delete holds → insert outbox rows (customer + owner alert) + audit →
//   stamp idempotency key.
// Proof verification (Storage network I/O) happens BEFORE the transaction;
// safe because proof files are immutable (no update/delete path).
// The booking_slots partial unique index is the final overlap arbiter:
// a concurrent winner surfaces here as 23505 → 409 SLOT_TAKEN.
export async function POST(request: Request) {
  try {
    const parsed = submitBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    let db;
    try {
      db = getDb();
    } catch {
      return err("NOT_CONFIGURED", "Database is not configured.", 500);
    }
    const body = parsed.data;
    if (new Set(body.holdTokens).size !== body.holdTokens.length) {
      return err("DUPLICATE_HOLD_TOKEN", "Duplicate hold tokens in request.", 400);
    }

    const proof = await verifyProofFile(body.proof);
    const email = body.customer.email.toLowerCase();

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);

      // Idempotency: first writer wins; replays return the original booking.
      const claimed = await tx
        .insert(idempotencyKeys)
        .values({ key: body.idempotencyKey })
        .onConflictDoNothing({ target: idempotencyKeys.key })
        .returning({ key: idempotencyKeys.key });
      if (claimed.length === 0) {
        const prior = await tx
          .select({ bookingId: idempotencyKeys.bookingId })
          .from(idempotencyKeys)
          .where(eq(idempotencyKeys.key, body.idempotencyKey));
        const priorBookingId = prior[0]?.bookingId ?? null;
        if (!priorBookingId) {
          throw new LaneError(
            "IDEMPOTENCY_IN_PROGRESS",
            "A submission with this key is already being processed. Retry shortly.",
            409,
          );
        }
        const existing = await tx
          .select({
            trackingToken: bookings.trackingToken,
            trackingCode: bookings.trackingCode,
            total: bookings.total,
            status: bookings.status,
          })
          .from(bookings)
          .where(eq(bookings.id, priorBookingId));
        const row = existing[0];
        if (!row) throw new LaneError("INTERNAL", "Prior submission is unreadable.", 500);
        return {
          trackingToken: row.trackingToken,
          trackingCode: row.trackingCode,
          total: row.total,
          status: row.status,
          deduped: true,
        };
      }

      // Lazy expiry (server clock): drop dead holds.
      await tx.delete(holds).where(lte(holds.expiresAt, sql`now()`));

      // Load + lock the caller's holds; any missing token = expired/unknown.
      const holdRows = await tx
        .select()
        .from(holds)
        .where(inArray(holds.holdToken, body.holdTokens))
        .for("update");
      if (holdRows.length !== body.holdTokens.length) {
        throw new LaneError(
          "HOLD_INVALID",
          "One or more holds are missing or expired. Re-select your slots.",
          409,
        );
      }
      const slotPairs = holdRows.map((h) => ({
        courtId: h.courtId,
        start: h.slotStart,
      }));
      for (const p of slotPairs) {
        if (!isOnSlotGrid(p.start) || !isFutureSlot(p.start)) {
          throw new LaneError("SLOT_INVALID", "A held slot is no longer bookable.", 422);
        }
      }
      // Operating hours / closures re-check (same helper as availability).
      await assertSlotsOpen(tx, slotPairs);

      // Re-validate availability under lock: no live booking_slots row may
      // exist for any requested (court, slot).
      const clashConds = slotPairs.map((p) =>
        and(eq(bookingSlots.courtId, p.courtId), eq(bookingSlots.slotStart, p.start)),
      );
      const clashes = await tx
        .select({ courtId: bookingSlots.courtId })
        .from(bookingSlots)
        .where(
          and(or(...clashConds), inArray(bookingSlots.state, [...LIVE_SLOT_STATES])),
        )
        .for("update");
      if (clashes.length > 0) {
        throw new LaneError(
          "SLOT_TAKEN",
          "A selected slot was just taken. Please pick another time.",
          409,
        );
      }

      // Server-side total recalc — never trust a client total.
      const { total, lines } = await recalculateTotal(tx, {
        slots: slotPairs,
        paddleQty: body.rentals.paddleQty,
        paddleHours: body.rentals.paddleHours,
        ball: body.rentals.ball,
      });

      const trackingToken = randomBytes(32).toString("hex");
      // 5-char uppercase alphanumeric tracking code (human-readable, shown at front desk).
      // Charset: A-Z0-9 (36^5 = ~60 million combos). Retry up to 5× on the
      // rare uniqueness collision before surfacing an error.
      let trackingCode = generateTrackingCode();
      let inserted: { id: string }[];
      let codeAttempts = 0;
      while (true) {
        try {
          inserted = await tx
            .insert(bookings)
            .values({
              trackingToken,
              trackingCode,
              status: "Pending",
              fullName: body.customer.fullName,
              email,
              phone: body.customer.phone,
              total,
            })
            .returning({ id: bookings.id });
          break;
        } catch (insertErr) {
          if (isTrackingCodeViolation(insertErr) && codeAttempts < 4) {
            codeAttempts++;
            trackingCode = generateTrackingCode();
            continue;
          }
          throw insertErr;
        }
      }
      const bookingId = (inserted[0] as { id: string }).id;

      await tx.insert(bookingSlots).values(
        slotPairs.map((p) => ({
          bookingId,
          courtId: p.courtId,
          slotStart: p.start,
          state: "pending",
        })),
      );
      await tx.insert(bookingRentals).values({
        bookingId,
        paddleQty: body.rentals.paddleQty,
        paddleHours:
          body.rentals.paddleQty > 0
            ? String(body.rentals.paddleHours ?? slotPairs.length)
            : null,
        ballFee: body.rentals.ball
          ? (lines.find((l) => l.kind === "ball")?.amount ?? null)
          : null,
      });
      // Proof-mandatory hard gate: booking row only exists alongside this row.
      // Single-file rule: a proof path can back at most one booking, so a
      // customer cannot recycle one payment screenshot across bookings.
      const reused = await tx
        .select({ bookingId: paymentProofs.bookingId })
        .from(paymentProofs)
        .where(eq(paymentProofs.path, proof.path))
        .for("update");
      if (reused.length > 0) {
        throw new LaneError(
          "PROOF_ALREADY_USED",
          "This payment proof was already used for another booking.",
          409,
        );
      }
      await tx.insert(paymentProofs).values({
        bookingId,
        path: proof.path,
        mime: proof.mime,
        bytes: proof.bytes,
      });

      await tx.delete(holds).where(inArray(holds.holdToken, body.holdTokens));

      // Fetch court names for the outbox payload so emails show human-readable names.
      const courtIds = [...new Set(slotPairs.map((p) => p.courtId))];
      const courtRows = await tx
        .select({ id: courts.id, name: courts.name })
        .from(courts)
        .where(inArray(courts.id, courtIds));
      const courtNameById = new Map(courtRows.map((c) => [c.id, c.name]));

      const slotSummary = slotPairs.map((p) => ({
        courtId: p.courtId,
        courtName: courtNameById.get(p.courtId) ?? p.courtId,
        slotStart: p.start.toISOString(),
      }));
      const now = new Date();
      // ADR-05 split: submit writes customer + owner rows; the approve/reject
      // email is written by the admin-decision lane (ADR-03's "3 rows" at
      // submit is superseded).
      await tx.insert(emailOutbox).values([
        {
          bookingId,
          template: OUTBOX_TEMPLATE_CUSTOMER_SUBMITTED,
          toAddr: email,
          payload: {
            trackingToken,
            fullName: body.customer.fullName,
            email,
            phone: body.customer.phone,
            slots: slotSummary,
            total,
            lines,
          },
          status: "pending",
          attempts: 0,
          nextAttemptAt: now,
        },
        {
          bookingId,
          template: OUTBOX_TEMPLATE_OWNER_ALERT,
          toAddr: OWNER_ALERT_EMAIL,
          payload: {
            trackingToken,
            fullName: body.customer.fullName,
            email,
            phone: body.customer.phone,
            slots: slotSummary,
            total,
            lines,
          },
          status: "pending",
          attempts: 0,
          nextAttemptAt: now,
        },
      ]);

      await tx.insert(auditLog).values({
        actor: email,
        action: "booking.submit",
        entity: "booking",
        entityId: bookingId,
        after: { trackingToken, trackingCode, total, status: "Pending", slots: slotSummary },
      });

      await tx
        .update(idempotencyKeys)
        .set({ bookingId })
        .where(eq(idempotencyKeys.key, body.idempotencyKey));

      return { trackingToken, trackingCode, total, status: "Pending", deduped: false };
    });

    // Background send: schedule the drain with `after()` so the response
    // returns instantly without waiting for SMTP. Best-effort — a mail
    // failure only logs; the outbox row stays retryable and the cron remains
    // as backstop. Skipped on idempotent replays (nothing new was enqueued).
    if (!result.deduped) after(() => drainOutboxBestEffort().catch(() => {}));

    return NextResponse.json(result, { status: result.deduped ? 200 : 201 });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    if (isUniqueViolation(e)) {
      return err(
        "SLOT_TAKEN",
        "A selected slot was just taken. Please pick another time.",
        409,
      );
    }
    console.error("submit failed", e);
    Sentry.captureException(e);
    return err("INTERNAL", "Submission failed.", 500);
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

/** Generates a 5-character uppercase alphanumeric tracking code (A-Z0-9). */
function generateTrackingCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(5);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/** True when a 23505 unique violation is on the tracking_code column specifically. */
function isTrackingCodeViolation(e: unknown): boolean {
  if (
    typeof e !== "object" ||
    e === null ||
    !("code" in e) ||
    (e as { code?: unknown }).code !== "23505"
  )
    return false;
  const detail = (e as { detail?: unknown }).detail;
  const constraint = (e as { constraint?: unknown }).constraint;
  if (typeof constraint === "string" && constraint.includes("tracking_code")) return true;
  if (typeof detail === "string" && detail.includes("tracking_code")) return true;
  return false;
}
