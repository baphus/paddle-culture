# Vercel Deployment Guide — CK Grounds

Complete setup checklist for deploying to Vercel after the Drizzle → Supabase-JS migration.
Follow these steps **in order**. Each section has a verification step — do not skip them.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Vercel account | **Pro plan or higher required** — Hobby bans commercial use (ADR-01) |
| Supabase project | Already created at `gacwnvqnlxnoxulajyhm.supabase.co` |
| Gmail App Password | For outbound booking emails |
| Repository pushed | Code must be in a Git repo connected to Vercel |

---

## Step 1 — Run the database migrations

These SQL files must be run **once** in the Supabase SQL editor before deploying. They are idempotent — safe to re-run.

Go to **Supabase Dashboard → SQL Editor → New query**.

### 1a. Schema migrations (drizzle-kit)

> **Skip this if the database already has tables from a previous deployment.** Check with:
> ```sql
> SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
> ```
> You should see: `admin_invites`, `audit_log`, `booking_rentals`, `booking_slots`, `bookings`, `closures`, `courts`, `email_outbox`, `holds`, `idempotency_keys`, `operating_hours`, `payment_proofs`, `pricing_rules`.

If the tables don't exist yet, run drizzle-kit migrations from your local machine:

```bash
# Requires DIRECT_DATABASE_URL (port 5432, not 6543) set in .env
DIRECT_DATABASE_URL=postgres://postgres:[password]@db.gacwnvqnlxnoxulajyhm.supabase.co:5432/postgres \
  npx drizzle-kit migrate
```

Get the direct connection string from: **Supabase Dashboard → Settings → Database → Connection string → URI** (select "Direct connection", not "Transaction pooler").

### 1b. RPC functions — REQUIRED for the Supabase-JS migration

Open `supabase/rpc-functions.sql` and paste the entire file into the SQL editor → Run.

This creates four Postgres functions the app now uses instead of the previous TCP connection pool:

- `rpc_submit_booking` — the booking submit transaction (SERIALIZABLE, atomic)
- `rpc_apply_decision` — approve/reject with outbox + audit (SERIALIZABLE)
- `rpc_claim_outbox_batch` — email outbox claim with FOR UPDATE SKIP LOCKED
- `rpc_delete_expired_holds` — retention cron hold purge

**Without these, booking submission, admin approve/reject, email sending, and the retention cron will all return 500 errors.**

✅ Verify: after running, check that the functions exist:
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE 'rpc_%'
ORDER BY routine_name;
```
Expected rows: `rpc_apply_decision`, `rpc_claim_outbox_batch`, `rpc_delete_expired_holds`, `rpc_submit_booking`.

### 1c. Proof bucket

Open `supabase/proof-bucket.sql` and run it in the SQL editor.

This creates the private `proofs` storage bucket with the correct MIME allowlist (jpg/png/webp, 5 MB cap) and grants the service role full access. If you've already done this previously, it's safe to run again (uses `ON CONFLICT DO UPDATE`).

✅ Verify: **Supabase Dashboard → Storage** — you should see a `proofs` bucket marked private.

### 1d. Audit log RLS

Open `supabase/audit-rls.sql` and run it in the SQL editor.

This enables Row Level Security on `audit_log` with default-deny for API roles (no anon/authenticated user can read or write audit rows directly). The service role key the app uses bypasses RLS unconditionally — no change to app behavior.

### 1e. Seed courts and pricing (first-time only)

If this is a fresh database with no courts or pricing rows, run the seed script locally:

```bash
# Needs DATABASE_URL or DATABASE_POOLER_URL (port 6543) in .env
node scripts/seed-production.mjs
```

Get the pooler connection string from: **Supabase Dashboard → Settings → Database → Connection string → URI** (select "Transaction pooler", port 6543).

> The seed script is idempotent for courts and operating hours. Pricing rules are checked but never overwritten.

---

## Step 2 — Set Vercel environment variables

In the **Vercel Dashboard → Project → Settings → Environment Variables**, add the following. Set scope to **Production** (and Preview if you want previews to work).

### Required — Supabase

| Variable | Where to find it | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL | e.g. `https://gacwnvqnlxnoxulajyhm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → Project API keys → `anon` `public` | Safe to expose to the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → Project API keys → `service_role` | **Keep secret — bypasses RLS** |

