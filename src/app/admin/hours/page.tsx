import { getDb } from "@/db/client";
import { listClosures, listCourts, listHours } from "@/lib/admin/config";
import HoursManager from "./hours-manager";

export const dynamic = "force-dynamic";

export default async function HoursPage() {
  let db;
  try {
    db = getDb();
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Hours &amp; Closures</h1>
        <p className="text-sm text-muted-foreground">Database is not configured.</p>
      </div>
    );
  }

  let hours: Awaited<ReturnType<typeof listHours>>;
  let closures: Awaited<ReturnType<typeof listClosures>>;
  let courts: Awaited<ReturnType<typeof listCourts>>;
  try {
    [hours, closures, courts] = await Promise.all([
      listHours(db),
      listClosures(db),
      listCourts(db),
    ]);
  } catch (err) {
    console.error("[hours] data fetch failed:", err);
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Hours &amp; Closures</h1>
        <p className="text-sm text-muted-foreground">
          Could not load data. Check your database connection and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hours &amp; Closures</h1>
        <p className="text-sm text-muted-foreground">
          A court with zero hours rows is treated as open all day. Closures always
          override hours.
        </p>
      </div>
      <HoursManager initialHours={hours} initialClosures={closures} courts={courts} />
    </div>
  );
}
