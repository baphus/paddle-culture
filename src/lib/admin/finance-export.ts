import type { FinanceDay } from "./finance";

export interface FinanceExportExpense {
  title: string;
  category: string;
  amountCentavos: number;
  paidDate: string;
}

export function buildFinanceCsv(days: FinanceDay[], expenses: FinanceExportExpense[]): string {
  const rows: Array<Array<string | number>> = [["Record type", "Date", "Title", "Category", "Bookings", "Revenue (PHP)", "Expense (PHP)", "Profit (PHP)"]];
  for (const day of days) rows.push(["Booking revenue", day.date, "", "", day.bookings, (day.revenueCents / 100).toFixed(2), "", ""]);
  for (const expense of expenses) rows.push(["Expense", expense.paidDate, expense.title, expense.category, "", "", (expense.amountCentavos / 100).toFixed(2), ""]);
  for (const day of days) rows.push(["Daily profit summary", day.date, "", "", "", "", "", (day.profitCents / 100).toFixed(2)]);
  return "\uFEFF" + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function csvEscape(value: string | number) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
