import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/session";
import { getDbOrThrow } from "@/lib/admin/decisions";
import { LaneError, err } from "@/lib/booking/errors";
import { createExpense, expenseInputSchema } from "@/lib/admin/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const parsed = expenseInputSchema.safeParse(await request.json());
    if (!parsed.success) return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    return NextResponse.json(await createExpense(getDbOrThrow(), admin, parsed.data), { status: 201 });
  } catch (error) {
    if (error instanceof LaneError) return err(error.code, error.message, error.status);
    console.error("admin expense create failed", error);
    return err("INTERNAL", "Expense create failed.", 500);
  }
}
