import * as Sentry from "@sentry/nextjs";
import { LaneError, err } from "@/lib/booking/errors";
import { createClient } from "@/lib/supabase/server";
import { forgotBodySchema } from "@/lib/admin/validation";

export const runtime = "nodejs";

// POST /api/auth/forgot-password — sends the Supabase recovery email. Always
// returns ok so the endpoint cannot be used to enumerate admin accounts.
export async function POST(request: Request) {
  try {
    const parsed = forgotBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return err("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Bad request.", 400);
    }
    const base = (process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email.toLowerCase(),
      { redirectTo: `${base}/auth/callback?next=/reset-password` },
    );
    if (error) {
      console.error("forgot-password failed", error);
      Sentry.captureException(error);
      return err("INTERNAL", "Could not send the reset email.", 500);
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("forgot-password failed", e);
    Sentry.captureException(e);
    return err("INTERNAL", "Could not send the reset email.", 500);
  }
}
