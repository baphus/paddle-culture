import { randomBytes, randomInt } from "node:crypto";

/** Generates a 5-character uppercase alphanumeric tracking code (A-Z0-9).
 * randomInt is uniform — `byte % 36` would bias toward the first 16 of the
 * 36 symbols, so codes would be guessable 1.4× more often than they look. */
export function generateTrackingCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 5 }, () =>
    chars[randomInt(0, chars.length - 1)],
  ).join("");
}

/** 32 random bytes, hex-encoded — the unguessable half of the tracking link. */
export function generateTrackingToken(): string {
  return randomBytes(32).toString("hex");
}

/** True when the error is a 23505 unique violation on the tracking_code column. */
export function isTrackingCodeViolation(e: unknown): boolean {
  if (
    typeof e !== "object" ||
    e === null ||
    !("code" in e) ||
    (e as { code?: unknown }).code !== "23505"
  )
    return false;
  const detail = (e as { detail?: unknown }).detail;
  const constraint = (e as { constraint?: unknown }).constraint;
  const message = (e as { message?: unknown }).message;
  if (typeof constraint === "string" && constraint.includes("tracking_code")) return true;
  if (typeof detail === "string" && detail.includes("tracking_code")) return true;
  if (typeof message === "string" && message.includes("tracking_code")) return true;
  return false;
}
