import Link from "next/link";
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
      <main>
        <h1>Pricing</h1>
        <p>Database is not configured.</p>
      </main>
    );
  }
  const rules = await listPricingRules(db);
  return (
    <main>
      <h1>Pricing rules (values only)</h1>
      <p>
        <Link href="/admin">← Admin home</Link>
      </p>
      <p>
        Only the <strong>amount</strong> of each row is editable — the
        court / day-type / time-band / item-type vocabulary is fixed by the
        pricing engine (evening 18:00–03:00, morning 06:00–18:00, all days).
        Every change is audit-logged.
      </p>
      <PricingManager initial={rules} />
    </main>
  );
}
