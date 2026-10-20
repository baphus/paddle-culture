"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EXPENSE_CATEGORIES, type ExpenseInput } from "@/lib/admin/expenses";
import { buildFinanceCsv } from "@/lib/admin/finance-export";

export interface FinanceExpenseRow {
  id: string; title: string; category: string; amountCentavos: number; paidDate: string;
  description: string | null; vendor: string | null; notes: string | null;
}

export function FinanceFilters({ from, to, category, q }: { from: string; to: string; category: string; q: string }) {
  const router = useRouter();
  return <form className="flex flex-wrap items-end gap-2" action="/admin/finance">
    <label className="grid gap-1 text-xs text-muted-foreground">From<Input name="from" type="date" defaultValue={from} /></label>
    <label className="grid gap-1 text-xs text-muted-foreground">To<Input name="to" type="date" defaultValue={to} /></label>
    <label className="grid gap-1 text-xs text-muted-foreground">Category<select className="h-8 rounded-lg border bg-background px-2 text-sm" name="category" defaultValue={category}><option value="">All categories</option>{EXPENSE_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>
    <label className="grid gap-1 text-xs text-muted-foreground">Title search<Input name="q" defaultValue={q} placeholder="Search expenses" /></label>
    <Button type="submit" variant="outline">Apply</Button>
    <Button type="button" variant="ghost" onClick={() => router.push("/admin/finance")}>Reset</Button>
  </form>;
}

export function ExpenseActions({ expense, today }: { expense?: FinanceExpenseRow; today: string }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function save(formData: FormData) {
    setBusy(true); setError("");
    const amount = Number(formData.get("amount"));
    const body: ExpenseInput = {
      title: String(formData.get("title") ?? ""), category: String(formData.get("category") ?? "Other") as ExpenseInput["category"],
      amountCentavos: Math.round(amount * 100), paidDate: String(formData.get("paidDate") ?? ""),
      description: String(formData.get("description") ?? ""), vendor: String(formData.get("vendor") ?? ""), notes: String(formData.get("notes") ?? ""),
    };
    try { const response = await fetch(expense ? `/api/admin/expenses/${expense.id}` : "/api/admin/expenses", { method: expense ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "Expense could not be saved.");
      setOpen(false); toast.success(expense ? "Expense updated." : "Expense added."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Expense could not be saved."); } finally { setBusy(false); }
  }
  async function remove() {
    if (!expense || !window.confirm(`Permanently delete “${expense.title}”?`)) return;
    setBusy(true); setError("");
    try { const response = await fetch(`/api/admin/expenses/${expense.id}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "Expense could not be deleted."); toast.success("Expense deleted."); router.refresh(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Expense could not be deleted."); } finally { setBusy(false); }
  }
  return <>
    {expense ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(true)}>Edit</Button><Button size="sm" variant="destructive" disabled={busy} onClick={remove}>Delete</Button></div> : <Button onClick={() => setOpen(true)}>Add expense</Button>}
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}><form action={save} className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-xl border bg-background p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="expense-dialog-title">
      <h2 id="expense-dialog-title" className="text-lg font-semibold">{expense ? "Edit expense" : "Add expense"}</h2>
      <label className="grid gap-1 text-sm">Title<Input name="title" required maxLength={160} defaultValue={expense?.title} /></label>
      <label className="grid gap-1 text-sm">Category<select name="category" className="h-9 rounded-lg border bg-background px-2" defaultValue={expense?.category ?? "Rent"}>{EXPENSE_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Amount (PHP)<Input name="amount" required min="0.01" step="0.01" type="number" defaultValue={expense ? (expense.amountCentavos / 100).toFixed(2) : ""} /></label>
      <label className="grid gap-1 text-sm">Paid date<Input name="paidDate" required type="date" max={today} defaultValue={expense?.paidDate ?? today} /></label>
      <label className="grid gap-1 text-sm">Description (optional)<Input name="description" maxLength={2000} defaultValue={expense?.description ?? ""} /></label>
      <label className="grid gap-1 text-sm">Vendor / payee (optional)<Input name="vendor" maxLength={160} defaultValue={expense?.vendor ?? ""} /></label>
      <label className="grid gap-1 text-sm">Notes (optional)<textarea name="notes" maxLength={2000} defaultValue={expense?.notes ?? ""} className="min-h-20 rounded-lg border bg-background p-2" /></label>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save expense"}</Button></div>
    </form></div>}
  </>;
}

export function FinanceExport({ days, expenses, range }: { days: Array<{ date: string; revenueCents: number; expenseCents: number; profitCents: number; bookings: number }>; expenses: FinanceExpenseRow[]; range: string }) {
  function download() {
    const blob = new Blob([buildFinanceCsv(days, expenses)], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `finance-${range}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <Button variant="outline" onClick={download}>Export CSV</Button>;
}
