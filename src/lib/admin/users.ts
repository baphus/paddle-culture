import type { User } from "@supabase/supabase-js";
import { getDb } from "@/db/client";
import { LaneError } from "@/lib/booking/errors";
import {
  getSupabaseAdmin,
  isAdmin,
  isDeactivated,
  nameOf,
  type AdminSession,
} from "./session";

/** Shape returned by GET /api/admin/users and consumed by the Users page. */
export interface AdminUserRecord {
  id: string;
  email: string;
  name: string | null;
  status: "active" | "deactivated";
}

/**
 * Every admin account (ADR-04: app_metadata.role === "admin"), read straight
 * from the Supabase Auth Admin API. Walks pages until a short page ends it.
 */
export async function listAdminUsers(): Promise<AdminUserRecord[]> {
  const admin = getSupabaseAdmin();
  const all: User[] = [];
  const perPage = 1000;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new LaneError("INTERNAL", "Could not list users.", 500);
    all.push(...data.users);
    if (data.users.length < perPage) break;
  }
  return all.filter(isAdmin).map((user) => ({
    id: user.id,
    email: user.email ?? "",
    name: nameOf(user),
    status: isDeactivated(user) ? "deactivated" : "active",
  }));
}

/**
 * Deactivate/reactivate another admin (ADR-04) and write the audit row.
 * `app_metadata` is merged key-by-key by GoTrue, so role stays intact.
 * The audit row is best-effort — the status change already succeeded.
 */
export async function setAdminDisabled(
  actor: AdminSession,
  userId: string,
  disabled: boolean,
): Promise<void> {
  const verb = disabled ? "deactivate" : "reactivate";
  if (actor.userId === userId) {
    throw new LaneError(
      "SELF_ACTION_FORBIDDEN",
      `You cannot ${verb} your own account.`,
      400,
    );
  }

  const admin = getSupabaseAdmin();
  const { data: found, error: fetchError } = await admin.auth.admin.getUserById(userId);
  if (fetchError || !found?.user || !isAdmin(found.user)) {
    throw new LaneError("NOT_FOUND", "User not found.", 404);
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { disabled },
  });
  if (updateError) throw new LaneError("INTERNAL", `Could not ${verb} user.`, 500);

  try {
    const { error: auditError } = await getDb().from("audit_log").insert([
      {
        actor: actor.email,
        action: `admin_user.${verb}`,
        entity: "auth.users",
        entity_id: userId,
        before: null,
        after: null,
      },
    ]);
    if (auditError) throw auditError;
  } catch (e) {
    console.error(`audit_log insert failed for admin_user.${verb}`, e);
  }
}
