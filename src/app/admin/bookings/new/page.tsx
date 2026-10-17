import Link from "next/link";
import { requireAdmin } from "@/lib/admin/session";
import PageHeader from "@/components/admin/page-header";
import BookingCreateForm from "@/components/admin/booking-create-form";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

// /admin/bookings/new — admin-only booking creation (walk-ins, phone bookings,
// internal records). Distinct from the unauthenticated /book wizard, which is
// untouched: no holds, slots born Approved, optional proof, optional email.
export default async function NewBookingPage() {
  const admin = await requireAdmin();

  return (
    <div className="space-y-5">
      <PageHeader
        title="New booking"
        description="Create a booking directly. Slots are approved immediately."
      >
        <Button variant="outline" size="sm" render={<Link href="/admin/bookings" />}>
          Back to bookings
        </Button>
      </PageHeader>
      <BookingCreateForm adminEmail={admin.email} />
    </div>
  );
}
