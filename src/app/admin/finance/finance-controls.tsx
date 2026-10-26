"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { FileSpreadsheet, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { EXPENSE_CATEGORIES, type ExpenseInput } from "@/lib/admin/expenses";
import { buildFinanceCsv, type FinanceExportBooking } from "@/lib/admin/finance-export";

export interface FinanceExpenseRow {
  id: string; title: string; category: string; amountCentavos: number; paidDate: string;
  description: string | null; vendor: string | null; notes: string | null;
}

export function FinanceFilters({ from, to, category, q, today }: { from: string; to: string; category: string; q: string; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filterFrom, setFilterFrom] = useState(from);
  const [filterTo, setFilterTo] = useState(to);
  const [filterCategory, setFilterCategory] = useState(category);
  const [filterQuery, setFilterQuery] = useState(q);

  useEffect(() => {
    setOpen(false);
    setFilterFrom(from);
    setFilterTo(to);
    setFilterCategory(category);
    setFilterQuery(q);
  }, [from, to, category, q]);

  const presetDays = [7, 30, 90] as const;
  const isPresetRange = presetDays.some((days) => filterFrom === shiftDate(today, -(days - 1)) && filterTo === today);
  const activeCount = Number(!isPresetRange) + Number(Boolean(category)) + Number(Boolean(q));

  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger render={<Button type="button" variant="outline" aria-expanded={open}>
      <SlidersHorizontal aria-hidden="true" />
      Filters
      {activeCount > 0 && <span className="ml-0.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground" aria-label={`${activeCount} active filters`}>{activeCount}</span>}
    </Button>} />
    <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle>Filters</SheetTitle>
        <SheetDescription>Choose a reporting period or narrow expenses by category and title.</SheetDescription>
      </SheetHeader>
      <form action="/admin/finance" onSubmit={() => setOpen(false)} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Quick date range</legend>
            <div className="flex flex-wrap gap-2">
              {presetDays.map((days) => {
                const start = shiftDate(today, -(days - 1));
                const selected = from === start && to === today;
                return <Button key={days} size="sm" variant={selected ? "secondary" : "outline"} nativeButton={false} render={<Link href={`/admin/finance?from=${start}&to=${today}`} />}>{`Last ${days} days`}</Button>;
              })}
            </div>
          </fieldset>
          <fieldset className="grid gap-4">
            <legend className="mb-2 text-sm font-medium">Custom range and expenses</legend>
            <label className="grid gap-1.5 text-xs text-muted-foreground">From<Input name="from" type="date" value={filterFrom} onChange={(event) => setFilterFrom(event.target.value)} /></label>
            <label className="grid gap-1.5 text-xs text-muted-foreground">To<Input name="to" type="date" value={filterTo} onChange={(event) => setFilterTo(event.target.value)} /></label>
            <label className="grid gap-1.5 text-xs text-muted-foreground">Category<select className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground" name="category" value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}><option value="">All categories</option>{EXPENSE_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="grid gap-1.5 text-xs text-muted-foreground">Title search<Input name="q" value={filterQuery} onChange={(event) => setFilterQuery(event.target.value)} placeholder="Search expenses" /></label>
          </fieldset>
        </div>
        <SheetFooter className="flex-row justify-between border-t p-4">
          <Button type="button" variant="ghost" onClick={() => { setFilterFrom(shiftDate(today, -29)); setFilterTo(today); setFilterCategory(""); setFilterQuery(""); setOpen(false); router.push("/admin/finance"); }}>Reset</Button>
          <Button type="submit">Apply filters</Button>
        </SheetFooter>
      </form>
    </SheetContent>
  </Sheet>;
}

function shiftDate(date: string, delta: number) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year!, month! - 1, day! + delta));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`;
}

export function ExpenseActions({ expense, today }: { expense?: FinanceExpenseRow; today: string }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [confirmOpen, setConfirmOpen] = useState(false); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
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
    if (!expense) return;
    setConfirmOpen(false);
    setBusy(true); setError("");
    try { const response = await fetch(`/api/admin/expenses/${expense.id}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "Expense could not be deleted."); toast.success("Expense deleted."); router.refresh(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Expense could not be deleted."); } finally { setBusy(false); }
  }
  return <>
    {expense ? <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(true)}>Edit</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => setConfirmOpen(true)}>Delete</Button></div> : <Button onClick={() => setOpen(true)}>Add expense</Button>}
    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      title="Delete expense?"
      description={expense ? `Permanently delete “${expense.title}”? This cannot be undone.` : ""}
      onConfirm={() => void remove()}
    />
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

export function FinanceExport({ bookings, expenses, period, generated, range }: { bookings: FinanceExportBooking[]; expenses: FinanceExpenseRow[]; period: string; generated: string; range: string }) {
  function download() {
    const blob = new Blob([buildFinanceCsv({ period, generated, bookings, expenses })], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `finance-${range}.csv`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <Button variant="outline" onClick={download}><FileSpreadsheet aria-hidden="true" />Export to Sheets</Button>;
}
