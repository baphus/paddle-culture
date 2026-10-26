-- CK Grounds — database privilege lockdown.
-- Owner runs this ONCE in the Supabase SQL editor after the schema is in place:
--   Dashboard → SQL → New query → paste → Run.
-- Mirrors supabase/audit-rls.sql (same manual-apply pattern).
--
-- WHY THIS FILE EXISTS
-- The site ships a public `NEXT_PUBLIC_SUPABASE_ANON_KEY` and Supabase exposes
-- every table in `public` over PostgREST to the `anon` role by default. Until
-- now only audit_log (audit-rls.sql) and expenses (expenses.sql) had RLS on;
-- the other twelve tables — holds, bookings, booking_slots, payment_proofs,
-- admin_invites, idempotency_keys, ... — had RLS OFF, so anyone with the anon
-- key (which is in the served JS bundle) could read every customer's name,
-- phone and email, and could write or delete rows. The Next.js server does not
-- rely on RLS: it talks to Postgres as the table owner, which bypasses RLS
-- unless it is FORCED (see audit-rls.sql lines 16-25 — we keep it non-forced).
--
-- Three independent layers, in order:
--   1. RLS on every business table with zero permissive policies = default deny
--      for the API roles.
--   2. Privilege revocation: anon/authenticated lose ALL table and function
--      privileges outright. This is the layer that actually matters — RLS is a
--      row filter, privileges are the door.
--   3. Default privileges, so a future table created by a migration does not
--      silently reopen the hole.
--
-- Safe to re-run: every statement is idempotent.

-- ===========================================================================
-- 1. Row Level Security on every business table.
--    Non-forced on purpose: FORCE would subject the owner (the app's direct
--    connection) to RLS and break every write. See audit-rls.sql:22-25.
-- ===========================================================================
ALTER TABLE public.admin_invites      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_rentals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_slots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closures           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbox       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holds              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operating_hours    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_proofs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rules      ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- 2. Revoke API-role privileges. RLS alone would still let anon attempt calls;
--    removing the grants makes the intent explicit and fails at the privilege
--    check before any row is touched.
--
--    service_role keeps its access and BYPASSES RLS — the server uses the
--    service-role key, and the dashboards read through it.
-- ===========================================================================
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Supabase's own defaults grant these broadly; close the schema door too so a
-- future table does not need its own migration to be safe.
REVOKE ALL ON SCHEMA public FROM anon;
REVOKE CREATE ON SCHEMA public FROM anon, authenticated;

