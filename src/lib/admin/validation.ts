import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { appBase, normalizeAppUrl } from "@/lib/app-url";

// Invite tokens are 256-bit hex; only the SHA-256 hash is stored
// (admin_invites.token_hash) so a DB read never yields a usable link.
export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteLinkFor(token: string, origin: string): string {
  const base = process.env.APP_URL ? appBase() : normalizeAppUrl(origin);
  return `${base}/register?token=${token}`;
}

export const loginBodySchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});

export const forgotBodySchema = z.object({
  email: z.string().trim().email().max(254),
});

export const resetPasswordBodySchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters.").max(256),
  // SHA-256 recovery token_hash from the template email link (optional — a
  // signed-in user refreshing their password goes without it).
  token_hash: z.string().min(32).max(128).optional(),
});

export const registerBodySchema = z.object({
  token: z.string().min(32).max(256),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(256),
});

/** Payload accepted from the authenticated Admin → Users add-user form. */
export const createAdminBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(256),
});

export const profilePatchSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
