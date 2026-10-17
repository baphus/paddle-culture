"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, Info, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AdminFilterDropdown,
  FilterGroupSection,
} from "@/components/admin/admin-filter-dropdown";
import {
  AuditActionBadge,
} from "@/components/admin/status-badge";
import { cn } from "@/lib/utils";
import type { AuditRow } from "./columns";
import { summarize, formatAt } from "./columns";

const PAGE_SIZE = 25;

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

export default function ActivityTimeline({
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
  const [q, setQ] = useState(filters.q);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function href(next: Partial<AuditFilters> & { page?: number }): string {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    if (merged.q) params.set("q", merged.q);
    if (merged.action) params.set("action", merged.action);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const qs = params.toString();
    return `/admin/activity${qs ? `?${qs}` : ""}`;
  }

  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => router.replace(href({ q })), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search actor, entity, ID…"
          className="max-w-xs"
        />
        <AdminFilterDropdown
          label={filters.action ? `Filter: ${filters.action}` : "Filter"}
          onApply={(values) =>
            router.push(href({ action: values.action ?? "" }))
          }
          onReset={() => router.push(href({ action: "" }))}
        >
          <FilterGroupSection title="Action">
            <Input
              name="action"
              list="activity-action-suggestions"
              defaultValue={filters.action}
              placeholder="e.g. booking.approve"
              className="w-full"
            />
            <datalist id="activity-action-suggestions">
              {KNOWN_ACTIONS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </FilterGroupSection>
        </AdminFilterDropdown>
      </div>

      {/* Timeline */}
      {rows.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
          <Info className="size-5 opacity-50" />
          <span>No activity yet.</span>
        </div>
      ) : (
        <div className="relative pl-2">
          {/* Vertical rail */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
          <div className="space-y-3">
            {rows.map((row) => {
              const isExpanded = expandedId === row.id;
              return (
                <div key={row.id} className="relative pl-6">
                  {/* Dot */}
                  <div className="absolute left-0 top-2 size-3.5 rounded-full border-2 border-background bg-muted-foreground/40" />
                  <div className="rounded-lg border bg-card p-3 transition-shadow hover:shadow-sm">
                    {/* Header row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatAt(row.at)}
                      </span>
                      <AuditActionBadge action={row.action} />
                      <span className="text-xs text-muted-foreground">
                        by <span className="font-medium text-foreground">{row.actor}</span>
                      </span>
                    </div>
                    {/* Entity row */}
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{row.entity}</span>
                      <span>·</span>
                      <span className="font-mono">{row.entity_id}</span>
                    </div>
                    {/* Expandable diff */}
                    {(row.before != null || row.after != null) && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                        className={cn(
                          "mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
                        )}
                      >
                        <Pencil className="size-3" />
                        {isExpanded ? "Hide changes" : "View changes"}
                      </button>
                    )}
                    {isExpanded && (
                      <div className="mt-2 grid grid-cols-2 gap-3 text-[11px] font-mono">
                        <div>
                          <span className="mb-1 block font-semibold uppercase tracking-wider text-muted-foreground">
                            Before
                          </span>
                          <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-[11px]">
                            {JSON.stringify(row.before ?? null, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <span className="mb-1 block font-semibold uppercase tracking-wider text-muted-foreground">
                            After
                          </span>
                          <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-[11px]">
                            {JSON.stringify(row.after ?? null, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2 pt-2">
          <span className="text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => router.push(href({ page: page - 1 }))}
          >
            <ChevronLeftIcon className="size-4" />
            <span className="sr-only">Previous page</span>
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= pageCount}
            onClick={() => router.push(href({ page: page + 1 }))}
          >
            <ChevronRightIcon className="size-4" />
            <span className="sr-only">Next page</span>
          </Button>
        </div>
      )}
    </div>
  );
}
