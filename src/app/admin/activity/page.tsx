import { getDb } from "@/db/client";
import PageHeader from "@/components/admin/page-header";
import { requireAdmin } from "@/lib/admin/session";
import ActivityTimeline from "./audit-table";
import type { AuditRow } from "./columns";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const PAGE_DESCRIPTION =
  "A record of actions taken across the admin dashboard.";

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

// PostgREST .or() reserves , ( ) % and \ — drop them so a search term cannot
// break the filter grammar (substring match is all this needs).
function cleanSearch(s: string): string {
  return s.replace(/[%,()\\]/g, "");
}

function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const q = cleanSearch(first(sp.q).slice(0, 100));
  const action = first(sp.action).slice(0, 100);
  const requestedPage = Math.max(1, Number.parseInt(first(sp.page), 10) || 1);

  let db;
  try {
    db = getDb();
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title="Activity" description={PAGE_DESCRIPTION} />
        <p className="text-sm text-muted-foreground">Database is not configured.</p>
      </div>
    );
  }

  let query = db
    .from("audit_log")
    .select("id,actor,action,entity,entity_id,before,after,at", {
      count: "exact",
    })
    .order("at", { ascending: false });
  if (q) {
    query = query.or(
      `actor.ilike.%${q}%,entity.ilike.%${q}%,entity_id.ilike.%${q}%`,
    );
  }
  if (action) query = query.ilike("action", `%${escapeIlike(action)}%`);

  const offset = (requestedPage - 1) * PAGE_SIZE;
  let rows: AuditRow[] = [];
  let total = 0;
  try {
    const { data, error, count } = await query.range(
      offset,
      offset + PAGE_SIZE - 1,
    );
    if (error) throw new Error(error.message);
    rows = (data ?? []) as AuditRow[];
    total = count ?? 0;
  } catch (err) {
    console.error("[activity] query failed:", err);
    return (
      <div className="space-y-6">
        <PageHeader title="Activity" description={PAGE_DESCRIPTION} />
        <p className="text-sm text-muted-foreground">
          Could not load the activity log. Check your database connection and try
          again.
        </p>
      </div>
    );
  }

  const pageCount = Math.ceil(total / PAGE_SIZE);
  const page = pageCount > 0 ? Math.min(requestedPage, pageCount) : 1;

  // Out-of-range request fetched the wrong slice — re-read the clamped page.
  if (page !== requestedPage) {
    const clamped = (page - 1) * PAGE_SIZE;
    const { data, error } = await query.range(clamped, clamped + PAGE_SIZE - 1);
    if (error) {
      console.error("[activity] query failed:", error.message);
      return (
        <div className="space-y-6">
          <PageHeader title="Activity" description={PAGE_DESCRIPTION} />
          <p className="text-sm text-muted-foreground">
            Could not load the activity log. Check your database connection and try
            again.
          </p>
        </div>
      );
    }
    rows = (data ?? []) as AuditRow[];
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Activity" description={PAGE_DESCRIPTION} />
      <ActivityTimeline
        rows={rows}
        page={page}
        pageCount={pageCount}
        filters={{ q: first(sp.q).slice(0, 100), action }}
      />
    </div>
  );
}