> **These three are the only DB-related vars the runtime now needs.**
> `DATABASE_URL`, `DATABASE_POOLER_URL`, and `DIRECT_DATABASE_URL` are no longer used at runtime. They're only needed locally for drizzle-kit migrations and the seed script.

### Required — Email (Gmail)

| Variable | Value | Notes |
|---|---|---|
| `GMAIL_USER` | `ckgrounds1@gmail.com` | The sending Gmail account |
| `GMAIL_APP_PASSWORD` | 16-character app password | Generate at myaccount.google.com → Security → 2-Step Verification → App passwords |
| `MAIL_FROM` | `"CK Grounds" <noreply@ckgrounds.vercel.app>` | Used as the From header. Use the real domain once set up. |

> **Do NOT set `SMTP_HOST` on Vercel.** Setting it routes mail through Mailpit (local dev SMTP). Leave it unset so the app uses the Gmail path.

### Required — App

| Variable | Value | Notes |
|---|---|---|
| `APP_URL` | `https://ckgrounds.vercel.app` | No trailing slash. Used for QR codes, tracking links, and email links. Update to your custom domain once set. |
| `CRON_SECRET` | Any long random string | Must match between Vercel env and `vercel.json` crons. Generate with: `openssl rand -hex 32` |

### Optional — Sentry (error monitoring)

| Variable | Notes |
|---|---|
| `SENTRY_DSN` | Server-side error capture. Get from Sentry project settings. |
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side error capture. Same value as `SENTRY_DSN`. |
| `SENTRY_ORG` | Sentry org slug. Only needed for sourcemap upload at build time. |
| `SENTRY_PROJECT` | Sentry project slug. Only needed for sourcemap upload at build time. |
| `SENTRY_AUTH_TOKEN` | Only needed for sourcemap upload. If not set, build passes silently without uploading. |

> Sentry is fully optional. The app runs normally without any Sentry vars — all Sentry calls are no-ops when the DSN is missing.

---

## Step 3 — Vercel project settings

In **Vercel Dashboard → Project → Settings → General**:

| Setting | Value |
|---|---|
| Build Command | `npm run build` (default, no change needed) |
| Output Directory | `.next` (default, no change needed) |
| Install Command | `npm install` (default, no change needed) |
| Node.js Version | 22.x or 20.x (either works; the app uses Node runtime for all API routes) |

In **Vercel Dashboard → Project → Settings → Functions**:

| Setting | Value |
|---|---|
| Region | Choose the region closest to your Supabase project. Supabase Free defaults to `us-east-1`. Matching regions eliminates inter-region latency on every API call. |

---

## Step 4 — Deploy

Push your branch or trigger a manual deploy from the Vercel dashboard.

✅ Verify the build completes with exit 0 and all 46 routes appear in the build output:
```
Route (app)
...
├ ƒ /api/submit
├ ƒ /api/holds
├ ƒ /api/availability
...
```

---

## Step 5 — Post-deploy verification

Run these checks immediately after the first production deploy.

### 5a. Health check
```
GET https://your-domain.vercel.app/api/health
```
Expected: `{ "ok": true, "runtime": "nodejs", "timestamp": "..." }`

### 5b. Courts endpoint (confirms DB connectivity)
```
GET https://your-domain.vercel.app/api/courts
```
Expected: `{ "courts": [...] }` — if the seed ran, this shows your court rows.
If you get `{ "error": { "code": "NOT_CONFIGURED" } }` — the Supabase env vars are missing.

### 5c. Pricing endpoint
```
GET https://your-domain.vercel.app/api/pricing
```
Expected: `{ "morning": 150, "evening": 200, "paddle": 25, "ball": 15, "currency": "PHP" }`
If you get `X-Pricing-Fallback: 1` header — the pricing_rules table is empty; run the seed.

