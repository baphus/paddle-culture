import { NextResponse } from "next/server";
import { z } from "zod";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { getDbOrThrow } from "@/lib/admin/decisions";
import { pricingAmountSchema, updatePricingAmount } from "@/lib/admin/config";

export const runtime = "nodejs";

const idParam = z.string().uuid();

// PATCH /api/admin/pricing/[id] — admin only. Edits the AMOUNT of one
// pricing_rules row + audit row. Vocabulary (day_type/time_band/item_type/
// unit) is read-only by design: values only, no new rule kinds, no deletes.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!idParam.safeParse(id).success) {
      return err("BAD_REQUEST", "Invalid pricing rule id.", 400);
    }
    const parsed = pricingAmountSchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const row = await updatePricingAmount(getDbOrThrow(), admin, id, parsed.data.amount);
    return NextResponse.json(row);
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("admin pricing update failed", e);
    return err("INTERNAL", "Pricing update failed.", 500);
  }
}
