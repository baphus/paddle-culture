"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminFilterDropdown,
  FilterGroupSection,
  Input,
  Label,
} from "@/components/admin/admin-filter-dropdown";

/** Custom from/to range, applied through the URL like the bookings filters. */
export function RevenueRangeFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  // Controlled: Base UI's FieldControl warns when a `defaultValue` changes
  // after init (e.g. a preset navigation), so the inputs own their state.
  const [fromValue, setFromValue] = useState(from);
  const [toValue, setToValue] = useState(to);

  // Re-sync when the server sends a new range (preset click, back/forward).
  const [syncedRange, setSyncedRange] = useState(`${from}|${to}`);
  if (syncedRange !== `${from}|${to}`) {
    setSyncedRange(`${from}|${to}`);
    setFromValue(from);
    setToValue(to);
  }

  function push(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams();
    if (nextFrom) params.set("from", nextFrom);
    if (nextTo) params.set("to", nextTo);
    const qs = params.toString();
    router.push(`/admin/revenue${qs ? `?${qs}` : ""}`);
  }

  return (
    <AdminFilterDropdown
      label="Custom range"
      count={[from, to].filter(Boolean).length}
      onApply={(values) => push(values.from ?? "", values.to ?? "")}
      onReset={() => {
        setFromValue("");
        setToValue("");
        push("", "");
      }}
    >
      <FilterGroupSection title="Date range">
        <div className="flex flex-col gap-2">
          <div className="space-y-0.5">
            <Label htmlFor="filter-from" className="text-[11px] font-semibold">
              From
            </Label>
            <Input
              id="filter-from"
              name="from"
              type="date"
              value={fromValue}
              onChange={(e) => setFromValue(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="space-y-0.5">
            <Label htmlFor="filter-to" className="text-[11px] font-semibold">
              To
            </Label>
            <Input
              id="filter-to"
              name="to"
              type="date"
              value={toValue}
              onChange={(e) => setToValue(e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </FilterGroupSection>
    </AdminFilterDropdown>
  );
}
