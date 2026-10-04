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

  const rules = await listPricingRules(db);

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
