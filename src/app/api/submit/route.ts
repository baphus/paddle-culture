import { randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { NextResponse, after } from "next/server";
import { getDb } from "@/db/client";
import {
  LIVE_SLOT_STATES,
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

// POST /api/submit — stateless Supabase HTTP path.
//
// Pre-transaction checks (proof verification, hours, availability) are
// performed outside the RPC as before (proof I/O is immutable, safe before
// the write). The atomic write path is delegated to rpc_submit_booking which
// runs inside a SERIALIZABLE Postgres transaction server-side.
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

    // Storage I/O before the transaction — proof files are immutable.
    const proof = await verifyProofFile(body.proof);
    const email = body.customer.email.toLowerCase();

    // ── Load + validate holds ──────────────────────────────────────────────
    const { data: holdRows, error: holdError } = await db
      .from("holds")
      .select("hold_token,court_id,slot_start,expires_at")
      .in("hold_token", body.holdTokens)
      .gt("expires_at", new Date().toISOString());

    if (holdError) return err("INTERNAL", "Could not read holds.", 500);
    if ((holdRows ?? []).length !== body.holdTokens.length) {
      return err(
        "HOLD_INVALID",
        "One or more holds are missing or expired. Re-select your slots.",
        409,
      );
    }

    type HoldRow = { hold_token: string; court_id: string; slot_start: string; expires_at: string };
    const slotPairs = (holdRows as HoldRow[]).map((h) => ({
      courtId: h.court_id,
      start: new Date(h.slot_start),
    }));

    for (const p of slotPairs) {
      if (!isOnSlotGrid(p.start) || !isFutureSlot(p.start)) {
        return err("SLOT_INVALID", "A held slot is no longer bookable.", 422);
      }
    }

    // Operating hours / closures check
    await assertSlotsOpen(db, slotPairs);

    // Availability clash check (fast-fail before the RPC)
    const startIsos = slotPairs.map((p) => p.start.toISOString());
    const courtIds = [...new Set(slotPairs.map((p) => p.courtId))];

    const { data: clashRows } = await db
      .from("booking_slots")
      .select("court_id")
      .in("court_id", courtIds)
      .in("slot_start", startIsos)
      .in("state", [...LIVE_SLOT_STATES]);

    if ((clashRows ?? []).length > 0) {
      return err(
        "SLOT_TAKEN",
        "A selected slot was just taken. Please pick another time.",
        409,
      );
    }

    // Server-side total recalc — never trust a client total.
    const { total, lines } = await recalculateTotal(db, {
      slots: slotPairs,
      paddleQty: body.rentals.paddleQty,
      paddleHours: body.rentals.paddleHours,
      ball: body.rentals.ball,
    });

    // Fetch court names for the outbox payload
    const { data: courtRows } = await db
      .from("courts")
      .select("id,name")
      .in("id", courtIds);
    const courtNameById = new Map(
      ((courtRows ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
    );
    const slotSummary = slotPairs.map((p) => ({
      courtId: p.courtId,
      courtName: courtNameById.get(p.courtId) ?? p.courtId,
      slotStart: p.start.toISOString(),
    }));

    const outboxPayload = {
      trackingToken: "", // filled per-attempt below
      fullName: body.customer.fullName,
      email,
      phone: body.customer.phone,
      slots: slotSummary,
      total,
    };

    // Paddle hours: if rentals requested, default to slot count
    const paddleHoursStr =
      body.rentals.paddleQty > 0
        ? String(body.rentals.paddleHours ?? slotPairs.length)
        : null;
    const ballFeeStr = body.rentals.ball
      ? (lines.find((l) => l.kind === "ball")?.amount ?? null)
      : null;

    // ── Atomic write via RPC ─────────────────────────────────────────────────
    // Retry up to 5× on the rare tracking_code uniqueness collision
    // (36^5 ≈ 60M combinations; collisions are negligible in practice).
    const trackingToken = randomBytes(32).toString("hex");
    type RpcResult = {
      tracking_token: string;
      tracking_code: string;
      total: string;
      status: string;
      deduped: boolean;
    };
    let rpcResult: RpcResult | null = null;
    let lastRpcError: { message?: string; code?: string } | null = null;

    for (let attempt = 0; attempt <= 4; attempt++) {
      const trackingCode = generateTrackingCode();
      outboxPayload.trackingToken = trackingToken; // same token each attempt

      const { data: rpcData, error: rpcErr } = await db.rpc("rpc_submit_booking", {
        p_idempotency_key: body.idempotencyKey,
        p_tracking_token: trackingToken,
        p_tracking_code: trackingCode,
        p_full_name: body.customer.fullName,
        p_email: email,
        p_phone: body.customer.phone,
        p_total: total,
        p_hold_tokens: body.holdTokens,
        p_slots: slotPairs.map((p) => ({
          court_id: p.courtId,
          slot_start: p.start.toISOString(),
        })),
        p_paddle_qty: body.rentals.paddleQty,
        p_paddle_hours: paddleHoursStr,
        p_ball_fee: ballFeeStr,
        p_proof_path: proof.path,
        p_proof_mime: proof.mime,
        p_proof_bytes: proof.bytes,
        p_outbox_payload: outboxPayload,
        p_owner_email: OWNER_ALERT_EMAIL,
        p_lines: lines,
        p_slot_summary: slotSummary,
      });

      if (!rpcErr) {
        rpcResult = rpcData as RpcResult;
        break;
      }
      // Retry only on tracking_code uniqueness collision; all other errors break out.
      if (isTrackingCodeViolation(rpcErr) && attempt < 4) continue;
      lastRpcError = rpcErr;
      break;
    }

    if (lastRpcError || !rpcResult) {
      const rpcError = lastRpcError ?? { message: "unknown" };
      const msg = rpcError.message ?? "";
      if (msg.includes("HOLD_INVALID")) {
        return err("HOLD_INVALID", "One or more holds are missing or expired. Re-select your slots.", 409);
      }
      if (msg.includes("SLOT_TAKEN") || (rpcError.code === "23505" && !isTrackingCodeViolation(rpcError))) {
        return err("SLOT_TAKEN", "A selected slot was just taken. Please pick another time.", 409);
      }
      if (msg.includes("PROOF_ALREADY_USED")) {
        return err("PROOF_ALREADY_USED", "This payment proof was already used for another booking.", 409);
      }
      if (msg.includes("IDEMPOTENCY_IN_PROGRESS")) {
        return err("IDEMPOTENCY_IN_PROGRESS", "A submission with this key is already being processed. Retry shortly.", 409);
      }
      console.error("rpc_submit_booking failed", rpcError);
      Sentry.captureException(rpcError);
      return err("INTERNAL", "Submission failed.", 500);
    }

    const response = {
      trackingToken: rpcResult.tracking_token,
      trackingCode: rpcResult.tracking_code,
      total: rpcResult.total,
      status: rpcResult.status,
      deduped: rpcResult.deduped,
    };

    if (!response.deduped) after(() => drainOutboxBestEffort().catch(() => {}));

    return NextResponse.json(response, { status: response.deduped ? 200 : 201 });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("submit failed", e);
    Sentry.captureException(e);
    return err("INTERNAL", "Submission failed.", 500);
  }
}

/** Generates a 5-character uppercase alphanumeric tracking code (A-Z0-9). */
function generateTrackingCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(5);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/** True when the error is a 23505 unique violation on the tracking_code column. */
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
  const message = (e as { message?: unknown }).message;
  if (typeof constraint === "string" && constraint.includes("tracking_code")) return true;
  if (typeof detail === "string" && detail.includes("tracking_code")) return true;
  if (typeof message === "string" && message.includes("tracking_code")) return true;
  return false;
}
