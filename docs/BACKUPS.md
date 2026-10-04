# CK Grounds — Backup Runbook (client-operated)

> ADR-07 / PRD §30: backups are **excluded from build scope** and there is
> **no automation on the free tier**. This is a manual runbook the **client
> (owner) runs weekly**. The developer transfer step at acceptance includes
> walking the client through one backup + one restore check.

## What gets backed up

- **Postgres (Supabase):** all tables (bookings, slots, holds, outbox,
  audit_log, pricing, invites, …). Schema + data.
- **Storage (`proofs` bucket):** payment-proof images are NOT in `pg_dump`.
  Back them up separately (section 3).
- **NOT backed up:** Supabase Auth users (re-invitable via admin invites),
  logs (1-day retention on free tier — export anything important same-day).

## 1. Database dump (weekly, ~5 minutes)

Run on any machine with PostgreSQL client tools (`pg_dump` ≥ 15):

```bash
# 1) Get the DIRECT connection string (Supabase Dashboard → Project Settings
#    → Database → Connection string → "Direct connection", port 5432).
#    Do NOT use the pooler (port 6543) for dumps.
export PGHOST=db.[PROJECT-REF].supabase.co
export PGPORT=5432
export PGDATABASE=postgres
export PGUSER=postgres
export PGPASSWORD='[DB-PASSWORD]'

# 2) Dump (custom format = compressed + selective restore)
pg_dump -Fc -f "paddleculture-$(date +%F).dump"

# 3) Sanity check (file must be well over 0 bytes and list tables)
pg_restore --list "paddleculture-$(date +%F).dump" | head -30
ls -la paddleculture-*.dump
```

Expected size at this scale: **kilobytes to a few MB** (bookings are tiny
rows; proofs live in Storage, not the DB).

## 2. Where to store (OUTSIDE Supabase, client-owned)

Keep the **3 most recent weekly dumps** in at least one of:

- Client Google Drive folder (e.g. `Paddle Culture/Backups/`), or
- Client laptop + a USB stick / external drive.

Naming: `paddleculture-YYYY-MM-DD.dump`. After copying off-machine, delete
dumps older than 3 weeks. **Never commit dumps to git, never email them**
(they contain customer names, emails, phone numbers).

## 3. Storage bucket (`proofs`) backup

Monthly (or after any busy stretch): Dashboard → Storage → `proofs` bucket →
download new files to the same client-owned folder (`Paddle Culture/Proofs/`).
There is no `pg_dump` equivalent on the free tier; this is a manual download.

## 4. Restore sketch (disaster only)

```bash
# A) Restore DB into a FRESH Supabase project (never restore over a live
#    project without a second backup first):
pg_restore -d "postgresql://postgres:'[NEW-DB-PASSWORD]'@db.[NEW-REF].supabase.co:5432/postgres" \
  --clean --if-exists "paddleculture-YYYY-MM-DD.dump"

# B) Re-run supabase/proof-bucket.sql in the new project's SQL editor
#    (recreates the private bucket + policies).
# C) Re-upload the Proofs folder into the new `proofs` bucket (same paths —
#    payment_proofs.path values keep working).
# D) Point the site at the new project: update Netlify env
#    (DATABASE_URL, NEXT_PUBLIC_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY),
#    redeploy, and run the Gmail smoke test (admin outbox trigger).
```

## 5. Weekly checklist (client, every Monday)

- [ ] `pg_dump` ran without errors, file size looks sane
- [ ] Dump copied to Drive/external, 3-newest rotation kept
- [ ] (Monthly) `proofs` bucket files downloaded
- [ ] Any Netlify/Supabase warning emails acted on (pause-after-idle,
      password or App-Password changes → credentials + redeploy)

## 6. Acceptance transfer (developer → client)

- [ ] Client has DB password + Gmail App Password stored (password manager)
- [ ] One supervised backup + one `pg_restore --list` verification done
- [ ] Client knows: Supabase pauses after 1 week idle (one click to resume),
      Gmail password change kills the App Password until redeploy

## 7. Retention purge (automatic, weekly)

Holds are the only unbounded-growth table (one row per court-hour held, most
abandoned). A Netlify scheduled function prunes them automatically:

- **What:** `netlify/functions/retention.mts`, schedule `0 2 * * 0`
  (every Sunday 02:00 UTC ≈ 10:00 Manila).
- **Deletes ONLY:** `holds` rows with `expires_at` older than
  `RETENTION_HOLD_GRACE_HOURS = 24` hours — i.e. holds that expired a full day
  ago. Every live read path already requires `expires_at > now()`, and the
  submit transaction lazy-deletes expired holds, so these rows can never be
  referenced again. The function returns `{ ok, purgedHolds }` for the
  Netlify function logs.
- **NEVER touched:** `bookings`, `booking_slots`, `payment_proofs`,
  `email_outbox`, `audit_log` — kept for the 3-year retention default
  (disputes, revenue history, append-only audit). No customer data is purged
  by this job, ever.
- **Failure mode:** if the function errors (e.g. DB paused after idle), it
  logs and retries next Sunday — worst case is a few extra stale hold rows,
  never data loss. Wake the project if Supabase paused it.
- **Audit:** `supabase/audit-rls.sql` (run once by the owner, §8) makes
  `audit_log` append-only at the database level, so retention/deletion bugs
  anywhere else cannot silently erase history.

## 8. One-time SQL the owner runs (Supabase SQL editor)

1. `supabase/proof-bucket.sql` — private `proofs` bucket + policies.
2. `supabase/audit-rls.sql` — RLS on `audit_log` denying UPDATE/DELETE for
   all API roles (service_role bypass is a platform limit — see the file's
   header comment), plus verification SELECTs. Re-runnable and safe.
