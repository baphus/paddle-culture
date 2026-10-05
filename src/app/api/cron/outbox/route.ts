import { NextResponse } from "next/server";
import { processOutboxBatch } from "@/lib/mail/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel primary backstop for the email outbox (vercel.json: daily `0 2 * * *`).
// Schedule note: 02:00 UTC ~= 10:00 Asia/Manila — a quiet overnight-UTC hour
// that lands mid-morning Manila time, clear of peak booking traffic.
// Primary delivery is inline drainOutboxBestEffort() in submit/approve/reject;
// this cron plus POST /api/admin/outbox/process are backstops only. The
// Netlify `*/5` worker is legacy. On a commercial-allowed Vercel plan, the
// schedule can be raised to `*/5` if needed (see vercel.json).

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Allow bypass when CRON_SECRET is unset only in development.
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const result = await processOutboxBatch();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("vercel outbox cron failed", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