-- ===========================================================================
-- 3. The RPCs are the server's write path. They are SECURITY DEFINER, so if
--    anon can EXECUTE one it runs with the owner's rights and RLS never sees
--    it. Grant them to service_role only. (Each function also carries its own
--    REVOKE in rpc-functions.sql; this block is the belt to that braces and
--    covers every function by name so a missed one shows up here.)
-- ===========================================================================
REVOKE ALL ON FUNCTION rpc_replace_court_hours(uuid, int[], time, time, numeric, text)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rpc_add_court_hours(uuid, int[], time, time, numeric, boolean, text)             FROM PUBLIC, anon, authenticated;
-- NOTE: the signature must match rpc-functions.sql EXACTLY. `CREATE OR REPLACE
-- FUNCTION` with a changed argument list does not replace the old function, it
-- adds an overload — so a stale `(int)` copy lives on beside the new
-- `(int, uuid)` one. Both are then anon-callable until lockdown runs, and this
-- file must name both arities or the stale one keeps a PUBLIC grant.
-- rpc-functions.sql drops the old (int) form on re-run; these lines cover the
-- window before that, and are skipped when the function is absent.
DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
    AND    p.proname = 'rpc_claim_outbox_batch'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION rpc_delete_expired_holds(timestamptz)                                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rpc_reclaim_holds(text, jsonb, timestamptz, text[])                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rpc_apply_decision(uuid, text, text, text)                                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rpc_submit_booking(text, text, text, text, text, text, text, text[], jsonb, int, text, text, text, text, int, jsonb, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rpc_delete_expired_proofs(timestamptz)                                           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rpc_admin_create_booking(text, text, text, text, text, text, text, jsonb, jsonb, int, text, text, text, text, int, boolean, jsonb, text, boolean) FROM PUBLIC, anon, authenticated;
-- Added by supabase/refund.sql and supabase/booking-delete.sql.
REVOKE ALL ON FUNCTION rpc_refund_booking(uuid, text, text)                                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rpc_delete_booking(uuid, text)                                                    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION rpc_replace_court_hours(uuid, int[], time, time, numeric, text)                  TO service_role;
GRANT EXECUTE ON FUNCTION rpc_add_court_hours(uuid, int[], time, time, numeric, boolean, text)             TO service_role;
GRANT EXECUTE ON FUNCTION rpc_delete_expired_holds(timestamptz)                                            TO service_role;
GRANT EXECUTE ON FUNCTION rpc_reclaim_holds(text, jsonb, timestamptz, text[])                              TO service_role;
GRANT EXECUTE ON FUNCTION rpc_apply_decision(uuid, text, text, text)                                       TO service_role;
GRANT EXECUTE ON FUNCTION rpc_submit_booking(text, text, text, text, text, text, text, text[], jsonb, int, text, text, text, text, int, jsonb, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_delete_expired_proofs(timestamptz)                                           TO service_role;
GRANT EXECUTE ON FUNCTION rpc_admin_create_booking(text, text, text, text, text, text, text, jsonb, jsonb, int, text, text, text, text, int, boolean, jsonb, text, boolean) TO service_role;
-- Added by supabase/refund.sql and supabase/booking-delete.sql.
GRANT EXECUTE ON FUNCTION rpc_refund_booking(uuid, text, text)                                             TO service_role;
GRANT EXECUTE ON FUNCTION rpc_delete_booking(uuid, text)                                                    TO service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ===========================================================================
-- 4. Default privileges: anything created later in `public` starts closed.
--    Without this, drizzle-kit creating a new table hands anon the same open
--    grants it gave the existing ones, and the hole comes back one table at a
--    time. Applies to objects created BY the current role (the owner).
-- ===========================================================================
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- ===========================================================================
-- 5. Verification. Run these; the expected values are in the comments.
-- ===========================================================================

-- Expected: 14 rows, every one with rowsecurity = t and force_rowsecurity = f.
SELECT c.relname,
       c.relrowsecurity    AS rowsecurity,
       c.relforcerowsecurity AS force_rowsecurity
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public'
  AND  c.relkind = 'r'
  AND  c.relname IN (
         'admin_invites','audit_log','booking_rentals','booking_slots',
         'bookings','closures','courts','email_outbox','expenses','holds',
         'idempotency_keys','operating_hours','payment_proofs','pricing_rules'
       )
ORDER BY c.relname;

-- Expected: ZERO rows. Any row here is a table anon/authenticated can still
-- reach — the exact thing this file is meant to prevent.
SELECT table_schema, table_name, privilege_type, grantee
FROM   information_schema.role_table_grants
WHERE  grantee IN ('anon', 'authenticated')
  AND  table_schema = 'public'
ORDER BY table_name, grantee, privilege_type;

-- Expected: ZERO rows. Any row here is a SECURITY DEFINER function anon can
-- still execute directly, bypassing RLS entirely.
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
  AND  p.prosecdef
  AND  (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
ORDER BY p.proname;

-- Expected: every SECURITY DEFINER function has a pinned search_path.
-- A NULL here is a search_path hijack risk.
SELECT p.proname,
       p.proconfig
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public' AND p.prosecdef
ORDER BY p.proname;

-- Expected: exactly ONE row for rpc_claim_outbox_batch, with args
-- "integer, uuid". TWO rows means the old one-argument overload survived a
-- re-run of rpc-functions.sql (CREATE OR REPLACE with a new argument list
-- adds an overload instead of replacing). That overload shadows the new
-- signature: PostgREST drops the unnamed argument it cannot match, so calls
-- still succeed but p_booking_id is silently ignored and the unscoped claim
-- comes back. Run the DROP FUNCTION IF EXISTS rpc_claim_outbox_batch(int);
-- at the top of rpc-functions.sql to remove it.
SELECT p.oid::regprocedure AS signature,
       pg_get_function_identity_arguments(p.oid) AS args
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
  AND  p.proname = 'rpc_claim_outbox_batch';
