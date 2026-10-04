import { NextResponse } from "next/server";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { getDbOrThrow } from "@/lib/admin/decisions";
import { closureCreateSchema, createClosure } from "@/lib/admin/config";

export const runtime = "nodejs";

// POST /api/admin/closures — admin only. Adds one closure (global or
// court-scoped) + audit. Closures beat operating hours in isSlotOpen.
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const parsed = closureCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const row = await createClosure(getDbOrThrow(), admin, parsed.data);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin closures create failed", e);
    return err("INTERNAL", "Closure creation failed.", 500);
  }
}
