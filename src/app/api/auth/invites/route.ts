import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { adminInvites, auditLog } from "@/db/schema";
import { LaneError, err } from "@/lib/booking/errors";
import {
  adminExists,
  requireAdmin,
} from "@/lib/admin/session";
import {
  generateInviteToken,
  hashInviteToken,
  inviteLinkFor,
} from "@/lib/admin/validation";

export const runtime = "nodejs";

function originOf(request: Request): string {
  return new URL(request.url).origin;
}

// GET /api/auth/invites — list invite rows (admin only). Token hashes are
// internal IDs here; the raw token exists only inside the one-time link.
export async function GET() {
  try {
    await requireAdmin();
    let db;
    try {
      db = getDb();
    } catch {
      return err("NOT_CONFIGURED", "Database is not configured.", 500);
    }
    const rows = await db
      .select({
        tokenHash: adminInvites.tokenHash,
        createdByAdmin: adminInvites.createdByAdmin,
        createdAt: adminInvites.createdAt,
        usedAt: adminInvites.usedAt,
      })
      .from(adminInvites)
      .orderBy(adminInvites.createdAt);
    return NextResponse.json({
      invites: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        usedAt: r.usedAt ? r.usedAt.toISOString() : null,
        status: r.usedAt ? "used" : "pending",
      })),
    });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("invites list failed", e);
    return err("INTERNAL", "Could not list invites.", 500);
  }
}

// POST /api/auth/invites — mint one single-use invite link (admin only).
// Bootstrap exception: when ZERO admins exist yet, anyone may mint the first
// invite (actor "system"); afterwards this endpoint requires an admin session.
export async function POST(request: Request) {
  try {
    let db;
    try {
      db = getDb();
    } catch {
      return err("NOT_CONFIGURED", "Database is not configured.", 500);
    }
    let actorEmail = "system";
    let createdByAdmin: string | null = null;
    try {
      const session = await requireAdmin();
      actorEmail = session.email;
      createdByAdmin = session.userId;
    } catch {
      if (await adminExists()) {
        return err("UNAUTHENTICATED", "Admin sign-in required.", 401);
      }
      // else: first-invite bootstrap, actor stays "system".
    }

    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    await db.insert(adminInvites).values({ tokenHash, createdByAdmin });
    await db.insert(auditLog).values({
      actor: actorEmail,
      action: "admin_invite.generate",
      entity: "admin_invites",
      entityId: tokenHash,
      after: { createdByAdmin },
    });
    return NextResponse.json(
      {
        inviteLink: inviteLinkFor(token, originOf(request)),
        tokenHash,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("invite generate failed", e);
    return err("INTERNAL", "Could not generate invite.", 500);
  }
}
