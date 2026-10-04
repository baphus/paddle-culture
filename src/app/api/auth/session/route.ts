import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

// GET /api/auth/session — whoami for client pages (null when signed out).
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ authenticated: false });
  return NextResponse.json({ authenticated: true, ...session });
}
