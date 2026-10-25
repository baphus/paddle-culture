-- Diagnose "emails are not sending". Run each block in the Supabase SQL
-- editor and compare against the expected result in the comment.
--
-- Nothing here writes or deletes. It only reads.

-- ---------------------------------------------------------------------------
-- 1. Is the outbox accumulating unsent rows?
-- Expected: 0 rows ideally. Any 'pending'/'retry' row older than a few
-- minutes means the claim or the send is failing. 'sending' older than 15
-- minutes means a process died mid-batch and the claim is not reclaiming.
-- 'failed' means dead-lettered after OUTBOX_MAX_ATTEMPTS (8).
-- ---------------------------------------------------------------------------
SELECT status,
       count(*)                                   AS rows,
       min(created_at)                             AS oldest_created,
       max(attempts)                               AS max_attempts
FROM   email_outbox
GROUP  BY status
ORDER  BY status;

-- The individual stuck rows, newest first. `attempts` climbing on each pass
-- means the SMTP send itself is being refused, not that the claim is broken.
SELECT id,
       booking_id,
       template,
       to_addr,
       status,
       attempts,
       next_attempt_at,
       created_at
FROM   email_outbox
WHERE  status <> 'sent'
ORDER  BY created_at DESC
LIMIT  20;

-- ---------------------------------------------------------------------------
-- 2. Does rpc_claim_outbox_batch exist in BOTH arities?
-- Expected: exactly ONE row, args = "integer, uuid".
-- TWO rows = the old one-arg overload survived; the new p_booking_id is
-- silently ignored. Fix: run the DROP FUNCTION IF EXISTS at the top of
-- supabase/rpc-functions.sql.
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure                          AS signature,
       pg_get_function_identity_arguments(p.oid)    AS args
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
  AND  p.proname = 'rpc_claim_outbox_batch';

-- ---------------------------------------------------------------------------
-- 3. Can the app's role actually execute the claim?
-- Expected: true. False = security-lockdown.sql revoked it and the GRANT did
-- not land (or landed on a different arity). This alone stops every email.
-- ---------------------------------------------------------------------------
SELECT p.oid::regprocedure AS signature,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute,
       has_function_privilege('anon',         p.oid, 'EXECUTE') AS anon_can_execute
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
  AND  p.proname LIKE 'rpc_%'
ORDER  BY p.proname, signature;

-- ---------------------------------------------------------------------------
-- 4. Does the outbox table have claimed_at?
-- Expected: one row, claimed_at present, data_type timestamptz.
-- Missing = drizzle/0005_outbox_claimed_at.sql was not applied, so the claim
-- function errors on every call ("column claimed_at does not exist") and NO
-- email is ever sent. This is the most likely cause if you ran
-- rpc-functions.sql before 0005.
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'email_outbox'
ORDER  BY ordinal_position;

-- ---------------------------------------------------------------------------
-- 5. Did my test booking actually enqueue anything?
-- Expected: 2 rows per booking ('booking_customer_submitted' + one owner row),
-- both created within a second of the booking. ZERO rows means the problem is
-- upstream of mail — the submit transaction rolled back or never inserted the
-- outbox rows, and this is not a mailer problem at all.
-- ---------------------------------------------------------------------------
SELECT b.tracking_code,
       b.email,
       b.created_at        AS booking_created,
       b.status            AS booking_status,
       o.template,
       o.to_addr,
       o.status            AS mail_status,
       o.attempts
FROM   bookings b
LEFT   JOIN email_outbox o ON o.booking_id = b.id
ORDER  BY b.created_at DESC
LIMIT  10;
