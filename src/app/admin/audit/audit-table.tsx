"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import {
  AdminFilterDropdown,
  FilterGroupSection,
} from "@/components/admin/admin-filter-dropdown";
import { buildColumns, type AuditRow } from "./columns";

const PAGE_SIZE = 25;

// Known audit actions, offered as suggestions only — the server matches on a
// substring (ilike), so any free-text action still works.
const KNOWN_ACTIONS = [
  "booking.approve",
  "booking.reject",
  "booking.create",
  "court.create",
  "court.status",
  "pricing.update",
  "pricing.create",
  "pricing.delete",
  "hours.create",
  "hours.delete",
  "closure.create",
  "closure.delete",
  "admin_invite.generate",
  "admin_invite.use",
  "admin_invite.delete",
  "admin_profile.update",
];

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
    if (q === filters.q) return;
    const t = setTimeout(() => router.replace(href({ q })), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filterActions = (
    <>
      <AdminFilterDropdown
        label={filters.action ? `Filter: ${filters.action}` : "Filter"}
        onApply={(values) => router.push(href({ action: values.action ?? "" }))}
        onReset={() => router.push(href({ action: "" }))}
      >
        <FilterGroupSection title="Action">
          <Input
            name="action"
            list="audit-action-suggestions"
            defaultValue={filters.action}
            placeholder="e.g. booking.approve"
            className="w-full"
          />
          <datalist id="audit-action-suggestions">
            {KNOWN_ACTIONS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </FilterGroupSection>
      </AdminFilterDropdown>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setWithDiff((v) => !v)}
      >
        {withDiff ? "Hide before/after" : "Show before/after"}
      </Button>
    </>
  );

  return (
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
      actions={filterActions}
    />
  );
}
