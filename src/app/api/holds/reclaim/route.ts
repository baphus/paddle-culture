import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { LaneError, err } from "@/lib/booking/errors";
import { reclaimHolds } from "@/lib/booking/hold-owner";
import { reclaimHoldsBodySchema } from "@/lib/booking/validation";

export const runtime = "nodejs";

/**
 * POST /api/holds/reclaim — "I'm back, where are my slots?"
 *
 * The customer's browser holds an `owner_token`; a refresh or a trip to their
 * banking app may have wiped everything else. This turns that token back into
 * a usable hold so the payment proof they already sent has somewhere to land.
 * The rules live in reclaimHolds() (src/lib/booking/hold-owner.ts) so submit
 * can never disagree with this endpoint.
 */
export async function POST(request: Request) {
  try {
    const parsed = reclaimHoldsBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    let db;
    try {
      db = getDb();
    } catch {
      return err("NOT_CONFIGURED", "Database is not configured.", 500);
    }

    const result = await reclaimHolds(db, { ownerToken: parsed.data.ownerToken });
    if (!result.ok) return err(result.code, result.message, result.status);

    return NextResponse.json({
      status: result.status,
      holds: result.rows.map((r) => ({
        holdToken: r.hold_token,
        courtId: r.court_id,
        slotStart: r.slot_start,
      })),
      expiresAt: result.expiresAt,
      deadlineMs: result.deadlineMs,
    });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("hold reclaim failed", e);
    Sentry.captureException(e);
    return err("INTERNAL", "Could not restore your hold.", 500);
  }
}
