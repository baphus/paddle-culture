import { getDb } from "@/db/client";
import { listCourts } from "@/lib/admin/config";
import PageHeader from "@/components/admin/page-header";
import CourtsManager from "./courts-manager";

export const dynamic = "force-dynamic";

export default async function CourtsPage() {
  let db;
  try {
    db = getDb();
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title="Courts" />
        <p className="text-sm text-warm-muted">Database is not configured.</p>
      </div>
    );
  }

  let courts: Awaited<ReturnType<typeof listCourts>>;
  try {
    courts = await listCourts(db);
  } catch (err) {
    console.error("[courts] data fetch failed:", err);
    return (
      <div className="space-y-6">
        <PageHeader title="Courts" />
        <p className="text-sm text-warm-muted">
          Could not load data. Check your database connection and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Courts"
        description="Inactive courts are hidden from booking but retain all history."
      />
      <CourtsManager initial={courts} />
    </div>
  );
}
