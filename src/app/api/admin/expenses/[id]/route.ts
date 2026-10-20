import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/session";
import { getDbOrThrow } from "@/lib/admin/decisions";
import { LaneError, err } from "@/lib/booking/errors";
import { deleteExpense, expenseInputSchema, updateExpense } from "@/lib/admin/expenses";

export const runtime = "nodejs";
const idSchema = z.string().uuid();

export async function PATCH(request: Request, { params }: RouteContext<"/api/admin/expenses/[id]">) {
  try {
    const admin = await requireAdmin(); const { id } = await params;
    if (!idSchema.safeParse(id).success) return err("BAD_REQUEST", "Invalid expense id.", 400);
    const parsed = expenseInputSchema.safeParse(await request.json());
    if (!parsed.success) return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    return NextResponse.json(await updateExpense(getDbOrThrow(), admin, id, parsed.data));
  } catch (error) {
    if (error instanceof LaneError) return err(error.code, error.message, error.status);
    console.error("admin expense update failed", error); return err("INTERNAL", "Expense update failed.", 500);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/admin/expenses/[id]">) {
  try {
    const admin = await requireAdmin(); const { id } = await params;
    if (!idSchema.safeParse(id).success) return err("BAD_REQUEST", "Invalid expense id.", 400);
    await deleteExpense(getDbOrThrow(), admin, id); return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof LaneError) return err(error.code, error.message, error.status);
    console.error("admin expense delete failed", error); return err("INTERNAL", "Expense delete failed.", 500);
  }
}