### 5d. Admin login
Navigate to `https://your-domain.vercel.app/login` and sign in with your admin credentials.
If no admin account exists yet, create an invite:
```
POST https://your-domain.vercel.app/api/auth/invites
```
(No auth required for the first invite when zero admins exist — bootstrap path.)

### 5e. Gmail smoke test
In the admin panel: **Outbox → Process** (or `POST /api/admin/outbox/process`).
Expected: `{ "ok": true, "claimed": 0, "sent": 0, "retried": 0, "failed": 0 }`
If `claimed > 0` and `failed > 0`: check `GMAIL_USER` and `GMAIL_APP_PASSWORD`.

### 5f. Cron authorization
```
GET https://your-domain.vercel.app/api/cron/keepalive
Authorization: Bearer <your CRON_SECRET>
```
Expected: `{ "ok": true }`
If you get `{ "ok": false }` with status 401: the `CRON_SECRET` env var doesn't match.

---

## Step 6 — Cron jobs

The `vercel.json` file configures three crons that Vercel invokes automatically on Pro plans:

| Cron | Schedule | Purpose |
|---|---|---|
| `/api/cron/outbox` | `0 2 * * *` — daily 02:00 UTC | Backstop email drain (primary send is inline after submit/approve/reject) |
| `/api/cron/retention` | `0 2 * * 0` — Sunday 02:00 UTC | Purges expired holds older than 24 hours |
| `/api/cron/keepalive` | `10 2 * * *` — daily 02:10 UTC | Keeps the Supabase project alive (prevents free-tier pause after 1 week idle) |

Vercel invokes crons with `Authorization: Bearer <CRON_SECRET>`. Ensure `CRON_SECRET` is set in Vercel env and is the same value as what's in your environment.

✅ Verify crons are registered: **Vercel Dashboard → Project → Cron Jobs** — all three should appear.

---

## Environment variable summary

Quick-reference for the Vercel Production env. Copy this list and fill in the values.

```
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://gacwnvqnlxnoxulajyhm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase API settings>
SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase API settings>

# Gmail (required)
GMAIL_USER=ckgrounds1@gmail.com
GMAIL_APP_PASSWORD=<16-char app password>
MAIL_FROM=CK Grounds <noreply@ckgrounds.vercel.app>

# App (required)
APP_URL=https://ckgrounds.vercel.app
CRON_SECRET=<random hex, e.g. output of: openssl rand -hex 32>

# Sentry (optional)
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=

# NOT needed at runtime (drizzle-kit migrations only — set locally, not on Vercel)
# DIRECT_DATABASE_URL=
# DATABASE_URL=
# DATABASE_POOLER_URL=
```

---

## Troubleshooting

### `{ "code": "NOT_CONFIGURED" }` on any API route
`NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing or blank in Vercel env. Check **Settings → Environment Variables** and redeploy.

### `function rpc_submit_booking does not exist`
The `supabase/rpc-functions.sql` script hasn't been run. Go to **Supabase SQL Editor** and run it now. No redeploy needed — the functions are available immediately.

### Booking submit returns 409 SLOT_TAKEN immediately
The `booking_slots_no_overlap_idx` partial unique index exists in the DB and is enforcing correctly. This is expected behavior, not a bug. If it fires on a genuinely empty slot, check that the holds were created successfully before submitting.

### Emails not sending (failed in outbox)
1. Confirm `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set correctly in Vercel env.
2. Confirm `SMTP_HOST` is **not** set on Vercel (it would route to Mailpit).
3. Check the outbox via **Supabase Dashboard → Table Editor → email_outbox** — rows with `status = 'failed'` have the error detail in the payload.
4. Trigger a manual drain: `POST /api/admin/outbox/process` (admin auth required).

### Admin session not persisting
Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are both set. The browser auth client uses the anon key; missing it causes sign-in to silently fail.

### Crons not running
Crons require a **Vercel Pro** plan. On Hobby, `vercel.json` crons are ignored. Verify your plan under **Vercel Dashboard → Settings → Billing**.

### Tracking code collision (extremely rare)
The submit route retries the `rpc_submit_booking` call up to 5 times with a fresh randomly-generated 5-character code on `tracking_code` unique constraint violations. No action needed — it resolves automatically.
