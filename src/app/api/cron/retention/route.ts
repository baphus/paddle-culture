import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { isCronAuthorized } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel retention cron (vercel.json: Sundays 02:00 UTC).
// Replaces the Drizzle `db.delete(holds).where(lt(...))` with an RPC call
// (rpc_delete_expired_holds) that runs the same DELETE server-side.

const RETENTION_HOLD_GRACE_HOURS = 24;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
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

    // Past closures self-clear weekly along with the expired holds (an admin
    // browsing closures purges them sooner — see listClosures).
    const { error: closuresError } = await db
      .from("closures")
      .delete()
      .lt("end_at", new Date().toISOString());
    if (closuresError) throw closuresError;

    return NextResponse.json({ ok: true, purgedHolds: data ?? 0 });
  } catch (e) {
    console.error("vercel retention cron failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
