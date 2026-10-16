import { getDb } from "@/db/client";
import PageHeader from "@/components/admin/page-header";
import { requireAdmin } from "@/lib/admin/session";
import AuditTable from "./audit-table";
import type { AuditRow } from "./columns";

export const dynamic = "force-dynamic";

const LIMIT = 500;

export default async function AuditPage() {
  await requireAdmin();

  let db;
  try {
    db = getDb();
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit Log" />
        <p className="text-sm text-muted-foreground">Database is not configured.</p>
      </div>
    );
  }

  // No pagination: the client table filters/sorts/pages the most recent slice.
  const { data } = await db
    .from("audit_log")
    .select("id,actor,action,entity,entity_id,before,after,at")
    .order("at", { ascending: false })
    .limit(LIMIT);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Log"
        description={`Read-only event history — latest ${LIMIT} events.`}
      />
      <AuditTable rows={(data ?? []) as AuditRow[]} />
    </div>
  );
}
