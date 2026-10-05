import { NextResponse } from "next/server";
import { lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { holds } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel primary backstop for retention (vercel.json: Sundays 02:00 UTC
// `0 2 * * 0`, ~= 10:00 Asia/Manila Sunday — quiet overnight-UTC hour;
// legacy: netlify/functions/retention.mts weekly schedule).
//
// Deletes ONLY expired holds older than the grace window (same rule as
// netlify/functions/retention.mts `RETENTION_HOLD_GRACE_HOURS = 24` —
// replicated here because the Netlify function uses esbuild relative
// imports that don't apply to Next/Vercel, which uses @/* imports).
// Bookings, booking_slots, payment_proofs, email_outbox, audit_log are
// NEVER touched.
//
// Purge order note: expired holds are already lazy-deleted by the submit
// transaction; the immediate outbox drain (drainOutboxBestEffort) is the
// primary mail path, and this cron plus POST /api/admin/outbox/process
// are backstops.

// Keep in sync with RETENTION_HOLD_GRACE_HOURS in netlify/functions/retention.mts.
const RETENTION_HOLD_GRACE_HOURS = 24;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Allow bypass when CRON_SECRET is unset only in development.
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const db = getDb();
    const cutoff = new Date(
      Date.now() - RETENTION_HOLD_GRACE_HOURS * 3_600_000,
    );
    const deleted = await db
      .delete(holds)
      .where(lt(holds.expiresAt, cutoff))
      .returning({ holdToken: holds.holdToken });
    return NextResponse.json({ ok: true, purgedHolds: deleted.length });
  } catch (e) {
    console.error("vercel retention cron failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
