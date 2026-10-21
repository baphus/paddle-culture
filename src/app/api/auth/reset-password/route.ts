import * as Sentry from "@sentry/nextjs";
import { LaneError, err } from "@/lib/booking/errors";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/db/client";
import { resetPasswordBodySchema } from "@/lib/admin/validation";

export const runtime = "nodejs";

// POST /api/auth/reset-password — sets a new password. Recovery links carry a
// token_hash; the verifyOtp call consumes it (single-use) and starts a fresh
// session. Signed-in users changing their own password skip the token step.
export async function POST(request: Request) {
  try {
    const parsed = resetPasswordBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const supabase = await createClient();
    let userId: string;
    if (parsed.data.token_hash) {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: parsed.data.token_hash,
        type: "recovery",
      });
      if (verifyError || !data.user) {
        return err(
          "RESET_EXPIRED",
          "This reset link is invalid or has expired. Request a new one.",
          401,
        );
      }
      userId = data.user.id;
    } else {
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError || !data.user) {
        return err(
          "RESET_EXPIRED",
          "This reset link expired or was already used. Request a new one.",
          401,
        );
      }
      userId = data.user.id;
    }
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (error) {
      return err(
        "RESET_FAILED",
        error.message || "Could not update the password.",
        400,
      );
    }
    // Best effort — the reset itself must not fail over audit logging.
    try {
      await getDb().from("audit_log").insert({
        actor: userId,
        action: "auth.password_reset",
        entity: "auth_users",
        entity_id: userId,
      });
    } catch {
      // audit only
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("reset-password failed", e);
    Sentry.captureException(e);
    return err("INTERNAL", "Could not update the password.", 500);
  }
}
