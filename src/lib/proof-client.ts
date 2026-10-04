// Pure client-side proof pre-check (no server imports — safe for components).
// Mirrors the server allowlist so bad files are rejected before any upload.
// Server re-validates everything at mint + submit; this is UX only.

export const PROOF_CLIENT_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_CLIENT_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/jpg"]);

export type ProofPrecheck =
  | { ok: true }
  | { ok: false; code: "PROOF_TYPE_REJECTED" | "PROOF_TOO_LARGE" | "PROOF_EMPTY" };

export function precheckProofFile(file: File): ProofPrecheck {
  const type = file.type.toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    return { ok: false, code: "PROOF_TYPE_REJECTED" };
  }
  if (file.size <= 0) return { ok: false, code: "PROOF_EMPTY" };
  if (file.size > PROOF_CLIENT_MAX_BYTES) {
    return { ok: false, code: "PROOF_TOO_LARGE" };
  }
  return { ok: true };
}
