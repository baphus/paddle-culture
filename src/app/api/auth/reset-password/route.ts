import * as Sentry from "@sentry/nextjs";
import { LaneError, err } from "@/lib/booking/errors";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/db/client";
import { resetPasswordBodySchema } from "@/lib/admin/validation";

export const runtime = "nodejs";

// POST /api/auth/reset-password — sets a new password for the session the
// /auth/callback code exchange just granted. Recovery-link sessions only;
// a stale session here is just an authenticated password change.
export async function POST(request: Request) {
  try {
    const parsed = resetPasswordBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const supabase = await createClient();
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) {
      return err(
        "RESET_EXPIRED",
        "This reset link expired or was already used. Request a new one.",
        401,
      );
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
        actor: data.user.id,
        action: "auth.password_reset",
        entity: "auth_users",
        entity_id: data.user.id,
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
