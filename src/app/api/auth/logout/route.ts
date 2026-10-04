import { LaneError, err } from "@/lib/booking/errors";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// POST /api/auth/logout
export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("logout failed", e);
    return err("INTERNAL", "Sign-out failed.", 500);
  }
}
