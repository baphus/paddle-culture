import { getDb } from "@/db/client";
import { listPricingRules } from "@/lib/admin/config";
import PageHeader from "@/components/admin/page-header";
import PricingManager from "./pricing-manager";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  let db;
  try {
    db = getDb();
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title="Pricing" />
        <p className="text-sm text-warm-muted">Database is not configured.</p>
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
        <PageHeader title="Pricing" />
        <p className="text-sm text-warm-muted">
          Could not load data. Check your database connection and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing"
        description="Edit rates only — court / day-type / time-band vocabulary is fixed. Every change is audit-logged."
      />
      <PricingManager initial={rules} />
    </div>
  );
}
