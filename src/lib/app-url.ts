export const DEFAULT_APP_URL = "https://ckgrounds.vercel.app";

/**
 * Absolute http(s) base for links and QR codes.
 *
 * A value like `ckgrounds.vercel.app` (no scheme) encodes a QR payload that
 * phone scanners treat as plain text and hand to Google, so the scheme is
 * added here rather than trusted from the env.
 */
export function normalizeAppUrl(raw: string | undefined | null): string {
  const trimmed = (raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (!trimmed) return DEFAULT_APP_URL;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return DEFAULT_APP_URL;
  }
}

export function appBase(): string {
  return normalizeAppUrl(process.env.APP_URL);
}
