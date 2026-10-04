import * as Sentry from "@sentry/nextjs";
import { LaneError, err } from "@/lib/booking/errors";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, isDeactivated } from "@/lib/admin/session";
import { loginBodySchema } from "@/lib/admin/validation";

export const runtime = "nodejs";

// POST /api/auth/login — admin email+password only. Verifies the admin role
// flag and deactivation (banned_until / disabled) AFTER sign-in; failures
// sign the session back out so no non-admin or deactivated session survives.
export async function POST(request: Request) {
  try {
    const parsed = loginBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error || !data.user) {
      const banned = /banned/i.test(error?.message ?? "");
      return err(
        banned ? "DEACTIVATED" : "INVALID_CREDENTIALS",
        banned ? "This account is deactivated." : "Invalid email or password.",
        banned ? 403 : 401,
      );
    }
    const user = data.user;
    if (!isAdmin(user) || isDeactivated(user)) {
      await supabase.auth.signOut();
      const blocked = isDeactivated(user);
      return err(
        blocked ? "DEACTIVATED" : "NOT_AN_ADMIN",
        blocked
          ? "This account is deactivated."
          : "This account is not an admin.",
        403,
      );
    }
    const meta = (user.user_metadata ?? {}) as { full_name?: unknown };
    return Response.json({
      ok: true,
      email: user.email,
      name: typeof meta.full_name === "string" ? meta.full_name : null,
    });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("login failed", e);
    Sentry.captureException(e);
    return err("INTERNAL", "Sign-in failed.", 500);
  }
}
