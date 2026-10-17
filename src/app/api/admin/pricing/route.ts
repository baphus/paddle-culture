import { NextResponse } from "next/server";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { getDbOrThrow } from "@/lib/admin/decisions";
import { pricingRuleSetSchema, setPricingRule } from "@/lib/admin/config";

export const runtime = "nodejs";

// POST /api/admin/pricing — admin only. Sets the rate for one (court, day-type,
// time-band, item-type) key: creates the court's override row, or updates it
// when the court already has one + audit row. Vocabulary is read-only by
// design: values only, no new rule kinds, no deletes. A court with no row for a
// key inherits the global (court_id NULL) default.
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const parsed = pricingRuleSetSchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const row = await setPricingRule(getDbOrThrow(), admin, parsed.data);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin pricing set failed", e);
    return err("INTERNAL", "Pricing update failed.", 500);
  }
}
