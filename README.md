# CK Grounds — court booking site

Public pickleball court booking for CK Grounds (Manila). Customers pick a date
and court, hold slots, upload a payment proof, and track their booking by code.
Staff approve or reject from `/admin`. All times are **Asia/Manila**.

## Stack

Next.js 16 · React 19 · TypeScript (strict) · Tailwind v4 · Supabase
(Postgres + Auth + Storage) · Gmail SMTP · Vercel.

There is no ORM in the request path. The app talks to Supabase over HTTP with
the service-role key; the eight transactional steps live in Postgres functions
(`supabase/rpc-functions.sql`). `src/db/schema.ts` is a Drizzle definition used
only for types.

## Running it

```bash
npm install
cp .env.example .env      # then fill in the Supabase + Gmail values
npm run dev
```

You must also run the SQL in the Supabase editor, once, in this order:

1. `drizzle/*.sql` — tables and indexes (generated)
2. `supabase/proof-bucket.sql` — private `proofs` bucket
3. `supabase/audit-rls.sql` — RLS policies
4. `supabase/rpc-functions.sql` — the RPCs + `holds_court_slot_unique_idx`

Then seed the courts and hours: `node scripts/seed-production.mjs`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm start` | serve the production build |
| `npx tsc --noEmit` | typecheck (the only static check — there is no linter) |
| `npm test` | unit tests for the pricing and operating-hours rules |
| `node scripts/seed-production.mjs` | idempotent seed of courts / hours / rates |

See `AGENTS.md` for the full architecture, conventions, and gotchas — that is
the file an agent should read before changing code.

## Layout

```
src/app/api/         customer + admin API routes, cron routes
src/app/admin/       staff screens (bookings, calendar, courts, hours, pricing,
                     revenue, users, audit, invites)
src/lib/booking/     slot grid, availability, holds gate, pricing, operating
                     hours, payment-proof verification
src/lib/admin/       admin sessions, booking list, revenue, dashboard
src/lib/mail/        transactional outbox + Gmail transport
src/components/      UI (shadcn base-nova components under components/ui)
supabase/            SQL that must be applied to Supabase by hand
drizzle/             generated migrations
test/                node --test specs
```

## Environment

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_FROM`,
`APP_URL`, and optionally `SMTP_HOST/PORT/SECURE` (local Mailpit instead of
Gmail) and the Sentry keys. `CRON_SECRET` protects the `/api/cron/*` routes on
Vercel. `.env.example` documents every key.

## Booking rules

- 21 hourly slots per day, 06:00 → 03:00 the next morning (Manila).
- Up to 12 slots per booking; up to 12 months in the future (both enforced server-side).
- Holds last 10 minutes and are one per (court, slot).
- Payment proof: jpg/png/webp, ≤ 5 MB, server-verified against the uploaded file.
- Overlapping bookings are blocked by a Postgres partial unique index, not by
  application checks.
