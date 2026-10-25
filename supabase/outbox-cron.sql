-- ===========================================================================
-- Hourly outbox drain, scheduled INSIDE Postgres.
--
-- WHY THIS EXISTS
-- Vercel's Hobby plan only allows daily cron jobs, so vercel.json cannot run
-- the outbox drain more often than once a day. Daily is not good enough on
-- its own: inline delivery in the submit route is scoped to that booking and
-- budgeted at 5 seconds, so a slow or cold mailer deliberately leaves rows
-- unsent, and the only thing that picks them up is a scheduled drain. At one
-- drain a day a booking made at 10:00 could sit unsent for ~16 hours, after
-- the customer had already paid.
--
-- Supabase runs `pg_cron` + `pg_net` on every plan including Free, and the
-- database already holds the outbox, so the frequent schedule belongs here.
-- Vercel's daily cron in vercel.json stays as a second backstop: if this file
-- is never run, or pg_net is unavailable, mail still goes out — just with the
-- old worst case.
--
-- REQUIRES (run once, before this file; both are on every Supabase plan):
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
-- If the SQL versions are refused, enable both from
-- Dashboard -> Database -> Extensions.
--
-- SETUP: replace the two placeholders in the cron.schedule() below, then run
-- this whole file.
--   YOUR-APP-DOMAIN  -> your production domain, e.g. ck-grounds.vercel.app
--                       (no trailing slash, no path)
--   YOUR-CRON-SECRET -> the same value as the CRON_SECRET env var on Vercel.
--                       isCronAuthorized() compares it against the
--                       Authorization header and fails closed without it.
-- Do NOT put the service_role key here: this job only calls /api/cron/outbox,
-- which authenticates with CRON_SECRET and nothing else.
-- ===========================================================================

-- Idempotent: drop any previous version first, so re-running this file does
-- not stack duplicate schedules. Each duplicate would fire its own HTTP call
-- every hour, multiplying the drain.
SELECT cron.unschedule('ck-grounds-outbox-drain')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'ck-grounds-outbox-drain'
);

-- Hourly at :05 — deliberately off the top of the hour, where Vercel's own
-- crons and everyone else's scheduled jobs tend to land.
SELECT cron.schedule(
  'ck-grounds-outbox-drain',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR-APP-DOMAIN/api/cron/outbox',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer YOUR-CRON-SECRET'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);

-- ===========================================================================
-- Verification. Run these after saving; expected results are in the comments.
-- ===========================================================================

-- Expected: exactly ONE row, schedule = '5 * * * *', active = true.
-- Two or more rows means this file was run against an older job name —
-- unschedule the extras by jobid with cron.unschedule(<jobid>).
SELECT jobid, jobname, schedule, active
FROM   cron.job
WHERE  jobname = 'ck-grounds-outbox-drain';

-- Expected: after the first hour, one row per run with status_code = 200.
--   status_code NULL -> still in flight, or the request never left
--   401             -> YOUR-CRON-SECRET does not match CRON_SECRET on Vercel
--   404             -> wrong domain, or that deployment has no /api/cron/outbox
--   500             -> the route ran but the drain threw; check Vercel logs
SELECT id, status_code, error_msg, content, created
FROM   net._http_response
ORDER  BY created DESC
LIMIT  10;

-- To pause without deleting the schedule definition:
--   SELECT cron.unschedule('ck-grounds-outbox-drain');
