-- CK Grounds — audit_log append-only enforcement (owner runs this ONCE
-- in the Supabase SQL editor: Dashboard → SQL → New query → paste → Run).
-- Mirrors supabase/proof-bucket.sql (same manual-apply pattern).
--
-- What this does:
--   1. Enables Row Level Security on public.audit_log.
--   2. Creates NO allow-policies for anon/authenticated, so every direct
--      PostgREST / API read or write to audit_log is DENIED by default.
--      (With RLS on and zero permissive policies, all API access fails
--      closed — including SELECT, INSERT, UPDATE, DELETE.)
--   3. Leaves the app untouched: the Next.js server talks to Postgres over
--      the DIRECT connection (DATABASE_URL, table owner), which bypasses RLS
--      by design (RLS never applies to table owners unless FORCED — and we
--      deliberately do NOT force it here, see below).
--
-- Residual risk (read before accepting):
--   - service_role BYPASSES RLS unconditionally — Postgres does not allow
--     denying service_role via policy. Anyone holding SUPABASE_SERVICE_ROLE_KEY
--     (or the direct DB password) can still UPDATE/DELETE audit rows. This is
--     a Supabase-platform limit, not a gap in this file: treat both keys as
--     owner-only secrets (Netlify env, never in git, never emailed).
--   - Do NOT add `FORCE ROW LEVEL SECURITY`: it would subject the table
--     owner (the app's direct connection) to RLS too and BREAK all audit
--     writes until an owner-bypass policy exists. Default (non-forced) RLS
--     is the correct setting here.
--
-- Safe to re-run: every statement is idempotent.

-- 1) Enable RLS (no-op if already enabled).
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 2) Belt-and-braces: drop any permissive policy a previous experiment may
--    have left behind, so the table is default-deny for API roles.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_log'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.audit_log', pol.policyname);
  END LOOP;
END
$$;

-- 3) Explicit restrictive policies (deny-everything, self-documenting in the
--    Dashboard → Authentication → Policies list). RESTRICTIVE policies are
--    AND-ed with any future permissive ones, so even if someone later adds an
--    allow-policy, UPDATE/DELETE stay denied.
CREATE POLICY "audit_log_no_update"
ON public.audit_log FOR UPDATE
TO public
USING (false)
WITH CHECK (false);

CREATE POLICY "audit_log_no_delete"
ON public.audit_log FOR DELETE
TO public
USING (false);

-- 4) Verification (run the SELECTs below after applying; expected results
--    in comments).
-- Expected: relrowsecurity = t, relforcerowsecurity = f
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'audit_log';

-- Expected: exactly the 2 restrictive policies above, nothing permissive
SELECT policyname, roles, cmd, permissive
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'audit_log'
ORDER BY policyname;
