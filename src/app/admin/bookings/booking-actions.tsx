"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const refundable = booking.status === "Approved";

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

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" title="More actions" />}
        >
          <MoreHorizontal className="size-3.5" />
          <span className="sr-only">More actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!refundable}
            title={
              refundable ? undefined : "Only approved bookings can be refunded."
            }
            onClick={() => setDecision("refund")}
          >
            <RotateCcw className="size-3.5" />
            Full refund
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDecision("delete")}
          >
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
