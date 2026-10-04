import { NextResponse } from "next/server";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { getDbOrThrow } from "@/lib/admin/decisions";
import { courtCreateSchema, createCourt } from "@/lib/admin/config";

export const runtime = "nodejs";

// POST /api/admin/courts — admin only. Adds a court as active + audit row.
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const parsed = courtCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const row = await createCourt(getDbOrThrow(), admin, parsed.data.name);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin courts create failed", e);
    return err("INTERNAL", "Court creation failed.", 500);
  }
}
