import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
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

// GET /api/auth/invites — list invite rows (admin only).
export async function GET() {
  try {
    await requireAdmin();
    let db;
    try {
      db = getDb();
    } catch {
      return err("NOT_CONFIGURED", "Database is not configured.", 500);
    }
    const { data, error } = await db
      .from("admin_invites")
      .select("token_hash,created_by_admin,created_at,used_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({
      invites: (data ?? []).map((r: {
        token_hash: string; created_by_admin: string | null;
        created_at: string; used_at: string | null;
      }) => ({
        tokenHash: r.token_hash,
        createdByAdmin: r.created_by_admin,
        createdAt: r.created_at,
        usedAt: r.used_at ?? null,
        status: r.used_at ? "used" : "pending",
      })),
    });
  } catch (e) {
    if (e instanceof LaneError) return err(e.code, e.message, e.status);
    console.error("invites list failed", e);
    return err("INTERNAL", "Could not list invites.", 500);
  }
}

// POST /api/auth/invites — mint one single-use invite link.
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
    }

    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);

    const { error: inviteError } = await db
      .from("admin_invites")
      .insert({ token_hash: tokenHash, created_by_admin: createdByAdmin });
    if (inviteError) throw inviteError;

    await db.from("audit_log").insert({
      actor: actorEmail,
      action: "admin_invite.generate",
      entity: "admin_invites",
      entity_id: tokenHash,
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
