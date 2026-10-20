"use client";

import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookingStatusBadge } from "@/components/admin/status-badge";
import { formatBookingDate, type BookingDetail } from "@/lib/admin/bookings";
import { formatCourtSlotGroup } from "@/lib/courts";
import BookingActions from "./booking-actions";

function pesos(total: string): string {
  return `₱${Number(total).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate text-right">{value}</span>
    </div>
  );
}

/** Grid-view card: same fields as a table row, plus the row actions. */
export default function BookingCard({ booking }: { booking: BookingDetail }) {
  return (
    <Card className="justify-between">
      <CardHeader>
        <CardTitle className="truncate">{booking.fullName}</CardTitle>
        <CardAction>
          <BookingStatusBadge status={booking.status} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="text-xs text-muted-foreground">
          <div className="truncate">{booking.email}</div>
          <div>{booking.phone}</div>
        </div>
        <div className="space-y-1">
          <Field label="Tracking no." value={booking.trackingCode || "—"} />
          <Field label="Courts" value={booking.courts || "—"} />
          <Field label="Date" value={formatBookingDate(booking.date)} />
          <Field
            label={`${booking.slots.length} slots`}
            value={(() => {
              const groups = new Map<string, string[]>();
              for (const slot of booking.slots) {
                groups.set(slot.courtName, [...(groups.get(slot.courtName) ?? []), slot.slotStart]);
              }
              return [...groups].map(([court, starts]) => formatCourtSlotGroup(court, starts)).join("; ") || "—";
            })()}
          />
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <span className="text-sm font-semibold">{pesos(booking.total)}</span>
        <BookingActions booking={booking} />
      </CardFooter>
    </Card>
  );
}
