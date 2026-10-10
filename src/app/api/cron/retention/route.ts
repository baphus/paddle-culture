import { NextResponse } from "next/server";
import { getDb } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel retention cron (vercel.json: Sundays 02:00 UTC).
// Replaces the Drizzle `db.delete(holds).where(lt(...))` with an RPC call
// (rpc_delete_expired_holds) that runs the same DELETE server-side.

const RETENTION_HOLD_GRACE_HOURS = 24;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
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
    ).toISOString();

    const { data, error } = await db.rpc("rpc_delete_expired_holds", {
      p_cutoff: cutoff,
    });

    if (error) throw error;
    return NextResponse.json({ ok: true, purgedHolds: data ?? 0 });
  } catch (e) {
    console.error("vercel retention cron failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
