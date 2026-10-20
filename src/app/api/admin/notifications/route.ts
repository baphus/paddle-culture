import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { listBookings, type BookingDetail } from "@/lib/admin/bookings";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";
import { NOTIF_LIST_LIMIT, type NotifRow } from "@/lib/admin/notifications";

// DB + admin-session route: nodejs runtime, never statically optimized.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/notifications
//
// The admin header bell polls this every POLL_INTERVAL_MS for the latest
// pending bookings (newest-first). The bell derives "unread" client-side:
// a booking is unread while it is pending AND its id is not in the admin's
// local "viewed" set, so this route only needs to return the raw pending
// list. The bell marks a booking viewed the moment the admin clicks its row.
//
// "New booking received" = a bookings row with status='Pending' — admin
// walk-in/phone bookings are born 'Approved' (rpc_admin_create_booking), so
// they are excluded automatically.
//
// Fail-soft: a DB/config error returns an empty feed (200) rather than 500,
// so the bell shows an empty state instead of crashing the admin shell. The
// bell is non-critical and polls every 30s, so a persistent failure must not
// surface as a red toast on every poll.
export async function GET() {
  // Auth first — a 401 must not be swallowed into a fail-soft 200.
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    return err("INTERNAL", "Could not load notifications.", 500);
  }

  try {
    const db = getDb();
    const { rows } = await listBookings(db, {
      q: "",
      status: "Pending",
      from: "",
      to: "",
      page: 1,
      limit: NOTIF_LIST_LIMIT,
    });
    const bookings: NotifRow[] = rows.map(toNotifRow);
    return NextResponse.json({ bookings });
  } catch (e) {
    console.error("[admin/notifications] query failed:", e);
    return NextResponse.json({ bookings: [] });
  }
}

function toNotifRow(b: BookingDetail): NotifRow {
  return {
    id: b.id,
    fullName: b.fullName,
    // b.date is the authoritative play_date (YYYY-MM-DD) written by the RPC.
    date: b.date,
    // Total amount (pesos, numeric string) for the row summary.
    total: b.total,
    // Number of individual booked slots — "slot count" for the dropdown row.
    slotCount: b.slots.length,
    createdAt: b.createdAt,
  };
}
