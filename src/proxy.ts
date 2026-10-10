import { NextResponse, type NextRequest } from "next/server";
import { createProxyClient } from "@/lib/supabase/proxy";

// Admin session gating (ADR-04). Verified via getClaims() — never getSession.
// Customers stay unauthenticated: only /admin/* requires a session.

// ── Write-route rate limiting ───────────────────────────────────────────────
// The customer write endpoints (/api/holds, /api/submit, /api/proofs/upload-url)
// are unauthenticated, so without a ceiling one client can burn the daily Gmail
// quota, fill the holds table, or churn idempotency keys. This is a per-process
// in-memory counter, not a distributed limiter: on Vercel each instance has its
// own map, so the effective limit is LIMIT × instances. Good enough for this
// venue's scale; a real cap needs Redis or an edge KV.
const WRITE_LIMITS: Array<{ prefix: string; limit: number; windowMs: number }> = [
  { prefix: "/api/submit", limit: 10, windowMs: 60_000 },
  { prefix: "/api/proofs/upload-url", limit: 20, windowMs: 60_000 },
  { prefix: "/api/holds", limit: 60, windowMs: 60_000 },
];

interface Bucket { count: number; resetAt: number }
const writeBuckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function tooManyRequests(request: NextRequest): boolean {
  const now = Date.now();
  // Drop expired buckets once a minute so the map cannot grow forever.
  if (now - lastSweep > 60_000) {
    for (const [key, bucket] of writeBuckets) {
      if (bucket.resetAt <= now) writeBuckets.delete(key);
    }
    lastSweep = now;
  }

  const rule = WRITE_LIMITS.find((r) => request.nextUrl.pathname.startsWith(r.prefix));
  if (!rule) return false;

  // Only POST/DELETE write; reads stay free so the calendar keeps working.
  if (request.method !== "POST" && request.method !== "DELETE") return false;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const key = `${rule.prefix}:${ip}`;
  const bucket = writeBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    writeBuckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return false;
  }
  if (bucket.count >= rule.limit) return true;
  bucket.count += 1;
  return false;
}

export default async function proxy(request: NextRequest) {
  if (tooManyRequests(request)) {
    return NextResponse.json(
      { error: "Too many requests. Wait a minute and try again." },
      { status: 429 },
    );
  }

  const { supabase, getResponse } = createProxyClient(request);
  let userId: string | null = null;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (!error) {
      const sub = data?.claims?.sub;
      userId = typeof sub === "string" ? sub : null;
    }
  } catch {
    userId = null;
  }

  const path = request.nextUrl.pathname;
  if (path.startsWith("/admin") && !userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (path === "/login" && userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return getResponse();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/login",
    "/api/holds",
    "/api/submit",
    "/api/proofs/upload-url",
  ],
};
