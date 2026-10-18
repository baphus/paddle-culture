import Link from "next/link";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Jira-style numbered pagination.
 *
 * Renders: « Prev  1  2  …  5  6  [7]  8  9  …  14  15  Next »
 * Always shows first 2, last 2, and a window of ±2 around current page.
 * Gaps are represented with "…" (non-interactive).
 */

interface AdminPaginationProps {
  page: number;
  totalPages: number;
  /**
   * Build a URL for a given page number — receives page, returns href string.
   * Omit when using `onPageChange` (client-state pagination, e.g. tables whose
   * rows are already in memory and shouldn't cost a navigation).
   */
  hrefFor?: (page: number) => string;
  /** Called with the target page when `hrefFor` is omitted. */
  onPageChange?: (page: number) => void;
  /** Total row count shown as "X results" on the left */
  total?: number;
  /** Optional detail after the count, e.g. "showing 26–37". */
  rangeLabel?: string;
  className?: string;
}

export default function AdminPagination({
  page,
  totalPages,
  hrefFor,
  onPageChange,
  total,
  rangeLabel,
  className,
}: AdminPaginationProps) {
  if (totalPages <= 1) return null;

  const callbackMode = !hrefFor && !!onPageChange;

  if (!hrefFor && !onPageChange) {
    throw new Error("AdminPagination needs either hrefFor or onPageChange");
  }

  const pages = buildPageList(page, totalPages);

  // In callback mode a page control is a button that reports the target page;
  // in link mode it stays a <Link>. Active/disabled already render as buttons.
  const link = (target: number, props: Omit<PaginationLinkProps, "href">) =>
    callbackMode ? (
      <PaginationLink {...props} href={undefined} onClick={() => onPageChange!(target)} />
    ) : (
      <PaginationLink {...props} href={hrefFor!(target)} />
    );

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-xs",
        className,
      )}
    >
      {/* Left: result count */}
      <p className="text-muted-foreground">
        {total !== undefined
          ? `${total.toLocaleString()} result${total === 1 ? "" : "s"}`
          : `Page ${page} of ${totalPages}`}
        {rangeLabel ? ` · ${rangeLabel}` : ""}
      </p>

      {/* Right: page controls */}
      <nav aria-label="Pagination" className="flex items-center gap-1">
        {/* Prev */}
        {link(page - 1, {
          disabled: page <= 1,
          "aria-label": "Previous page",
          children: (
            <>
              <ChevronLeft className="size-3.5" />
              <span className="hidden sm:inline">Prev</span>
            </>
          ),
        })}

        {/* Page numbers */}
        {pages.map((entry, i) =>
          entry === "gap" ? (
            <span
              key={`gap-${i}`}
              className="flex h-7 w-7 items-center justify-center text-muted-foreground"
            >
              <MoreHorizontal className="size-3.5" />
            </span>
          ) : (
            link(entry, {
              key: entry,
              active: entry === page,
              "aria-label": `Page ${entry}`,
              "aria-current": entry === page ? "page" : undefined,
              children: entry,
            })
          ),
        )}

        {/* Next */}
        {link(page + 1, {
          disabled: page >= totalPages,
          "aria-label": "Next page",
          children: (
            <>
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="size-3.5" />
            </>
          ),
        })}
      </nav>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

type PageEntry = number | "gap";

function buildPageList(current: number, total: number): PageEntry[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const always = new Set([1, 2, total - 1, total]);
  const window = new Set(
    [current - 2, current - 1, current, current + 1, current + 2].filter(
      (p) => p >= 1 && p <= total,
    ),
  );
  const visible = Array.from(new Set([...always, ...window])).sort(
    (a, b) => a - b,
  );

  const result: PageEntry[] = [];
  let prev = 0;
  for (const p of visible) {
    if (p - prev > 1) result.push("gap");
    result.push(p);
    prev = p;
  }
  return result;
}

// ─── PaginationLink ───────────────────────────────────────────────────────────

interface PaginationLinkProps {
  href?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  key?: number;
  children?: React.ReactNode;
  "aria-label"?: string;
  "aria-current"?: "page" | undefined;
}

function PaginationLink({
  href,
  active = false,
  disabled = false,
  onClick,
  children,
  ...rest
}: PaginationLinkProps) {
  const variant = active ? "default" : disabled ? "ghost" : "outline";
  const cls = "h-7 min-w-7 px-1.5";

  // No href → local state pagination. Also covers active/disabled, which are
  // never navigable.
  if (!href || disabled || active) {
    return (
      <Button
        variant={variant}
        className={cls}
        disabled={disabled && !active}
        onClick={onClick}
        {...rest}
      >
        {children}
      </Button>
    );
  }

  return (
    <Button
      variant={variant}
      className={cls}
      nativeButton={false}
      render={<Link href={href} />}
      {...rest}
    >
      {children}
    </Button>
  );
}
