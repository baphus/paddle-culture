import { NextResponse } from "next/server";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { listAdminUsers } from "@/lib/admin/users";

export const runtime = "nodejs";

// GET /api/admin/users — admin only. All admin accounts (ADR-04).
export async function GET() {
  try {
    await requireAdmin();
    const users = await listAdminUsers();
    return NextResponse.json({ users });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin users list failed", e);
    return err("INTERNAL", "Could not list users.", 500);
  }
}
