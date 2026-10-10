import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { LaneError, err } from "@/lib/booking/errors";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/session";
import { profilePatchSchema } from "@/lib/admin/validation";

export const runtime = "nodejs";

// GET /api/auth/profile — current admin identity (email is read-only).
export async function GET() {
  try {
    const session = await requireAdmin();
    return NextResponse.json(session);
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    return err("INTERNAL", "Could not load profile.", 500);
  }
}

// PATCH /api/auth/profile — name is mutable; email is IMMUTABLE.
export async function PATCH(request: Request) {
  try {
    const session = await requireAdmin();
    const raw = (await request.json()) as Record<string, unknown>;
    if ("email" in raw) {
      return err("EMAIL_IMMUTABLE", "Email cannot be changed after register.", 422);
    }
    const parsed = profilePatchSchema.safeParse(raw);
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      data: { full_name: parsed.data.name },
    });
    if (error) return err("PROFILE_UPDATE_FAILED", "Could not update name.", 500);
    try {
      const db = getDb();
      await db.from("audit_log").insert({
        actor: session.email,
        action: "admin_profile.update",
        entity: "auth_user",
        entity_id: session.userId,
        after: { full_name: parsed.data.name },
      });
    } catch {
      // Audit is best-effort; profile update already succeeded.
    }
    return NextResponse.json({ ok: true, name: parsed.data.name });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("profile update failed", e);
    return err("INTERNAL", "Could not update profile.", 500);
  }
}
