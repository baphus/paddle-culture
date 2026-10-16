"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { buildColumns, type AuditRow } from "./columns";

const PAGE_SIZE = 25;

export interface AuditFilters {
  q: string;
  action: string;
}

export default function AuditTable({
  rows,
  page,
  pageCount,
  filters,
}: {
  rows: AuditRow[];
  page: number;
  pageCount: number;
  filters: AuditFilters;
}) {
  const router = useRouter();
  const [withDiff, setWithDiff] = useState(false);
  const [q, setQ] = useState(filters.q);
  const [action, setAction] = useState(filters.action);
  const columns = useMemo(() => buildColumns(withDiff), [withDiff]);

  // Server-side URL state; page resets to 1 whenever a filter changes.
  function href(next: Partial<AuditFilters> & { page?: number }): string {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.action) params.set("action", merged.action);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const qs = params.toString();
    return `/admin/audit${qs ? `?${qs}` : ""}`;
  }

  useEffect(() => {
    if (q === filters.q && action === filters.action) return;
    const t = setTimeout(() => router.replace(href({ q, action })), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, action]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Filter by action…"
          className="max-w-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setWithDiff((v) => !v)}
        >
          {withDiff ? "Hide before/after" : "Show before/after"}
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        manualPagination
        pageCount={pageCount}
        pageIndex={page - 1}
        onPageChange={(p) => router.push(href({ page: p + 1 }))}
        searchValue={q}
        onSearchChange={setQ}
        placeholder="Search actor, entity, ID…"
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
