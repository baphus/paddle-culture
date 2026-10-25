// Shared guard for the Vercel cron endpoints (outbox, retention, proof-prune).
// Vercel sends `Authorization: Bearer $CRON_SECRET`.
//
// Fail CLOSED: an unset CRON_SECRET on a production deploy returns 401 rather
// than opening the endpoint. Only non-production may run without the secret,
// so local `curl` and dev testing stay possible.

export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
