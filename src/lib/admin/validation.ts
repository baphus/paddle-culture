import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

// Invite tokens are 256-bit hex; only the SHA-256 hash is stored
// (admin_invites.token_hash) so a DB read never yields a usable link.
export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteLinkFor(token: string, origin: string): string {
  const base = (process.env.APP_URL ?? origin).replace(/\/$/, "");
  return `${base}/register?token=${token}`;
}

export const loginBodySchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
});

export const registerBodySchema = z.object({
  token: z.string().min(32).max(256),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(256),
});

export const profilePatchSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
