import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { processOutboxBatch } from "@/lib/mail/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel primary backstop for the email outbox (vercel.json: hourly, `5 * * * *`).
// Why hourly and not daily: inline delivery in submit is scoped to that
// booking's rows and budgeted at 5s, so a slow/cold mailer leaves rows unsent
// by design. The only thing that picks them up is this cron, and at the old
// `0 2 * * *` a booking made at 10:00 could sit unsent for ~16 hours —
// after the customer had already paid. Hourly caps the delay at ~1 hour.
// Primary delivery is inline drainOutboxWithin() in submit; this cron plus
// POST /api/admin/outbox/process are backstops only.

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    // No booking filter: the backstop drains anything due, oldest first.
    const result = await processOutboxBatch();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("vercel outbox cron failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
