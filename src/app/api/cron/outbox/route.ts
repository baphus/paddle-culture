import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { processOutboxBatch } from "@/lib/mail/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Backstop for the email outbox.
//
// SCHEDULE: the FREQUENT drain is Supabase pg_cron + pg_net, hourly, defined
// in supabase/outbox-cron.sql. Vercel's Hobby plan cannot run a cron more than
// once a day, so vercel.json keeps this route on a daily `5 2 * * *` as a
// second backstop only. That split matters: inline delivery in submit is
// scoped to one booking and budgeted at 5s, so a slow/cold mailer leaves rows
// unsent by design, and the only thing that picks them up is a scheduled
// drain. Daily alone would let a mid-morning booking sit unsent ~16 hours
// after the customer paid; hourly via pg_cron caps it at ~1 hour.
// POST /api/admin/outbox/process is the manual trigger.

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
