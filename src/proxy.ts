import { NextResponse, type NextRequest } from "next/server";
import { createProxyClient } from "@/lib/supabase/proxy";

// Admin session gating (ADR-04). Verified via getClaims() — never getSession.
// Customers stay unauthenticated: only /admin/* requires a session.
export default async function proxy(request: NextRequest) {
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
  matcher: ["/admin/:path*", "/login"],
};
