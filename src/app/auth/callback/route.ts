import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET /auth/callback — Supabase recovery-email links land here. Exchanges the
// PKCE code for a session, then hands off to the new-password form (or back to
// login when the code is expired/single-use-spent/missing its verifier).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const base = (process.env.APP_URL || origin).replace(/\/$/, "");
  const next = searchParams.get("next") ?? "";
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${base}${safeNext}`);
    }
    return NextResponse.redirect(`${base}/auth/error?code=otp_expired`);
  }
  // GoTrue-targeted auth errors (no code present) also land on the error page.
  return NextResponse.redirect(`${base}/auth/error?code=otp_expired`);
}
