import { NextResponse } from "next/server";
import { processOutboxBatch } from "@/lib/mail/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Hobby backstop for the email outbox (vercel.json: daily `0 2 * * *`).
// Schedule note: 02:00 UTC ~= 10:00 Asia/Manila — a quiet overnight-UTC hour
// that lands mid-morning Manila time, after the Netlify */5-min worker window
// and clear of peak booking traffic. Daily is the max frequency on Vercel
// Hobby, so `*/5` is intentionally NOT used here (see vercel.json).
//
// Delivery order: submit/approve/reject routes call drainOutboxBestEffort()
// immediately after commit (primary path); this Hobby-daily cron plus
// POST /api/admin/outbox/process are backstops only.

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
