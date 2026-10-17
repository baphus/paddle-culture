import { getDb } from "@/db/client";
import { listCourts, listPricingRules } from "@/lib/admin/config";
import CourtsPricingManager from "./courts-pricing-manager";

export const dynamic = "force-dynamic";

export default async function CourtsPage() {
  let db;
  try {
    db = getDb();
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Courts &amp; Pricing</h1>
        <p className="text-sm text-muted-foreground">Database is not configured.</p>
      </div>
    );
  }

  let courts: Awaited<ReturnType<typeof listCourts>>;
  let rules: Awaited<ReturnType<typeof listPricingRules>>;
  try {
    [courts, rules] = await Promise.all([listCourts(db), listPricingRules(db)]);
  } catch (err) {
    console.error("[courts] data fetch failed:", err);
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Courts &amp; Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Could not load data. Check your database connection and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Courts &amp; Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Rates are editable in place — day-type / time-band vocabulary is fixed and
          every change is audit-logged.
        </p>
      </div>
      <CourtsPricingManager courts={courts} rules={rules} />
    </div>
  );
}
