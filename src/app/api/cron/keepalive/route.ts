import { NextResponse } from "next/server";
import { getDb } from "@/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel Cron invokes this endpoint daily (vercel.json).
// Replaced `getDb().execute(sql\`select 1\`)` with a lightweight Supabase
// HTTP ping that does not open a persistent TCP socket.
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const db = getDb();
    // Lightweight read to verify DB connectivity; no persistent socket.
    const { error } = await db
      .from("courts")
      .select("id")
      .limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("vercel Supabase keepalive failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
