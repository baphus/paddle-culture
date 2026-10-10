# AGENTS.md — paddle-culture

Single-package Next.js 16 app (npm, `package-lock.json`). No workspaces, no CI. See `README.md` for the human-facing overview.

## Commands

- `npm run dev` / `npm run build` (`next build`) / `npm start`
- `npx tsc --noEmit` — the only static check (`strict`, `noEmit`, `@/*` → `./src/*`)
- `npm test` — `node --test test/*.test.ts` (Node ≥ 22.6 strips TS types itself; no runner, no build step). `test/register-loader.mjs` + `test/ts-resolve-loader.mjs` resolve the extensionless imports and the `@/` alias, which plain Node cannot.
- Seed: `node scripts/seed-production.mjs` — idempotent courts/hours only, writes `scripts/seed-production.result.json`. Hand-parses `.env` (quotes stripped, no expansion); Next auto-loads `.env` for the app but the seed does not use `dotenv`.
- No ESLint/Prettier/vitest/jest/playwright config. Don't add tooling without asking.

## Setup order

1. Copy `.env.example` → `.env` (keys: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER/GMAIL_APP_PASSWORD`, `MAIL_FROM`, `APP_URL`, optional `SMTP_HOST/PORT/SECURE`, Sentry `*_DSN/ORG/PROJECT/AUTH_TOKEN`). `DATABASE_URL` / `DATABASE_POOLER_URL` / `DIRECT_DATABASE_URL` are only used by the seed script and `drizzle-kit`/`pg_dump` — the app itself talks to Supabase over HTTP and never opens a TCP connection.
2. In the Supabase SQL editor, run **in this order**:
   1. `drizzle/*.sql` (the Drizzle-generated migrations — tables, indexes, RLS helper objects). These are generated files; do not edit them.
   2. `supabase/proof-bucket.sql` — private `proofs` bucket.
   3. `supabase/audit-rls.sql` — RLS default-deny, no-update/no-delete; service_role bypass.
   4. **`supabase/rpc-functions.sql`** — the five RPCs **and** `holds_court_slot_unique_idx`. This file is the source of truth for anything Drizzle cannot express (`booking_slots_no_overlap_idx` is generated; the holds uniqueness is declared in `schema.ts` but applied here). Re-running it is safe (`CREATE OR REPLACE`, `IF NOT EXISTS`) — it also drops the now-redundant non-unique `holds_court_slot_idx`.
3. Run the seed, then `npm run dev` / `npm run build`.
4. Deploy (Vercel primary): set Vercel Production env (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER/GMAIL_APP_PASSWORD`, `MAIL_FROM` real domain, `APP_URL` https prod domain, `CRON_SECRET` same secret for `vercel.json` crons), do NOT set `SMTP_HOST` on Vercel (Gmail path). Build command `npm run build` (default).

**SQL drift is the main hazard in this repo.** The DB is not idempotently derivable from `src/db/schema.ts` alone: everything in `supabase/*.sql` lives only there. If you add an RPC, an index, or a trigger, add it to the matching file in `supabase/` and re-run that file in the SQL editor. Never assume `drizzle-kit migrate` covers it.

## Architecture

- Entrypoints: `src/app/layout.tsx` (Geist + `Toaster` from `@/components/ui/sonner`), `src/app/page.tsx` (public booking, `force-dynamic`, `FALLBACK_COURTS=[]` on DB miss), `src/app/{admin,login,register,track/[token]}/page.tsx`, ~25 `src/app/api/**/route.ts` (incl. `src/app/api/cron/*` wired via `vercel.json`), `src/proxy.ts`, `src/instrumentation.ts`, legacy fallback `netlify/functions/{outbox,retention,keepalive}.mts` (Vercel ignores `netlify/`).
- Auth: Next 16 **proxy** (`src/proxy.ts`, not `middleware.ts`). Uses `@supabase/ssr` `getClaims()` only — never `getSession()`. Gates `/admin/:path*`, redirects to `/login`. The proxy only proves *a* user is logged in; admin role is enforced per-route by `requireAdmin()` (`src/lib/admin/session.ts`). The proxy also applies per-IP rate limits to the unauthenticated write routes (`/api/holds`, `/api/submit`, `/api/proofs/upload-url`) — an in-memory, per-process counter, so the effective limit is `limit × instances`.
- DB: **`@supabase/supabase-js` HTTP client only** — no TCP pool, no Drizzle runtime. `getDb()` in `src/db/client.ts` is a service-role singleton that throws `NOT_CONFIGURED` without env so `next build` passes. `src/db/schema.ts` (13 tables) is a **Drizzle definition used for types only** (`.$inferSelect`); no query runs through it. Every transactional path is a PostgRPC in `supabase/rpc-functions.sql`:
  - `rpc_submit_booking(...)` — the 18-step submit transaction (idempotency keys, lazy hold expiry, `FOR UPDATE` holds, clash + proof-reuse checks, inserts, outbox rows, audit row).
  - `rpc_apply_decision(...)` — approve/reject, flips slot states, outbox + audit rows.
  - `rpc_claim_outbox_batch(p_limit)` — `FOR UPDATE SKIP LOCKED` outbox claim.
  - `rpc_delete_expired_holds(p_cutoff)` — retention purge.
  Overlap guard is the partial unique index `booking_slots_no_overlap_idx WHERE state IN ('held','pending','approved')` (the DB list is deliberately wider than the app's `LIVE_SLOT_STATES`). `holds_court_slot_unique_idx` guards one hold per (court, slot) — plain, not partial, because an index predicate must be immutable and a partial predicate is tested on write only, so it could not have meant "live holds" anyway. Expiry unblocks a slot only via a DELETE: `rpc_submit_booking` purges expired holds, the retention cron purges weekly, and `POST /api/holds` clears the expired rows for the pairs it inserts.
- Mail/outbox: Gmail port 587 + App Password (`src/lib/mail/transport.ts`); `SMTP_HOST` set routes to local Mailpit instead (`127.0.0.1:1025`). Shared lazy transport. Netlify functions use **relative `../../` imports only** and `src/lib/mail/*` must NOT import `server-only` (esbuild can't bundle it). Primary delivery is inline `drainOutboxBestEffort()` in submit/approve/reject; Vercel crons are backstops (`outbox` daily `0 2 * * *`, `retention` Sun 02:00, `keepalive` daily); Netlify `*/5` schedules are legacy. One owner alert per batch, not per dead row.
- Sentry: errors-only (`tracesSampleRate:0`, no replay), silent no-op if DSN missing. `next.config.ts` skips `withSentryConfig` unless `SENTRY_AUTH_TOKEN` set — build passes without it.
- Styling: Tailwind v4.3 CSS-first (`@theme` in `src/app/globals.css`, single `@tailwindcss/postcss` plugin, no config file). Components under `src/components/ui` were scaffolded by the **shadcn CLI** (`npx shadcn@latest add … -b base`, `components.json` is its config) — the `shadcn` package is a CLI, **not** a dependency, and `@import "shadcn/tailwind.css"` was removed from `globals.css` because the published `shadcn@1.0.0` ships no CSS. RSC, `lucide-react` named imports, `cn()` from `@/lib/utils` (the `cn` npm package — a drop-in for clsx + tailwind-merge, so neither is a dependency).
- Timezone: `Asia/Manila`. Never do browser-local date math. The Manila helpers live in `src/lib/booking/slots.ts` (`manilaDateStr`, `selectionDateStr`, `isOnSlotGrid`, `isFutureSlot`, `isWithinBookingHorizon`, `maxBookableInstant`) and `src/lib/courts.ts` (display formatting only, and it re-exports the slot helpers rather than duplicating them). Slot grid: 21 hourly slots from 06:00, `MAX_SLOTS_PER_BOOKING` 12, holds expire after `HOLD_TTL_MINUTES` 10.
- Server-side limits are enforced in `src/lib/booking/validation.ts`, never trusted from the client: 12-month booking horizon, slot count, hold token shape, proof size/mime.

## Conventions / gotchas

- Customer tracking needs **code + email** (`/api/booking/track`): the 5-char code is single-factor by itself.
- `netlify.toml`: build `npm run build`, publish `.next`, plugin `@netlify/plugin-nextjs`, functions dir `netlify/functions` (esbuild) — ignored by Vercel (legacy fallback only). `tsconfig.json` also includes `netlify/functions/**/*.mts` (legacy). Vercel needs `nodejs` runtime + `force-dynamic` on DB/mail routes (already in code); `proxy.ts` stays off `nodejs`.
- `deno.lock` is Netlify-edge hashes only — not app Deno usage.
- Don't edit generated/artifacts: `.next/`, `node_modules/`, `tsconfig.tsbuildinfo`, `next-env.d.ts`, `drizzle/*.sql` + `drizzle/meta/*`, `.netlify/`, `scripts/seed-production.result.json`.
- Frozen context in `docs/DECISIONS.md` (ADR-01..10: rates/hours/auth/email/storage) and `docs/BACKUPS.md` (manual `pg_dump` runbook). `docs/OPEN-QUESTIONS.md` has no open questions.
- Manual end-to-end verification still needs live Supabase Postgres + Auth/Storage and a Gmail App Password or Mailpit; `npm test` covers only the pure pricing/hours functions.
