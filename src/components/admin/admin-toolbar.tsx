"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Jira-style table toolbar.
 *
 * Usage:
 *   <AdminToolbar action="/admin/bookings">
 *     <AdminToolbarSearch name="q" defaultValue={q} placeholder="Search…" />
 *     <AdminToolbarFilters>
 *       <AdminToolbarChip name="status" value="Pending" active={status === "Pending"} label="Pending" />
 *       …
 *     </AdminToolbarFilters>
 *   </AdminToolbar>
 *
 * The component is a plain HTML form so it works without JS (progressive enhancement).
 * All hidden inputs are auto-generated so sibling filters are preserved on submit.
 */

// ── Toolbar root (is a <form>) ────────────────────────────────────────────

interface AdminToolbarProps extends React.ComponentProps<"form"> {
  action: string;
  /** Extra params that should always be forwarded (e.g. date range from URL). */
  hiddenParams?: Record<string, string>;
  children: React.ReactNode;
  className?: string;
}

export function AdminToolbar({
  action,
  hiddenParams = {},
  children,
  className,
  ...props
}: AdminToolbarProps) {
  return (
    <form
      method="get"
      action={action}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2.5",
        className,
      )}
      {...props}
    >
      {Object.entries(hiddenParams).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      {children}
    </form>
  );
}

// ── Search input ──────────────────────────────────────────────────────────

interface AdminToolbarSearchProps {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  /** Other field values that should be preserved when the search changes */
  hiddenParams?: Record<string, string>;
}

export function AdminToolbarSearch({
  name,
  defaultValue = "",
  placeholder = "Search…",
  hiddenParams = {},
}: AdminToolbarSearchProps) {
  return (
    <div className="relative flex min-w-[180px] flex-1 items-center sm:max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 z-10 size-3.5 text-muted-foreground" />
      <Input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        className="pl-8"
      />
      {/* Hidden sibling params */}
      {Object.entries(hiddenParams).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
    </div>
  );
}

// ── Filter chips group (right side) ──────────────────────────────────────

export function AdminToolbarFilters({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-auto flex flex-wrap items-center gap-1.5">{children}</div>
  );
}

// ── Individual filter chip button ─────────────────────────────────────────

interface AdminToolbarChipProps {
  /** URL param name this chip controls */
  name: string;
  /** Value this chip sets when clicked */
  value: string;
  /** Whether this chip is currently active */
  active: boolean;
  label: string;
  /** Extra dot badge count shown when active */
  count?: number;
}

export function AdminToolbarChip({
  name,
  value,
  active,
  label,
  count,
}: AdminToolbarChipProps) {
  return (
    <Button
      type="submit"
      name={name}
      value={value}
      size="sm"
      variant={active ? "default" : "outline"}
      className="rounded-full"
    >
      {label}
      {active && count !== undefined && (
        <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary-foreground/20 px-1 text-[10px] font-bold leading-none">
          {count}
        </span>
      )}
    </Button>
  );
}

// ── "All" / clear-filter chip ─────────────────────────────────────────────

interface AdminToolbarAllChipProps {
  /** True when no specific filter is active (shows this as selected) */
  active: boolean;
  label?: string;
}

export function AdminToolbarAllChip({ active, label = "All" }: AdminToolbarAllChipProps) {
  return (
    <Button
      type="submit"
      name="_all"
      value="1"
      size="sm"
      variant={active ? "default" : "outline"}
      className="rounded-full"
    >
      {label}
    </Button>
  );
}

// ── Active-filters summary bar (shows which filters are on + clear button) ─

interface ActiveFilter {
  label: string;
  clearHref: string;
}

interface AdminActiveFiltersProps {
  filters: ActiveFilter[];
  clearAllHref: string;
}

export function AdminActiveFilters({ filters, clearAllHref }: AdminActiveFiltersProps) {
  if (filters.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="font-semibold">Filters:</span>
      {filters.map((f) => (
        <a
          key={f.label}
          href={f.clearHref}
          className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 font-semibold text-foreground hover:bg-muted/70"
        >
          {f.label}
          <X className="size-3" />
        </a>
      ))}
      <a href={clearAllHref} className="ml-1 font-semibold text-primary hover:underline">
        Clear all
      </a>
    </div>
  );
}
