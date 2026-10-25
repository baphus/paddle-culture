import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { LaneError } from "./errors";
import {
  PROOF_ALLOWED_MIME,
  PROOF_BUCKET,
  PROOF_INCOMING_PREFIX,
  PROOF_MAX_BYTES,
  PROOF_READ_TTL_SECONDS,
} from "./constants";

// Server-side only (imported by route handlers, never by client components).
// Verifies the proof file actually exists in the private `proofs` bucket and
// returns SERVER-OBSERVED mime/bytes for the payment_proofs row — client
// claims are validated but never stored.

function normalizeMime(mime: string): string {
  return mime.toLowerCase() === "image/jpg" ? "image/jpeg" : mime.toLowerCase();
}

function extFor(mime: string): string {
  switch (normalizeMime(mime)) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

/** Minted upload paths: `incoming/<32 lowercase hex>.<ext>`. */
export function mintProofPath(mime: string): string {
  return `${PROOF_INCOMING_PREFIX}${randomBytes(16).toString("hex")}.${extFor(mime)}`;
}

/** True only for server-minted scoped paths — the hard gate rejects the rest. */
export function isScopedProofPath(path: string): boolean {
  return /^incoming\/[0-9a-f]{32}\.(jpg|jpeg|png|webp)$/.test(path);
}

// Cached service-role client. getDb() caches its client; this one did not, so
// every proof check, signed URL and discard built a fresh Supabase client
// (new fetch agent, new headers) for the same credentials.
let storageAdmin: ReturnType<typeof createClient> | null = null;

/** Service-role Storage client (server only). */
export function getStorageAdmin() {
  if (storageAdmin) return storageAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new LaneError("NOT_CONFIGURED", "Storage is not configured.", 500);
  storageAdmin = createClient(url, serviceKey);
  return storageAdmin;
}

export interface VerifiedProof {
  path: string;
  mime: string;
  bytes: number;
}

export async function verifyProofFile(args: {
  path: string;
  mime: string;
  bytes: number;
}): Promise<VerifiedProof> {
  // Scoped-path gate: only server-minted `incoming/` paths are referenceable,
  // so a submit can never point at another booking's file or any other object.
  if (!isScopedProofPath(args.path)) {
    throw new LaneError("PROOF_PATH_REJECTED", "Payment proof path is not from an upload URL.", 422);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new LaneError("NOT_CONFIGURED", "Storage is not configured.", 500);
  const claimedMime = normalizeMime(args.mime);
  if (!(PROOF_ALLOWED_MIME as readonly string[]).includes(claimedMime)) {
    throw new LaneError("PROOF_TYPE_REJECTED", "Proof must be jpg, png, or webp.", 422);
  }

  const supabase = getStorageAdmin();
  // storage.info(path) reads this object's metadata directly — no folder
  // listing, so no `limit: 100` truncation and no prefix collision with other
  // uploads. The API returns camelCased fields (contentType, size) plus a
  // `metadata` block; read both because the two Storage API generations
  // populate slightly different shapes.
  const { data, error } = await supabase.storage.from(PROOF_BUCKET).info(args.path);
  if (error) {
    // A missing object is the customer's problem (upload didn't finish); any
    // other failure is ours. StorageError carries a statusCode for 404.
    const status = (error as { statusCode?: string | number }).statusCode;
    if (String(status) === "404" || /not found/i.test(error.message)) {
      throw new LaneError("PROOF_NOT_FOUND", "Payment proof file not found. Upload it first.", 422);
    }
    throw new LaneError("PROOF_LOOKUP_FAILED", "Could not verify payment proof.", 500);
  }
  const meta = data?.metadata as { mimetype?: string } | null | undefined;
  const actualBytes = data?.size;
  const rawMime = data?.contentType ?? meta?.mimetype ?? null;
  const actualMime = rawMime ? normalizeMime(rawMime) : null;
  if (actualBytes == null || !actualMime) {
    throw new LaneError("PROOF_NOT_FOUND", "Payment proof file not found. Upload it first.", 422);
  }
  if (!(PROOF_ALLOWED_MIME as readonly string[]).includes(actualMime)) {
    throw new LaneError("PROOF_TYPE_REJECTED", "Proof file must be jpg, png, or webp.", 422);
  }
  if (actualBytes > PROOF_MAX_BYTES) {
    throw new LaneError("PROOF_TOO_LARGE", "Proof file exceeds 5MB.", 422);
  }
  if (actualBytes !== args.bytes || actualMime !== claimedMime) {
    throw new LaneError(
      "PROOF_MISMATCH",
      "Proof details do not match the uploaded file.",
      422,
    );
  }
  return { path: args.path, mime: actualMime, bytes: actualBytes };
}

/**
 * Best-effort delete of an `incoming/` proof object the customer uploaded but
 * whose submit failed. Without this the object lingers until the 90-day prune
 * (finding #8). Never throws — the caller is already handling a failure and a
 * failed cleanup must not change the response. Only touches paths that pass
 * the scoped-path gate, so it can never delete a proof attached to a booking.
 */
export async function discardProofObject(path: string): Promise<void> {
  if (!isScopedProofPath(path)) return;
  try {
    const supabase = getStorageAdmin();
    await supabase.storage.from(PROOF_BUCKET).remove([path]);
  } catch (e) {
    console.error("proof orphan cleanup failed", e);
  }
}

/**
 * Admin signed read URL (view/zoom) for a proof file. `download: true`
 * switches Content-Disposition to attachment for the download button.
 * Consumed by the admin table lane; exposed via GET /api/admin/proofs/read.
 */
export async function createProofReadUrl(
  path: string,
  opts?: { download?: boolean; expiresIn?: number },
): Promise<{ signedUrl: string; expiresIn: number }> {
  if (!isScopedProofPath(path)) {
    throw new LaneError("PROOF_PATH_REJECTED", "Unknown proof path.", 404);
  }
  const supabase = getStorageAdmin();
  const expiresIn = opts?.expiresIn ?? PROOF_READ_TTL_SECONDS;
  const { data, error } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(path, expiresIn, opts?.download ? { download: true } : undefined);
  if (error || !data?.signedUrl) {
    throw new LaneError("PROOF_READ_FAILED", "Could not open payment proof.", 500);
  }
  return { signedUrl: data.signedUrl, expiresIn };
}
