"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPesosFromCents } from "@/lib/admin/bookings";
import type { RevenueDay, RevenueMonth } from "@/lib/admin/bookings";

const PAGE_SIZES = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];
const DEFAULT_PAGE_SIZE: PageSize = 25;

export function RevenueTables({
  days,
  months,
  totalCents,
}: {
  /** Every day in the filtered range, already sorted newest-first. */
  days: RevenueDay[];
  /** All-time months, cap held at ~13 by the query's 12-month walk. */
  months: RevenueMonth[];
  /** Range total — percentages stay relative to the range, not the page. */
  totalCents: number;
}) {
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(days.length / pageSize));
  // The range or page size can shrink under us; clamp instead of rendering a
  // blank page.
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = days.slice(start, start + pageSize);

  return (
    <>
      {/* ── Daily breakdown table ─────────────────────────────────────── */}
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b pt-4">
          <CardTitle className="text-sm">Daily breakdown</CardTitle>
          <CardDescription>
            {days.length} day{days.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        {days.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Date (Manila)</TableHead>
                    <TableHead className="px-4">Bookings</TableHead>
                    <TableHead className="px-4">Revenue</TableHead>
                    <TableHead className="px-4">% of total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((d) => (
                    <TableRow key={d.date} className="transition-colors">
                      <TableCell className="px-4 py-3 font-medium text-foreground">
                        {d.date}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {d.bookings}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm font-semibold">
                        {formatPesosFromCents(d.revenueCents)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {totalCents > 0
                          ? `${((d.revenueCents / totalCents) * 100).toFixed(1)}%`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs">
              <div className="flex items-center gap-2">
                <p className="text-muted-foreground">
                  {days.length.toLocaleString()} result
                  {days.length === 1 ? "" : "s"}
                  {totalPages > 1 && ` · showing ${start + 1}–${start + pageRows.length}`}
                </p>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="outline" size="sm" className="h-7" />}
                  >
                    {pageSize} per page
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Rows per page</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={pageSize}
                      onValueChange={(value) => {
                        setPageSize(Number(value) as PageSize);
                        setPage(1);
                      }}
                    >
                      {PAGE_SIZES.map((size) => (
                        <DropdownMenuRadioItem key={size} value={size}>
                          {size}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {totalPages > 1 && (
                <nav aria-label="Daily breakdown pages" className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    className="h-7 min-w-7 px-1.5"
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-3.5" />
                  </Button>
                  {buildPageList(currentPage, totalPages).map((entry, i) =>
                    entry === "gap" ? (
                      <span
                        key={`gap-${i}`}
                        className="flex h-7 w-7 items-center justify-center text-muted-foreground"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </span>
                    ) : (
                      <Button
                        key={entry}
                        variant={entry === currentPage ? "default" : "outline"}
                        className="h-7 min-w-7 px-1.5"
                        onClick={() => setPage(entry)}
                        aria-current={entry === currentPage ? "page" : undefined}
                        aria-label={`Page ${entry}`}
                      >
                        {entry}
                      </Button>
                    ),
                  )}
                  <Button
                    variant="outline"
                    className="h-7 min-w-7 px-1.5"
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-3.5" />
                  </Button>
                </nav>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No approved bookings in this date range.
          </div>
        )}
      </Card>

      {/* ── Monthly breakdown table ───────────────────────────────────── */}
      {months.length > 0 && (
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b pt-6">
            <CardTitle className="text-sm">All-time monthly breakdown</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Month</TableHead>
                  <TableHead className="px-4">Bookings</TableHead>
                  <TableHead className="px-4">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => (
                  <TableRow key={m.month} className="transition-colors">
                    <TableCell className="px-4 py-3 font-medium text-foreground">
                      {new Date(m.month + "-15").toLocaleString("en-PH", {
                        month: "long",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                      {m.bookings}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm font-semibold">
                      {formatPesosFromCents(m.revenueCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

type PageEntry = number | "gap";

/** Mirrors AdminPagination: first 2, last 2, and ±2 around the current page. */
function buildPageList(current: number, total: number): PageEntry[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const always = new Set([1, 2, total - 1, total]);
  const window = new Set(
    [current - 2, current - 1, current, current + 1, current + 2].filter(
      (p) => p >= 1 && p <= total,
    ),
  );
  const visible = Array.from(new Set([...always, ...window])).sort((a, b) => a - b);

  const result: PageEntry[] = [];
  let prev = 0;
  for (const p of visible) {
    if (p - prev > 1) result.push("gap");
    result.push(p);
    prev = p;
  }
  return result;
}
