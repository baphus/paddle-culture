import Link from "next/link";
import { count, desc } from "drizzle-orm";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/db/client";
import { auditLog } from "@/db/schema";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function summarize(value: unknown): string {
  if (value == null) return "—";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

// Read-only audit log (append-only by convention; no actions here).
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(first(sp.page), 10) || 1);

  let db;
  try {
    db = getDb();
  } catch {
    return (
      <main>
        <h1>Audit log</h1>
        <p>Database is not configured.</p>
      </main>
    );
  }
  const totalRows = await db.select({ n: count() }).from(auditLog);
  const total = totalRows[0]?.n ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const safePage = total === 0 ? 1 : Math.min(page, Math.max(1, totalPages));
  const rows = await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.at))
    .limit(PAGE_SIZE)
    .offset((safePage - 1) * PAGE_SIZE);

  return (
    <main>
      <h1>Audit log</h1>
      <p>
        <Link href="/admin">← Admin home</Link>
      </p>
      <p>
        {total} event(s)
        {totalPages > 1 ? ` — page ${safePage} of ${totalPages}` : null}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>At</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Entity ID</TableHead>
            <TableHead>Before</TableHead>
            <TableHead>After</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.at.toISOString()}</TableCell>
              <TableCell>{r.actor}</TableCell>
              <TableCell>{r.action}</TableCell>
              <TableCell>{r.entity}</TableCell>
              <TableCell>{r.entityId}</TableCell>
              <TableCell>{summarize(r.before)}</TableCell>
              <TableCell>{summarize(r.after)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {totalPages > 1 ? (
        <div>
          {safePage > 1 ? (
            <Link href={`/admin/audit?page=${safePage - 1}`}>← Prev</Link>
          ) : null}{" "}
          {safePage < totalPages ? (
            <Link href={`/admin/audit?page=${safePage + 1}`}>Next →</Link>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
