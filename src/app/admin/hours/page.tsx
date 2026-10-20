import { getDb } from "@/db/client";
import { listClosures, listCourts, listHours, listPricingRules } from "@/lib/admin/config";
import HoursManager from "./hours-manager";

export const dynamic = "force-dynamic";

const PAGE_DESCRIPTION =
  "Per-court rates, opening hours every day, and closures in one place.";

export default async function CourtSetupPage() {
  let db;
  try {
    db = getDb();
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Court Setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">{PAGE_DESCRIPTION}</p>
        <p className="text-sm text-muted-foreground">Database is not configured.</p>
      </div>
    );
  }

  let hours: Awaited<ReturnType<typeof listHours>>;
  let closures: Awaited<ReturnType<typeof listClosures>>;
  let courts: Awaited<ReturnType<typeof listCourts>>;
  let rules: Awaited<ReturnType<typeof listPricingRules>>;
  try {
    [hours, closures, courts, rules] = await Promise.all([
      listHours(db),
      listClosures(db),
      listCourts(db),
      listPricingRules(db),
    ]);
  } catch (err) {
    console.error("[court-setup] data fetch failed:", err);
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Court Setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">{PAGE_DESCRIPTION}</p>
        <p className="text-sm text-muted-foreground">
          Could not load data. Check your database connection and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Court Setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">{PAGE_DESCRIPTION}</p>
      </div>
      <HoursManager hours={hours} closures={closures} courts={courts} rules={rules} />
    </div>
  );
}
