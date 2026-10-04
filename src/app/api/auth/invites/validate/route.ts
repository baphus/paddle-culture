import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { adminInvites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { LaneError, err } from "@/lib/booking/errors";
import { hashInviteToken } from "@/lib/admin/validation";

export const runtime = "nodejs";

// GET /api/auth/invites/validate?token=<raw> — public; lets the register
// page show used/invalid state before submit. Returns a boolean only.
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    let db;
    try {
      db = getDb();
    } catch {
      return err("NOT_CONFIGURED", "Database is not configured.", 500);
    }
    if (!token) return NextResponse.json({ valid: false });
    const rows = await db
      .select({ usedAt: adminInvites.usedAt })
      .from(adminInvites)
      .where(eq(adminInvites.tokenHash, hashInviteToken(token)));
    const row = rows[0];
    return NextResponse.json({ valid: !!row && row.usedAt === null });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("invite validate failed", e);
    return err("INTERNAL", "Could not validate invite.", 500);
  }
}
