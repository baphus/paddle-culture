import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { courts } from "@/db/schema";
import { err } from "@/lib/booking/errors";

export const runtime = "nodejs";

// GET /api/courts — CUSTOMER-facing, unauthenticated, read-only.
// Lists bookable (active) courts for the public booking flow, newest UX
// first by name. No auth, no writes — safe to call from the landing page.
export async function GET() {
  try {
    let db;
    try {
      db = getDb();
    } catch {
      return err("NOT_CONFIGURED", "Database is not configured.", 500);
    }
    const rows = await db
      .select({ id: courts.id, name: courts.name })
      .from(courts)
      .where(eq(courts.status, "active"))
      .orderBy(asc(courts.name));
    return NextResponse.json({ courts: rows });
  } catch (e) {
    console.error("courts failed", e);
    return err("INTERNAL", "Could not load courts.", 500);
  }
}
