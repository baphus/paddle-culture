import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { LaneError, err } from "@/lib/booking/errors";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/admin/session";
import {
  hashInviteToken,
  registerBodySchema,
} from "@/lib/admin/validation";

export const runtime = "nodejs";

// POST /api/auth/register — invitee redeems a single-use invite link.
export async function POST(request: Request) {
  try {
    const parsed = registerBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    let db;
    try {
      db = getDb();
    } catch {
      return err("NOT_CONFIGURED", "Database is not configured.", 500);
    }
    const { token, name, password } = parsed.data;
    const email = parsed.data.email.toLowerCase();
    const tokenHash = hashInviteToken(token);

    const { data: existingRow, error: fetchError } = await db
      .from("admin_invites")
      .select("used_at")
      .eq("token_hash", tokenHash)
      .single();

    if (fetchError || !existingRow || (existingRow as { used_at: string | null }).used_at !== null) {
      return err("INVITE_INVALID", "This invite link is invalid or already used.", 404);
    }

    const supabase = await createClient();
    const { data: signUp, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (signUpError || !signUp.user) {
      const taken = /already|registered|exists/i.test(signUpError?.message ?? "");
      return err(
        taken ? "EMAIL_TAKEN" : "REGISTER_FAILED",
        taken ? "This email is already registered." : "Registration failed.",
        taken ? 409 : 500,
      );
    }
    const userId = signUp.user.id;

    const admin = getSupabaseAdmin();
    const { error: flagError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { role: "admin" },
      user_metadata: { full_name: name },
    });
    if (flagError) {
      await admin.auth.admin.deleteUser(userId);
      return err("REGISTER_FAILED", "Registration failed.", 500);
    }

    // Atomic single-use claim; on lost race, roll back auth user
    const { data: claimed, error: claimError } = await db
      .from("admin_invites")
      .update({ used_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
      .is("used_at", null)
      .select("token_hash");

    if (claimError || !claimed || (claimed as { token_hash: string }[]).length === 0) {
      await admin.auth.admin.deleteUser(userId);
      return err("INVITE_ALREADY_USED", "This invite link was just used.", 409);
    }

    await db.from("audit_log").insert({
      actor: "system",
      action: "admin_invite.use",
      entity: "admin_invites",
      entity_id: tokenHash,
      after: { email, userId },
    });

    return NextResponse.json(
      { ok: true, email, hasSession: !!signUp.session },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("register failed", e);
    return err("INTERNAL", "Registration failed.", 500);
  }
}
