import { NextResponse } from "next/server";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { createAdminUser, listAdminUsers } from "@/lib/admin/users";
import { createAdminBodySchema } from "@/lib/admin/validation";

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

// POST /api/admin/users — create an administrator (admin only).
export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const parsed = createAdminBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const user = await createAdminUser(actor, parsed.data);
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin user create failed", e);
    return err("INTERNAL", "Could not create user.", 500);
  }
}
