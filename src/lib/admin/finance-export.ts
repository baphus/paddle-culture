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

export function buildFinanceCsv({ period, generated, bookings, expenses }: FinanceExportInput): string {
  const pesos = (cents: number) => (cents / 100).toFixed(2);
  const sum = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const courtCents = sum(bookings, (b) => b.courtCents);
  const rentalCents = sum(bookings, (b) => b.rentalCents);
  const revenueCents = sum(bookings, (b) => b.totalCents);
  const expenseCents = sum(expenses, (e) => e.amountCentavos);
  const blank: string[] = [];
  const rows: string[][] = [
    ["Finance Report"],
    ["Report period", period],
    ["Generated", generated],
    blank,
    ["BOOKINGS"],
    ["No.", "Date Approved", "Customer", "Email", "Court", "Slots", "Date of Booking", "Court Amount (PHP)", "Rental Amount (PHP)", "Amount (PHP)"],
    ...bookings.map((b, index) => [
      String(index + 1), b.approved, b.customer, b.email, b.courts, b.slots, b.playDate,
      pesos(b.courtCents), pesos(b.rentalCents), pesos(b.totalCents),
    ]),
    ["Bookings total", "", "", "", "", "", "", pesos(courtCents), pesos(rentalCents), pesos(revenueCents)],
    blank,
    ["EXPENSES"],
    ["Title", "Category", "Paid date", "Amount (PHP)"],
    ...expenses.map((e) => [e.title, e.category, e.paidDate, pesos(e.amountCentavos)]),
    ["Expenses total", "", "", pesos(expenseCents)],
    blank,
    ["SUMMARY"],
    ["Metric", "Value"],
    ["Booking Revenue (PHP)", pesos(revenueCents)],
    ["Bookings Count", String(bookings.length)],
    ["Expenses (PHP)", pesos(expenseCents)],
    ["Net Profit (PHP)", pesos(revenueCents - expenseCents)],
  ];
  return "\uFEFF" + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function csvEscape(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
