"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AdminFilterDropdown,
  FilterGroupSection,
} from "@/components/admin/admin-filter-dropdown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── URL helper (mirrors the one in page.tsx) ────────────────────────────────

function buildHref(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const str = sp.toString();
  return `/admin/bookings${str ? `?${str}` : ""}`;
}

// ── Component ───────────────────────────────────────────────────────────────

interface BookingsFilterDropdownProps {
  q: string;
  status: string;
  from: string;
  to: string;
}

export default function BookingsFilterDropdown({
  q,
  status,
  from,
  to,
}: BookingsFilterDropdownProps) {
  const router = useRouter();

  const handleApply = useCallback(
    (values: Record<string, string>) => {
      router.push(
        buildHref({
          q: q || undefined,
          status: status !== "all" ? status : undefined,
          from: values.from || undefined,
          to: values.to || undefined,
        }),
      );
    },
    [router, q, status],
  );

  const handleReset = useCallback(() => {
    router.push(
      buildHref({
        q: q || undefined,
        status: status !== "all" ? status : undefined,
      }),
    );
  }, [router, q, status]);

  return (
    <AdminFilterDropdown
      count={[from, to].filter(Boolean).length}
      defaultValues={{ from, to }}
      onApply={handleApply}
      onReset={handleReset}
    >
      <FilterGroupSection title="Date Range">
        <div className="flex flex-col gap-2">
          <div className="space-y-0.5">
            <Label
              htmlFor="filter-from"
              className="text-[11px] font-semibold text-ink/50"
            >
              From
            </Label>
            <Input
              id="filter-from"
              name="from"
              type="date"
              defaultValue={from}
              className="h-8 rounded-lg border-line text-sm w-full"
            />
          </div>
          <div className="space-y-0.5">
            <Label
              htmlFor="filter-to"
              className="text-[11px] font-semibold text-ink/50"
            >
              To
            </Label>
            <Input
              id="filter-to"
              name="to"
              type="date"
              defaultValue={to}
              className="h-8 rounded-lg border-line text-sm w-full"
            />
          </div>
        </div>
      </FilterGroupSection>
    </AdminFilterDropdown>
  );
}
