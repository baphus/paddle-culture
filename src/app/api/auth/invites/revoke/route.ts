import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { adminInvites, auditLog } from "@/db/schema";
import { LaneError, err } from "@/lib/booking/errors";
import { requireAdmin } from "@/lib/admin/session";

export const runtime = "nodejs";

// DELETE /api/auth/invites?tokenHash=<hex> — revoke = delete the UNUSED row
// (ADR-04). Used rows cannot be revoked (409); unknown hashes are 404.
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
    const deleted = await db
      .delete(adminInvites)
      .where(and(eq(adminInvites.tokenHash, tokenHash), isNull(adminInvites.usedAt)))
      .returning({ tokenHash: adminInvites.tokenHash });
    if (deleted.length === 0) {
      const existing = await db
        .select({ usedAt: adminInvites.usedAt })
        .from(adminInvites)
        .where(eq(adminInvites.tokenHash, tokenHash));
      if (existing.length === 0) return err("NOT_FOUND", "Invite not found.", 404);
      return err("INVITE_ALREADY_USED", "Used invites cannot be revoked.", 409);
    }
    await db.insert(auditLog).values({
      actor: session.email,
      action: "admin_invite.delete",
      entity: "admin_invites",
      entityId: tokenHash,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("invite revoke failed", e);
    return err("INTERNAL", "Could not revoke invite.", 500);
  }
}
