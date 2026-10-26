import type { Cell, Row, SheetData } from "write-excel-file/browser";

export interface FinanceExportExpense {
  title: string;
  category: string;
  amountCentavos: number;
  paidDate: string;
}

/** One approved booking, already formatted for the sheet (Manila dates). */
export interface FinanceExportBooking {
  approved: string;
  customer: string;
  email: string;
  courts: string;
  slots: string;
  playDate: string;
  courtCents: number;
  rentalCents: number;
  totalCents: number;
}

export interface FinanceExportInput {
  period: string;
  generated: string;
  bookings: FinanceExportBooking[];
  expenses: FinanceExportExpense[];
}

/** Wide enough that no cell renders as #### in Excel or Sheets. */
const COLUMN_WIDTHS = [22, 18, 24, 30, 20, 26, 20, 18, 18, 18];

const bold = (value: string): Cell => ({ value, fontWeight: "bold" });
const pesos = (cents: number): Cell => ({ value: cents / 100, format: "#,##0.00" });

export function buildFinanceSheet({ period, generated, bookings, expenses }: FinanceExportInput): {
  rows: SheetData;
  columns: Array<{ width: number }>;
} {
  const sum = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const courtCents = sum(bookings, (b) => b.courtCents);
  const rentalCents = sum(bookings, (b) => b.rentalCents);
  const revenueCents = sum(bookings, (b) => b.totalCents);
  const expenseCents = sum(expenses, (e) => e.amountCentavos);
  const rows: Row[] = [
    [bold("Finance Report")],
    ["Report period", period],
    ["Generated", generated],
    [],
    [bold("BOOKINGS")],
    ["No.", "Date Approved", "Customer", "Email", "Court", "Slots", "Date of Booking", "Court Amount (PHP)", "Rental Amount (PHP)", "Amount (PHP)"].map(bold),
    ...bookings.map((b, index): Row => [
      index + 1, b.approved, b.customer, b.email, b.courts, b.slots, b.playDate,
      pesos(b.courtCents), pesos(b.rentalCents), pesos(b.totalCents),
    ]),
    [bold("Bookings total"), "", "", "", "", "", "", pesos(courtCents), pesos(rentalCents), pesos(revenueCents)],
    [],
    [bold("EXPENSES")],
    ["Title", "Category", "Paid date", "Amount (PHP)"].map(bold),
    ...expenses.map((e): Row => [e.title, e.category, e.paidDate, pesos(e.amountCentavos)]),
    [bold("Expenses total"), "", "", pesos(expenseCents)],
    [],
    [bold("SUMMARY")],
    ["Metric", "Value"].map(bold),
    ["Booking Revenue (PHP)", pesos(revenueCents)],
    ["Bookings Count", bookings.length],
    ["Expenses (PHP)", pesos(expenseCents)],
    ["Net Profit (PHP)", pesos(revenueCents - expenseCents)],
  ];
  return { rows, columns: COLUMN_WIDTHS.map((width) => ({ width })) };
}
