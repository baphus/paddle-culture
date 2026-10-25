import { NextResponse } from "next/server";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { getDbOrThrow } from "@/lib/admin/decisions";
import {
  createHours,
  hoursCreateSchema,
  quickHoursSetupSchema,
  replaceCourtHours,
} from "@/lib/admin/config";

export const runtime = "nodejs";

// POST /api/admin/hours — admin only. Adds one operating_hours row (hours +
// rate, ADR-13) + audit. Rows for the same (court, day) act as a UNION in
// isSlotOpen; a court with zero rows on a day is CLOSED.
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const parsed = hoursCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const row = await createHours(getDbOrThrow(), admin, parsed.data);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin hours create failed", e);
    return err("INTERNAL", "Hours creation failed.", 500);
  }
}

// PUT /api/admin/hours — replace the complete weekly schedule for one court.
export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    const parsed = quickHoursSetupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const count = await replaceCourtHours(getDbOrThrow(), admin, parsed.data);
    return NextResponse.json({ count });
  } catch (e) {
    if (e instanceof LaneError && e.code === "HOURS_OVERLAP") {
      // The RPC path packs the conflicting rows into the message as a JSON
      // array; the single-row helpers (config.ts createHours/updateHours)
      // throw prose. Parsing blindly turned a 409 into a 500.
      let conflicts: unknown = [];
      try {
        const parsedMessage: unknown = JSON.parse(e.message);
        if (Array.isArray(parsedMessage)) conflicts = parsedMessage;
      } catch {
        conflicts = [];
      }
      return NextResponse.json({ error: { message: e.message }, conflicts }, { status: 409 });
    }
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin quick hours setup failed", e);
    return err("INTERNAL", "Quick setup failed.", 500);
  }
}
