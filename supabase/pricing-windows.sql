-- SUPERSEDED BY ADR-13 — do NOT run on a database that has applied
-- supabase/hours-rates.sql. The rate now lives on the operating_hours row.
-- Kept for history only; pricing_windows no longer exists after ADR-13.
--
-- CK Grounds — hourly court pricing windows (ADR-12).
-- Owner runs this ONCE in the Supabase SQL editor (Dashboard → SQL → New query
-- → paste → Run), AFTER the drizzle/*.sql migrations. Mirrors the manual-apply
-- pattern of supabase/proof-bucket.sql and supabase/audit-rls.sql: this file is
-- the copy-runnable record of what is applied via Supabase MCP.
--
-- What this does:
--   1. Enables the array-gist + btree_gist operators the exclusion constraint
--      needs (idempotent).
--   2. Creates public.pricing_windows, the sole court pricing source.
--        court_id NULL = applies to every court (global).
--        days      = weekday ints 0=Sun..6=Sat, mirroring
--                    operating_hours.day_of_week; no duplicates (app-enforced —
--                    a CHECK cannot express DISTINCT).
--        start/end = whole Manila wall-clock hours, end EXCLUSIVE; end <= start
--                    wraps midnight (e.g. 18→03 covers 18..23, 00..02).
--      hour_span is a GENERATED int4range used only by the overlap constraint:
--      [start, end) for a same-day window, [start, end+24) for a wrap window.
--   3. Rejects overlapping rows of the SAME scope with a gist exclusion
--      constraint. Touching windows [6,12) / [12,18) do NOT conflict. A NULL
--      court_id is coalesced to the all-zero uuid sentinel so global rows
--      conflict with each other (a plain = would treat NULLs as distinct).
--      Court-scoped windows may overlap global windows — the court row wins
--      per hour in the app, with global filling the holes.
--   4. RLS default-deny exactly like supabase/audit-rls.sql: RLS on, no
--      permissive policies, restrictive no-update/no-delete for API roles.
--      service_role bypasses RLS, which is how the Next.js admin routes write.
--
-- Slot matching (app side, src/lib/booking/pricing.ts): a window covers hour h
-- on day d when d ∈ days and (h OR h+24) ∈ hour_span, so a wrapped row is one
-- row, not two.
--
-- Safe to re-run: every statement is idempotent.

-- 1) Required extensions for `int[] &&` (intarray) and `uuid =` (btree_gist).
create extension if not exists intarray;
create extension if not exists btree_gist;

-- 2) The table.
create table if not exists public.pricing_windows (
  id uuid primary key default gen_random_uuid(),
  -- NULL = global (all courts). Court deletion drops only that court's windows.
  court_id uuid references public.courts(id) on delete cascade,
  days int[] not null
    check (
      array_length(days, 1) between 1 and 7
      and days <@ '{0,1,2,3,4,5,6}'::int[]
    ),
  start_hour int not null check (start_hour between 0 and 23),
  -- Exclusive end. end <= start wraps midnight (end + 24 in hour_span).
  end_hour int not null
    check (end_hour between 0 and 23 and end_hour <> start_hour),
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

-- Generated, stored: the overlap key. Same-day window → [start, end);
-- wrap window → [start, end+24). Drizzle cannot express this, so it lives here.
alter table public.pricing_windows
  add column if not exists hour_span int4range
  generated always as (
    int4range(start_hour, end_hour + case when end_hour > start_hour then 0 else 24 end)
  ) stored;

-- 3) Overlap judgement. The sentinel coalesce gives NULL court_id a gist-
-- comparable value so two global rows can conflict.
alter table public.pricing_windows
  drop constraint if exists pricing_windows_no_overlap;
alter table public.pricing_windows
  add constraint pricing_windows_no_overlap
  exclude using gist (
    (coalesce(court_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    hour_span with &&,
    days with &&
  );

-- 4) RLS default-deny (no permissive policies; service_role bypasses).
alter table public.pricing_windows enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pricing_windows'
  loop
    execute format('drop policy if exists %I on public.pricing_windows', pol.policyname);
  end loop;
end
$$;

create policy "pricing_windows_no_update"
on public.pricing_windows for update
to public
using (false)
with check (false);

create policy "pricing_windows_no_delete"
on public.pricing_windows for delete
to public
using (false);

-- 5) Verification (expected results in comments).
-- Expected: relrowsecurity = t, relforcerowsecurity = f
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'pricing_windows';

-- Expected: exactly the 2 restrictive policies above, nothing permissive
select policyname, roles, cmd, permissive
from pg_policies
where schemaname = 'public' and tablename = 'pricing_windows'
order by policyname;
