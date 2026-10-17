import Link from "next/link";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/lib/admin/session";
import { listCourts } from "@/lib/admin/config";
import { FALLBACK_RATES, getDisplayRates, type DisplayRates } from "@/lib/pricing-display";
import PageHeader from "@/components/admin/page-header";
import BookingCreateForm from "@/components/admin/booking-create-form";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

// Same fail-soft SSR pattern as /book: courts → [], rates → FALLBACK_RATES.
// The form refetches only what came back empty, so a healthy render costs zero
// extra requests on mount.
async function loadActiveCourts(): Promise<{ id: string; name: string }[]> {
  try {
    const rows = await listCourts(getDb());
    return rows
      .filter((c) => c.status === "active")
      .map((c) => ({ id: c.id, name: c.name }));
  } catch {
    return [];
  }
}

async function loadRates(): Promise<DisplayRates> {
  try {
    return await getDisplayRates(getDb());
  } catch {
    return FALLBACK_RATES;
  }
}

// /admin/bookings/new — admin-only booking creation (walk-ins, phone bookings,
// internal records). Distinct from the unauthenticated /book wizard, which is
// untouched: no holds, slots born Approved, optional proof, optional email.
export default async function NewBookingPage() {
  const admin = await requireAdmin();
  const [initialCourts, initialRates] = await Promise.all([
    loadActiveCourts(),
    loadRates(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="New booking"
        description="Create a booking directly. Slots are approved immediately."
      >
        <Button
          variant="outline"
          className="h-9"
          nativeButton={false}
          render={<Link href="/admin/bookings" />}
        >
          Back to bookings
        </Button>
      </PageHeader>
      <BookingCreateForm
        adminEmail={admin.email}
        initialCourts={initialCourts}
        initialRates={initialRates}
      />
    </div>
  );
}
