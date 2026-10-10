import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { LaneError, err } from "@/lib/booking/errors";
import { hashInviteToken } from "@/lib/admin/validation";

export const runtime = "nodejs";

// GET /api/auth/invites/validate?token=<raw>
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
    const { data, error } = await db
      .from("admin_invites")
      .select("used_at")
      .eq("token_hash", hashInviteToken(token))
      .single();
    if (error) return NextResponse.json({ valid: false });
    const row = data as { used_at: string | null } | null;
    return NextResponse.json({ valid: !!row && row.used_at === null });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("invite validate failed", e);
    return err("INTERNAL", "Could not validate invite.", 500);
  }
}
