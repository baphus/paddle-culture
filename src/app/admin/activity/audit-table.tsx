"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileText,
  Info,
  KeyRound,
  Pencil,
  Tag,
  User,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminFilterDropdown,
  FilterGroupSection,
} from "@/components/admin/admin-filter-dropdown";
import { cn } from "@/lib/utils";
import type { AuditRow } from "./columns";
import { formatAt, formatDayHeader, formatClock, initialsOf } from "./columns";

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

// ── tone helpers ────────────────────────────────────────────────────────────
// Dot + badge tint per verb, mirroring AuditActionBadge's colour grouping.
const TONES = {
  emerald: { badge: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" },
  rose: { badge: "bg-rose-50 text-rose-800", dot: "bg-rose-500" },
  sky: { badge: "bg-sky-50 text-sky-800", dot: "bg-sky-500" },
  violet: { badge: "bg-violet-50 text-violet-800", dot: "bg-violet-500" },
  zinc: { badge: "bg-zinc-50 text-zinc-700", dot: "bg-zinc-500" },
} as const;

type ToneKey = keyof typeof TONES;

function toneOf(action: string): ToneKey {
  if (action.startsWith("admin_invite") || action.startsWith("admin_profile"))
    return "violet";
  const verb = action.slice(action.lastIndexOf(".") + 1);
  if (verb === "approve" || verb === "create") return "emerald";
  if (verb === "reject" || verb === "delete") return "rose";
  if (verb === "update" || verb === "status") return "sky";
  return "zinc";
}

/** "admin_invite.generate" → "Generate invite". */
function humanizeAction(action: string): string {
  const [scope, verb] = action.split(".");
  const noun = (scope ?? "").replace(/_/g, " ");
  if (!verb) return noun;
  return `${verb[0]?.toUpperCase()}${verb.slice(1)} ${noun}`;
}

/** Icon bubble for non-people actions; people actions get an initials avatar. */
function ActivityIcon({ action }: { action: string }) {
  const verb = action.slice(action.lastIndexOf(".") + 1);
  if (action.startsWith("admin_invite")) return <KeyRound className="size-3.5" />;
  if (verb === "update" || verb === "status")
    return <Pencil className="size-3.5" />;
  if (verb === "create") return <Tag className="size-3.5" />;
  if (verb === "delete") return <FileText className="size-3.5" />;
  return <User className="size-3.5" />;
}

const isSystemActor = (actor: string) =>
  actor === "system" || actor.startsWith("system:");

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

  let currentDay = "";

  return (
    <div className="space-y-4">
      {/* Feed header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
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
      </div>

      {/* Feed */}
      {rows.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
          <Info className="size-5 opacity-50" />
          <span>No activity yet.</span>
        </div>
      ) : (
        <div className="space-y-1">
          {rows.map((row) => {
            const day = formatDayHeader(row.at);
            const showDay = currentDay !== day;
            if (showDay) currentDay = day;

            const tone = TONES[toneOf(row.action)];
            const system = isSystemActor(row.actor);
            const hasDiff = row.before != null || row.after != null;
            const isExpanded = expandedId === row.id;

            return (
              <div key={row.id}>
                {/* Day heading */}
                {showDay && (
                  <h2 className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground first:mt-0 md:text-sm">
                    {day}
                  </h2>
                )}

                {/* Row */}
                <div className="relative flex gap-2 md:gap-3">
                  {/* Connector line */}
                  <div className="absolute left-3 top-10 bottom-0 w-px bg-border md:left-4 md:top-12" />

                  {/* Avatar or icon bubble */}
                  <div className="relative z-10">
                    {system ? (
                      <div className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground md:size-8">
                        <ActivityIcon action={row.action} />
                      </div>
                    ) : (
                      <Avatar className="size-6 md:size-8">
                        <AvatarFallback className="bg-primary text-[10px] font-medium text-primary-foreground md:text-xs">
                          {initialsOf(row.actor)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1 pb-4">
                    <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:gap-2 md:text-sm">
                      <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                        <span className="font-medium text-foreground">
                          {row.actor}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn(tone.badge, "gap-1 text-xs")}
                        >
                          <span className={cn("size-1.5 rounded-full", tone.dot)} />
                          {humanizeAction(row.action)}
                        </Badge>
                        <span className="text-muted-foreground">on</span>
                        <span className="font-medium text-foreground">
                          {row.entity}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.entity_id}
                        </span>
                      </div>
                      <span
                        className="text-xs text-muted-foreground sm:ml-auto md:text-sm"
                        title={formatAt(row.at)}
                      >
                        {formatClock(row.at)}
                      </span>
                    </div>

                    {/* Diff affordance */}
                    {hasDiff && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : row.id)
                        }
                        className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        <ArrowLeftRight className="size-3" />
                        {isExpanded ? "Hide changes" : "View changes"}
                      </button>
                    )}

                    {/* Quote-box diff, like the reference's comment box */}
                    {isExpanded && (
                      <div className="mt-2 grid gap-2 rounded-lg bg-muted p-2 text-xs leading-relaxed md:grid-cols-2 md:p-3">
                        <div>
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Before
                          </span>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px]">
                            {JSON.stringify(row.before ?? null, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            After
                          </span>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px]">
                            {JSON.stringify(row.after ?? null, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
