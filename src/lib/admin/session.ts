import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { LaneError } from "@/lib/booking/errors";
import { createClient } from "@/lib/supabase/server";

export interface AdminSession {
  userId: string;
  email: string;
  name: string | null;
}

type LooseMeta = { role?: unknown; disabled?: unknown };

function metaOf(user: User): LooseMeta {
  return (user.app_metadata ?? {}) as LooseMeta;
}

/** Deactivation (ADR-04): native ban OR app-level disabled flag. */
export function isDeactivated(user: User): boolean {
  if (user.banned_until) {
    const until = new Date(user.banned_until).getTime();
    if (Number.isFinite(until) && until > Date.now()) return true;
  }
  return metaOf(user).disabled === true;
}

export function isAdmin(user: User): boolean {
  return metaOf(user).role === "admin";
}

export function nameOf(user: User): string | null {
  const raw = (user.user_metadata ?? {}) as { full_name?: unknown };
  return typeof raw.full_name === "string" && raw.full_name.length > 0
    ? raw.full_name
    : null;
}

/** Service-role client (server only). Used for Admin API + bootstrap count. */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new LaneError("NOT_CONFIGURED", "Auth is not configured.", 500);
  }
  return createServiceRoleClient(url, key);
}

/**
 * Current admin session or null. Uses getClaims() + getUser() server-side
 * (never getSession()). Returns null for missing/invalid sessions,
 * non-admin users, and deactivated accounts.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    const sub = claimsError ? undefined : claimsData?.claims?.sub;
    if (typeof sub !== "string") return null;
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData?.user;
    if (userError || !user || user.id !== sub) return null;
    if (!isAdmin(user) || isDeactivated(user)) return null;
    return { userId: user.id, email: user.email ?? "", name: nameOf(user) };
  } catch {
    return null;
  }
}

export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    throw new LaneError("UNAUTHENTICATED", "Admin sign-in required.", 401);
  }
  return session;
}

/** True when at least one admin-flagged user exists (bootstrap gate). */
export async function adminExists(): Promise<boolean> {
  const admin = getSupabaseAdmin();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw new LaneError("INTERNAL", "Could not list users.", 500);
    if (data.users.some((u) => isAdmin(u))) return true;
    if (data.users.length < 100) return false;
  }
  return true;
}
