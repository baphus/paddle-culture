import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";

export const runtime = "nodejs";

// DELETE /api/auth/invites?tokenHash=<hex>
export async function DELETE(request: Request) {
  try {
    const session = await requireAdmin();
    const tokenHash = new URL(request.url).searchParams.get("tokenHash");
    if (!tokenHash) return err("BAD_REQUEST", "tokenHash is required.", 400);
    let db;
    try {
      db = getDb();
    } catch {
      return err("NOT_CONFIGURED", "Database is not configured.", 500);
    }

    // Try deleting only unused rows
    const { data: deleted, error: deleteError } = await db
      .from("admin_invites")
      .delete()
      .eq("token_hash", tokenHash)
      .is("used_at", null)
      .select("token_hash");

    if (deleteError) throw deleteError;

    if (!deleted || (deleted as { token_hash: string }[]).length === 0) {
      // Check whether it exists at all
      const { data: existing } = await db
        .from("admin_invites")
        .select("used_at")
        .eq("token_hash", tokenHash)
        .single();
      if (!existing) return err("NOT_FOUND", "Invite not found.", 404);
      return err("INVITE_ALREADY_USED", "Used invites cannot be revoked.", 409);
    }

    await db.from("audit_log").insert({
      actor: session.email,
      action: "admin_invite.delete",
      entity: "admin_invites",
      entity_id: tokenHash,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("invite revoke failed", e);
    return err("INTERNAL", "Could not revoke invite.", 500);
  }
}
