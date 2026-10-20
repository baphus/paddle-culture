import { z } from "zod";
import type { Db } from "@/db/client";
import { LaneError } from "@/lib/booking/errors";
import { manilaDateStr } from "@/lib/booking/slots";
import type { AdminSession } from "./session";

export const EXPENSE_CATEGORIES = [
  "Rent", "Payroll/Contractors", "Utilities", "Maintenance & Repairs",
  "Supplies & Equipment", "Marketing", "Software/Subscriptions", "Taxes & Fees", "Other",
] as const;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}, "Enter a valid calendar date.").refine((value) => value <= manilaDateStr(new Date()), "Paid date cannot be in the future.");
export const expenseInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(160),
  category: z.enum(EXPENSE_CATEGORIES),
  amountCentavos: z.number().int().positive("Amount must be positive."),
  paidDate: dateSchema,
  description: z.string().trim().max(2000).optional().nullable(),
  vendor: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export interface ExpenseListParams {
  from: string;
  to: string;
  category?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface ExpenseListResult {
  rows: Array<{ id: string; title: string; category: string; amountCentavos: number; paidDate: string; description: string | null; vendor: string | null; notes: string | null }>;
  total: number;
}

export async function listExpenses(db: Db, params: ExpenseListParams): Promise<ExpenseListResult> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const page = Math.max(params.page ?? 1, 1);
  let query = db.from("expenses").select("id,title,category,amount_centavos,paid_date,description,vendor,notes", { count: "exact" })
    .gte("paid_date", params.from).lte("paid_date", params.to)
    .order("paid_date", { ascending: false }).order("id", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (params.category && (EXPENSE_CATEGORIES as readonly string[]).includes(params.category)) query = query.eq("category", params.category);
  if (params.q?.trim()) query = query.ilike("title", `%${params.q.trim().replace(/[\\%_]/g, "\\$&")}%`);
  const { data, error, count } = await query;
  if (error) throw new LaneError("INTERNAL", "Expenses could not be loaded.", 500);
  return {
    rows: (data ?? []).map((row) => ({
      id: row.id, title: row.title, category: row.category, amountCentavos: row.amount_centavos,
      paidDate: row.paid_date, description: row.description, vendor: row.vendor, notes: row.notes,
    })), total: count ?? 0,
  };
}

export async function listExpensesForExport(db: Db, params: Pick<ExpenseListParams, "from" | "to" | "category" | "q">): Promise<ExpenseListResult["rows"]> {
  const rows: ExpenseListResult["rows"] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db.from("expenses")
      .select("id,title,category,amount_centavos,paid_date,description,vendor,notes")
      .gte("paid_date", params.from).lte("paid_date", params.to)
      .order("paid_date", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + 499);
    if (params.category && (EXPENSE_CATEGORIES as readonly string[]).includes(params.category)) query = query.eq("category", params.category);
    if (params.q?.trim()) query = query.ilike("title", `%${params.q.trim().replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error } = await query;
    if (error) throw new LaneError("INTERNAL", "Expenses could not be exported.", 500);
    const page = data ?? [];
    rows.push(...page.map((row) => ({ id: row.id, title: row.title, category: row.category, amountCentavos: row.amount_centavos, paidDate: row.paid_date, description: row.description, vendor: row.vendor, notes: row.notes })));
    if (page.length < 500) return rows;
  }
}

function assertPastOrToday(paidDate: string) {
  if (paidDate > manilaDateStr(new Date())) {
    throw new LaneError("BAD_REQUEST", "Paid date cannot be in the future.", 400);
  }
}

function asExpense(data: unknown) {
  if (!data || typeof data !== "object") throw new LaneError("INTERNAL", "Expense response was invalid.", 500);
  return data;
}

export async function createExpense(db: Db, admin: AdminSession, input: ExpenseInput) {
  assertPastOrToday(input.paidDate);
  const { data, error } = await db.rpc("rpc_create_expense", {
    p_actor: admin.email, p_title: input.title, p_category: input.category,
    p_amount_centavos: input.amountCentavos, p_paid_date: input.paidDate,
    p_description: input.description ?? null, p_vendor: input.vendor ?? null, p_notes: input.notes ?? null,
  });
  if (error) throwRpcError(error.message);
  return asExpense(data);
}

export async function updateExpense(db: Db, admin: AdminSession, id: string, input: ExpenseInput) {
  assertPastOrToday(input.paidDate);
  const { data, error } = await db.rpc("rpc_update_expense", {
    p_id: id, p_actor: admin.email, p_title: input.title, p_category: input.category,
    p_amount_centavos: input.amountCentavos, p_paid_date: input.paidDate,
    p_description: input.description ?? null, p_vendor: input.vendor ?? null, p_notes: input.notes ?? null,
  });
  if (error) throwRpcError(error.message);
  return asExpense(data);
}

export async function deleteExpense(db: Db, admin: AdminSession, id: string) {
  const { error } = await db.rpc("rpc_delete_expense", { p_id: id, p_actor: admin.email });
  if (error) throwRpcError(error.message);
}

function throwRpcError(message = "") : never {
  if (message.includes("NOT_FOUND")) throw new LaneError("NOT_FOUND", "Expense not found.", 404);
  if (message.includes("BAD_REQUEST") || message.includes("expenses_")) {
    throw new LaneError("BAD_REQUEST", message.replace(/^.*?(BAD_REQUEST:\s*)?/, "") || "Invalid expense.", 400);
  }
  throw new LaneError("INTERNAL", "Expense operation failed.", 500);
}
