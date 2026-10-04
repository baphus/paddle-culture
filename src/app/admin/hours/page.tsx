import { getDb } from "@/db/client";
import { listClosures, listCourts, listHours } from "@/lib/admin/config";
import PageHeader from "@/components/admin/page-header";
import HoursManager from "./hours-manager";

export const dynamic = "force-dynamic";

export default async function HoursPage() {
  let db;
  try {
    db = getDb();
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title="Hours & Closures" />
        <p className="text-sm text-warm-muted">Database is not configured.</p>
      </div>
    );
  }

  const [hours, closures, courts] = await Promise.all([
    listHours(db),
    listClosures(db),
    listCourts(db),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hours & Closures"
        description="A court with zero hours rows is treated as open all day. Closures always override hours."
      />
      <HoursManager initialHours={hours} initialClosures={closures} courts={courts} />
    </div>
  );
}
