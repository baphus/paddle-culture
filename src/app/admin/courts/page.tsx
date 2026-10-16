import { getDb } from "@/db/client";
import { listCourts } from "@/lib/admin/config";
import CourtsManager from "./courts-manager";

export const dynamic = "force-dynamic";

export default async function CourtsPage() {
  let db;
  try {
    db = getDb();
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Courts</h1>
        <p className="text-sm text-muted-foreground">Database is not configured.</p>
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
        <h1 className="text-2xl font-semibold tracking-tight">Courts</h1>
        <p className="text-sm text-muted-foreground">
          Could not load data. Check your database connection and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Courts</h1>
        <p className="text-sm text-muted-foreground">
          Inactive courts are hidden from booking but retain all history.
        </p>
      </div>
      <CourtsManager initial={courts} />
    </div>
  );
}
