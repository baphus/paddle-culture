import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { err } from "@/lib/booking/errors";

export const runtime = "nodejs";

// GET /api/courts — CUSTOMER-facing, unauthenticated, read-only.
export async function GET() {
  try {
    let db;
    try {
      db = getDb();
    } catch {
      return err("NOT_CONFIGURED", "Database is not configured.", 500);
    }
    const { data, error } = await db
      .from("courts")
      .select("id,name")
      .eq("status", "active")
      .order("name", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ courts: data ?? [] });
  } catch (e) {
    console.error("courts failed", e);
    return err("INTERNAL", "Could not load courts.", 500);
  }
}
