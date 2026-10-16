import { getDb } from "@/db/client";
import { listPricingRules } from "@/lib/admin/config";
import PricingManager from "./pricing-manager";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  let db;
  try {
    db = getDb();
  } catch {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-sm text-muted-foreground">Database is not configured.</p>
      </div>
    );
  }

  let rules: Awaited<ReturnType<typeof listPricingRules>>;
  try {
    rules = await listPricingRules(db);
  } catch (err) {
    console.error("[pricing] data fetch failed:", err);
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Could not load data. Check your database connection and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Edit rates only — court / day-type / time-band vocabulary is fixed. Every
          change is audit-logged.
        </p>
      </div>
      <PricingManager initial={rules} />
    </div>
  );
}
