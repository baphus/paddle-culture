"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BookingDetailDialog,
  type BookingDecision,
} from "@/components/admin/booking-detail-dialog";
import type { BookingDetail } from "@/lib/admin/bookings";

export default function BookingActions({ booking }: { booking: BookingDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<BookingDecision>(null);
  const pending = booking.status === "Pending";

  return (
    <div className="flex items-center gap-1.5">
      {/* Phone-width rows have little room: the label is read out to screen
          readers and comes back from `sm` up, where the row is wider. */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        title="View"
      >
        <Eye className="size-3.5" />
        <span className="sr-only sm:not-sr-only">View</span>
      </Button>

      {pending && (
        <Button
          variant="outline"
          size="sm"
          disabled={decision !== null}
          onClick={() => setDecision("approve")}
          title="Quick approve"
        >
          <Check className="size-3.5" />
          <span className="sr-only sm:not-sr-only">Approve</span>
        </Button>
      )}

      <BookingDetailDialog
        booking={booking}
        open={open}
        onOpenChange={setOpen}
        decision={decision}
        onDecisionChange={setDecision}
        onDecided={() => router.refresh()}
      />
    </div>
  );
}
