import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron invokes this endpoint daily (vercel.json). The read-only query
// records database activity without changing application data.
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
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("vercel Supabase keepalive failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
