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

/** Service-role Storage client (server only). */
export function getStorageAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new LaneError("NOT_CONFIGURED", "Storage is not configured.", 500);
  return createClient(url, serviceKey);
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

  const supabase = createClient(url, serviceKey);
  const slash = args.path.lastIndexOf("/");
  const folder = slash < 0 ? "" : args.path.slice(0, slash);
  const name = slash < 0 ? args.path : args.path.slice(slash + 1);
  // ponytail: listing the folder finds the object's real size/mime, but
  // `limit: 100` + search on a name prefix. incoming/<32hex> is a unique
  // per-upload name so the only files matching `search` are the one being
  // verified and any other upload that happens to share its prefix — the
  // exact `f.name === name` check below keeps that safe. If this ever moves
  // to a shared folder with more than ~100 same-prefix objects, switch to
  // storage.info(path), which reads metadata directly with no listing.
  const { data, error } = await supabase.storage
    .from(PROOF_BUCKET)
    .list(folder, { limit: 100, search: name });
  if (error) {
    throw new LaneError("PROOF_LOOKUP_FAILED", "Could not verify payment proof.", 500);
  }
  const file = (data ?? []).find((f) => f.name === name);
  const meta = file?.metadata as { size?: number; mimetype?: string } | null | undefined;
  const actualBytes = meta?.size;
  const actualMime = meta?.mimetype ? normalizeMime(meta.mimetype) : null;
  if (!file || actualBytes == null || !actualMime) {
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
