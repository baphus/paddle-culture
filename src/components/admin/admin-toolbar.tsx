"use client";

import { useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Jira-style table toolbar.
 *
 * Usage:
 *   <AdminToolbar action="/admin/bookings">
 *     <AdminToolbarSearch name="q" defaultValue={q} placeholder="Search…" />
 *     <AdminToolbarFilters>
 *       <AdminToolbarFilterButton name="status" value="Pending" active={status === "Pending"} label="Pending" />
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
        "flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5",
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
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative flex min-w-[180px] flex-1 items-center sm:max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 size-3.5 text-warm-muted" />
      <input
        ref={inputRef}
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        className="h-8 w-full rounded-lg border border-line bg-transparent pl-8 pr-7 text-sm text-ink placeholder:text-warm-muted/60 focus:outline-none focus:ring-2 focus:ring-flame/30"
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
  /** Accent colour — defaults to the brand flame */
  accent?: "flame" | "pine" | "error" | "muted";
  /** Extra dot badge count shown when active */
  count?: number;
}

export function AdminToolbarChip({
  name,
  value,
  active,
  label,
  accent = "flame",
  count,
}: AdminToolbarChipProps) {
  const accentActive: Record<string, string> = {
    flame: "bg-flame text-white border-flame",
    pine: "bg-pine text-white border-pine",
    error: "bg-error text-white border-error",
    muted: "bg-ink/10 text-ink border-ink/20",
  };
  const accentInactive =
    "bg-white text-ink/70 border-line hover:border-ink/30 hover:bg-oat/60";

  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all",
        active ? accentActive[accent] : accentInactive,
      )}
    >
      {label}
      {active && count !== undefined && (
        <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-white/25 px-1 text-[10px] font-bold leading-none">
          {count}
        </span>
      )}
    </button>
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
    <button
      type="submit"
      name="_all"
      value="1"
      className={cn(
        "inline-flex h-7 items-center rounded-full border px-3 text-xs font-semibold transition-all",
        active
          ? "bg-ink text-white border-ink"
          : "bg-white text-ink/70 border-line hover:border-ink/30 hover:bg-oat/60",
      )}
    >
      {label}
    </button>
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
    <div className="flex flex-wrap items-center gap-2 text-xs text-warm-muted">
      <span className="font-semibold text-ink/50">Filters:</span>
      {filters.map((f) => (
        <a
          key={f.label}
          href={f.clearHref}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-oat px-2.5 py-0.5 font-semibold text-ink hover:bg-oat/80"
        >
          {f.label}
          <X className="size-3" />
        </a>
      ))}
      <a
        href={clearAllHref}
        className="ml-1 font-semibold text-flame hover:underline"
      >
        Clear all
      </a>
    </div>
  );
}
