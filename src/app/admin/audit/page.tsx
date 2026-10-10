import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/db/client";
import PageHeader from "@/components/admin/page-header";
import AdminPagination from "@/components/admin/admin-pagination";
import {
  AdminToolbar,
  AdminToolbarSearch,
  AdminToolbarFilters,
  AdminToolbarChip,
  AdminToolbarAllChip,
} from "@/components/admin/admin-toolbar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const KNOWN_ACTIONS = [
  "approve",
  "reject",
  "create",
  "update",
  "delete",
] as const;
type KnownAction = (typeof KNOWN_ACTIONS)[number];

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function summarize(value: unknown): string {
  if (value == null) return "—";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > 100 ? `${s.slice(0, 100)}…` : s;
}

function formatAt(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionAccent(action: string): "flame" | "pine" | "error" | "muted" {
  if (action === "approve") return "pine";
  if (action === "reject") return "error";
  if (action === "delete") return "error";
  if (action === "create") return "flame";
  return "muted";
}

function actionClass(action: string): string {
  const map: Record<string, string> = {
    approve: "bg-live text-pine",
    create: "bg-flame-light text-flame",
    reject: "bg-surface-dim text-error",
    delete: "bg-surface-dim text-error",
    update: "bg-oat text-cocoa",
  };
  return map[action] ?? "bg-oat text-ink";
}

function pageHref(q: string, action: string, page: number): string {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (action !== "all") sp.set("action", action);
  sp.set("page", String(page));
  return `/admin/audit?${sp.toString()}`;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(first(sp.page), 10) || 1);
  const q = first(sp.q).slice(0, 100);
  const rawAction = first(sp.action);
  const action =
    sp._all === "1" || !KNOWN_ACTIONS.includes(rawAction as KnownAction)
      ? "all"
      : rawAction;

  let db;
  try {
    db = getDb();
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit Log" />
        <p className="text-sm text-warm-muted">Database is not configured.</p>
      </div>
    );
  }

  // ── Build query ────────────────────────────────────────────────────────────
  // Count query
  let countQuery = db
    .from("audit_log")
    .select("id", { count: "exact", head: true });

  // Data query — use all columns
  let dataQuery = db
    .from("audit_log")
    .select("id,actor,action,entity,entity_id,before,after,at")
    .order("at", { ascending: false });

  if (q) {
    // Supabase OR filter for text search across multiple columns
    const orFilter = `actor.ilike.%${q}%,entity.ilike.%${q}%,entity_id.ilike.%${q}%`;
    countQuery = countQuery.or(orFilter);
    dataQuery = dataQuery.or(orFilter);
  }
  if (action !== "all") {
    countQuery = countQuery.eq("action", action);
    dataQuery = dataQuery.eq("action", action);
  }

  const { count } = await countQuery;
  const total = count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const safePage = total === 0 ? 1 : Math.min(page, Math.max(1, totalPages));

  const offset = (safePage - 1) * PAGE_SIZE;
  const { data: rows } = await dataQuery.range(offset, offset + PAGE_SIZE - 1);

  type AuditRow = {
    id: string;
    actor: string;
    action: string;
    entity: string;
    entity_id: string;
    before: unknown;
    after: unknown;
    at: string;
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Audit Log" description="Read-only event history." />

      {/* ── Toolbar: search + action filter chips ────────────────────── */}
      <AdminToolbar action="/admin/audit">
        <AdminToolbarSearch
          name="q"
          defaultValue={q}
          placeholder="Search actor, entity, ID…"
        />
        <AdminToolbarFilters>
          <AdminToolbarAllChip active={action === "all"} />
          {KNOWN_ACTIONS.map((a) => (
            <AdminToolbarChip
              key={a}
              name="action"
              value={a}
              active={action === a}
              label={a.charAt(0).toUpperCase() + a.slice(1)}
              accent={actionAccent(a)}
            />
          ))}
        </AdminToolbarFilters>
      </AdminToolbar>

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <p className="text-xs font-semibold text-ink/50">
            {total > 0
              ? `${total.toLocaleString()} event${total === 1 ? "" : "s"}`
              : "No events found"}
          </p>
          {total > 0 && (
            <p className="text-xs text-warm-muted">
              Page {safePage} of {totalPages}
            </p>
          )}
        </div>

        {(rows ?? []).length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-oat/40 hover:bg-oat/40 border-b border-line">
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Time (Manila)
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Actor
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Action
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Entity
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Entity ID
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    Before
                  </TableHead>
                  <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-ink/50">
                    After
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows as AuditRow[]).map((r) => (
                  <TableRow
                    key={r.id}
                    className="border-b border-line/60 align-top transition-colors hover:bg-oat/20"
                  >
                    <TableCell className="px-4 py-3 whitespace-nowrap text-xs text-ink/70">
                      {formatAt(r.at)}
                    </TableCell>
                    <TableCell className="px-4 py-3 max-w-[120px] truncate text-xs text-ink/80">
                      {r.actor}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${actionClass(r.action)}`}
                      >
                        {r.action}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-xs text-ink/70">
                      {r.entity}
                    </TableCell>
                    <TableCell className="px-4 py-3 max-w-[80px] truncate font-mono text-xs text-warm-muted">
                      {r.entity_id}
                    </TableCell>
                    <TableCell className="px-4 py-3 max-w-[200px] text-xs text-warm-muted">
                      <span className="block whitespace-pre-wrap break-words">
                        {summarize(r.before)}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 max-w-[200px] text-xs text-warm-muted">
                      <span className="block whitespace-pre-wrap break-words">
                        {summarize(r.after)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-warm-muted">
            {total === 0 && !q && action === "all"
              ? "No audit events yet."
              : "No events match your filters."}
          </div>
        )}
      </div>

      {/* ── Pagination ────────────────────────────────────────────────── */}
      <AdminPagination
        page={safePage}
        totalPages={totalPages}
        total={total}
        hrefFor={(p) => pageHref(q, action, p)}
      />
    </div>
  );
}
