"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RevenueDay, RevenueMonth } from "@/lib/admin/bookings";

type Cell = string | number;

/** CRLF + BOM so Excel opens the pesos columns as UTF-8 text. */
function toCsv(rows: Cell[][]): string {
  const escape = (value: Cell) => {
    const s = String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    "\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n")
  );
}

function download(filename: string, rows: Cell[][]) {
  const url = URL.createObjectURL(
    new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Pesos as a plain number so spreadsheet tools can sum the column. */
function pesos(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function RevenueExportDropdown({
  days,
  months,
  range,
}: {
  days: RevenueDay[];
  months: RevenueMonth[];
  /** Date-range suffix for the filename, e.g. `2026-09-18_2026-10-17`. */
  range: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Download className="size-3.5" />
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() =>
            download(`revenue-daily-${range}.csv`, [
              ["Date", "Bookings", "Revenue (PHP)"],
              ...days.map((d) => [d.date, d.bookings, pesos(d.revenueCents)]),
            ])
          }
        >
          <FileSpreadsheet />
          Daily breakdown
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            download("revenue-monthly.csv", [
              ["Month", "Bookings", "Revenue (PHP)"],
              ...months.map((m) => [m.month, m.bookings, pesos(m.revenueCents)]),
            ])
          }
        >
          <FileSpreadsheet />
          Monthly breakdown
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
