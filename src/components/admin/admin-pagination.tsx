import Link from "next/link";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

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
  /** Build a URL for a given page number — receives page, returns href string */
  hrefFor: (page: number) => string;
  /** Total row count shown as "X results" on the left */
  total?: number;
  className?: string;
}

export default function AdminPagination({
  page,
  totalPages,
  hrefFor,
  total,
  className,
}: AdminPaginationProps) {
  if (totalPages <= 1) return null;

  const pages = buildPageList(page, totalPages);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-xs",
        className,
      )}
    >
      {/* Left: result count */}
      <p className="text-warm-muted">
        {total !== undefined
          ? `${total.toLocaleString()} result${total === 1 ? "" : "s"}`
          : `Page ${page} of ${totalPages}`}
      </p>

      {/* Right: page controls */}
      <nav aria-label="Pagination" className="flex items-center gap-1">
        {/* Prev */}
        <PaginationLink
          href={page > 1 ? hrefFor(page - 1) : undefined}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </PaginationLink>

        {/* Page numbers */}
        {pages.map((entry, i) =>
          entry === "gap" ? (
            <span
              key={`gap-${i}`}
              className="flex h-7 w-7 items-center justify-center text-warm-muted"
            >
              <MoreHorizontal className="size-3.5" />
            </span>
          ) : (
            <PaginationLink
              key={entry}
              href={hrefFor(entry)}
              active={entry === page}
              aria-label={`Page ${entry}`}
              aria-current={entry === page ? "page" : undefined}
            >
              {entry}
            </PaginationLink>
          ),
        )}

        {/* Next */}
        <PaginationLink
          href={page < totalPages ? hrefFor(page + 1) : undefined}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-3.5" />
        </PaginationLink>
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
  children: React.ReactNode;
  "aria-label"?: string;
  "aria-current"?: "page" | undefined;
}

function PaginationLink({
  href,
  active = false,
  disabled = false,
  children,
  ...rest
}: PaginationLinkProps) {
  const base =
    "inline-flex h-7 min-w-[1.75rem] items-center justify-center gap-0.5 rounded-md border px-1.5 font-semibold transition-all";
  const activeStyle = "bg-flame border-flame text-white cursor-default";
  const normalStyle =
    "bg-white border-line text-ink/70 hover:bg-oat hover:border-ink/20";
  const disabledStyle =
    "bg-white border-line text-ink/30 cursor-not-allowed pointer-events-none";

  const cls = cn(
    base,
    active ? activeStyle : disabled ? disabledStyle : normalStyle,
  );

  if (!href || disabled || active) {
    return (
      <span className={cls} {...rest}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}
