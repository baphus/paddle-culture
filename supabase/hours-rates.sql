-- CK Grounds — operating hours carry the court rate (ADR-13).
-- Supersedes supabase/pricing-windows.sql (ADR-12). Owner runs this in the
-- Supabase SQL editor AFTER the drizzle/*.sql migrations and
-- supabase/rpc-functions.sql. This file is the copy-runnable record of the
-- migration applied via psql/Supabase MCP as "hours_carry_rates".
--
-- What this does:
--   1. Adds operating_hours.amount: the court's hourly rate for that row's
--      time range. NULLABLE on purpose — NULL is the legacy "hours exist but no
--      rate configured yet" state; the pricing engine rejects it with
--      PRICING_NOT_CONFIGURED (503) until the owner fills it in.
--   2. Adds a generated `span int4range` in MINUTES, the overlap key:
--      [open, close) for a same-day row, [open, close+1440) when the row wraps
--      midnight (close <= open). Drizzle cannot express this.
--   3. Migrates the old global rows (court_id NULL) onto every court, then
--      deletes them and makes court_id NOT NULL. If public.courts is empty the
--      copy has nowhere to land — seed courts first (see check below).
--   4. Rejects overlapping rows of the same (court, day) with a gist exclusion
--      constraint. Touching rows (06:00–12:00, 12:00–22:00) do NOT conflict.
--      Needs only btree_gist (uuid `=` on a NOT NULL column), no intarray.
--   5. Drops public.pricing_windows — the rate now lives on the hours row, so
--      there is ONE source of truth. No rows existed in the live DB at
--      migration time (verified: count = 0).
--
-- Semantics flip (app side): no operating_hours row for a court on a weekday
-- now means CLOSED (it used to mean "open all day"). Per-court rows only; the
-- global NULL-scope fallback is gone.
--
-- Safe to re-run: every statement is idempotent.

-- 1) Required for `uuid =` inside a gist exclusion constraint.
create extension if not exists btree_gist;

-- 2) Rate on the row.
alter table public.operating_hours
  add column if not exists amount numeric(12, 2);

alter table public.operating_hours
  drop constraint if exists operating_hours_amount_check;
alter table public.operating_hours
  add constraint operating_hours_amount_check
  check (amount is null or amount >= 0);

-- 3) Generated, stored: the overlap key in minutes.
alter table public.operating_hours
  add column if not exists span int4range
  generated always as (
    int4range(
      (extract(epoch from open_time) / 60)::int,
      (extract(epoch from close_time) / 60)::int
        + case when close_time > open_time then 0 else 1440 end
    )
  ) stored;

-- 4) One-time data migration: copy every global row onto every court (amount
--    stays NULL = "rate not configured yet"), then remove the NULL scope.
--    The NOT EXISTS guard skips rows a court already has verbatim, so re-running
--    a partially applied migration does not duplicate anything.
insert into public.operating_hours (court_id, day_of_week, open_time, close_time, amount)
select c.id, h.day_of_week, h.open_time, h.close_time, null
from public.operating_hours h
cross join public.courts c
where h.court_id is null
  and not exists (
    select 1
    from public.operating_hours x
    where x.court_id = c.id
      and x.day_of_week = h.day_of_week
      and x.open_time = h.open_time
      and x.close_time = h.close_time
  );

delete from public.operating_hours where court_id is null;

alter table public.operating_hours alter column court_id set not null;

-- 5) Per (court, day): no overlapping spans. Touching rows are allowed.
alter table public.operating_hours
  drop constraint if exists operating_hours_no_overlap;
alter table public.operating_hours
  add constraint operating_hours_no_overlap
  exclude using gist (
    court_id with =,
    day_of_week with =,
    span with &&
  );

-- 6) pricing_windows is superseded by the hours row rate (ADR-13).
drop table if exists public.pricing_windows;

-- 7) Verification (expected results in comments).
-- Expected: court_id NOT NULL, amount nullable numeric(12,2), span int4range.
select column_name, data_type, is_nullable, is_generated
from information_schema.columns
where table_schema = 'public' and table_name = 'operating_hours'
order by ordinal_position;

-- Expected: exactly one row (operating_hours_no_overlap) with contype = 'x'.
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.operating_hours'::regclass
  and contype = 'x';

-- Expected: every row has a court; no NULL scopes remain.
select count(*) as rows,
       count(*) filter (where court_id is null) as global_rows,
       count(*) filter (where amount is null) as pending_rate_rows
from public.operating_hours;

-- Expected: no row returned (table dropped).
select to_regclass('public.pricing_windows') as pricing_windows;
