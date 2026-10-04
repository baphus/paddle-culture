import type { HandlerResponse } from "@netlify/functions";
import { lt } from "drizzle-orm";
import { getDb } from "../../src/db/client";
import { holds } from "../../src/db/schema";

// Retention purge (see docs/BACKUPS.md §7 "Retention purge").
// Weekly: deletes ONLY expired holds older than HOLD_GRACE_HOURS — rows that
// can never be referenced again (every read path requires expires_at >
// now(), and the submit transaction lazy-deletes expired holds anyway).
// Bookings, booking_slots, payment_proofs, email_outbox, and audit_log are
// NEVER touched (3-year retention default; see BACKUPS.md).
// Relative imports only — Netlify bundles this scheduled function with
// esbuild (same constraint as the outbox worker).

export const RETENTION_HOLD_GRACE_HOURS = 24;

export const config = { schedule: "0 2 * * 0" };

export default async (): Promise<HandlerResponse> => {
  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - RETENTION_HOLD_GRACE_HOURS * 3_600_000);
    const deleted = await db
      .delete(holds)
      .where(lt(holds.expiresAt, cutoff))
      .returning({ holdToken: holds.holdToken });
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, purgedHolds: deleted.length }),
    };
  } catch (e) {
    console.error("retention purge failed", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false }),
    };
  }
};
