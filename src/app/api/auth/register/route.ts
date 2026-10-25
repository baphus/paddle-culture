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

    // Claim before creating the auth user so two concurrent redemptions cannot
    // both create accounts. If Auth fails, release the claim for a retry.
    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await db
      .from("admin_invites")
      .update({ used_at: claimedAt })
      .eq("token_hash", tokenHash)
      .is("used_at", null)
      .select("token_hash");

    if (claimError) {
      return err("INTERNAL", "Could not redeem invite.", 500);
    }
    if (!claimed || claimed.length === 0) {
      return err("INVITE_INVALID", "This invite link is invalid or already used.", 404);
    }

    const supabase = await createClient();
    const { data: signUp, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (signUpError || !signUp.user) {
      await db
        .from("admin_invites")
        .update({ used_at: null })
        .eq("token_hash", tokenHash)
        .eq("used_at", claimedAt);
      const taken = /already|registered|exists/i.test(signUpError?.message ?? "");
      return err(
        taken ? "EMAIL_TAKEN" : "REGISTER_FAILED",
        taken ? "This email is already registered." : "Registration failed.",
        taken ? 409 : 500,
      );
    }
    const userId = signUp.user.id;

    const admin = getSupabaseAdmin();
    const { error: roleError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { role: "admin" },
    });
    if (roleError) {
      await admin.auth.admin.deleteUser(userId);
      await db
        .from("admin_invites")
        .update({ used_at: null })
        .eq("token_hash", tokenHash)
        .eq("used_at", claimedAt);
      return err("REGISTER_FAILED", "Registration failed.", 500);
    }

    // Best effort only: the user and the invite are already committed, so a
    // failed audit write must not turn a successful signup into a 500.
    const { error: auditError } = await db.from("audit_log").insert({
      actor: "system",
      action: "admin_invite.use",
      entity: "admin_invites",
      entity_id: tokenHash,
      after: { email, userId },
    });
    if (auditError) console.error("register audit insert failed", auditError.message);

    return NextResponse.json(
      // Require a fresh sign-in to receive claims with the admin role.
      { ok: true, email },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("register failed", e);
    return err("INTERNAL", "Registration failed.", 500);
  }
}
