# AGENTS.md — paddle-culture

Single-package Next.js app (npm, `package-lock.json`). No workspaces, no README, no lint/test/format scripts, no CI.

## Commands

- `npm run dev` / `npm run build` (`next build`) / `npm start`
- Typecheck: `npx tsc --noEmit` (no script; `strict`, `noEmit`, `@/*` → `./src/*`)
- DB generate/migrate: `npx drizzle-kit generate|migrate` — needs `DATABASE_URL` set (`drizzle.config.ts`)
- Seed: `node scripts/seed-production.mjs` — idempotent courts/hours only, writes `scripts/seed-production.result.json`. Hand-parses `.env` (quotes stripped, no expansion); Next auto-loads `.env` for the app but the seed does not use `dotenv`.
- No ESLint/Prettier/vitest/jest/playwright config. Don't add tooling without asking.

## Setup order

1. Copy `.env.example` → `.env` (keys: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER/GMAIL_APP_PASSWORD`, `MAIL_FROM`, `APP_URL`, optional `SMTP_HOST/PORT/SECURE`, Sentry `*_DSN/ORG/PROJECT/AUTH_TOKEN`).
2. Point `DATABASE_URL` at Supabase **direct** connection (pooler 6543 works for app, fails for `pg_dump` — see `docs/BACKUPS.md`).
3. Run seed, then manually run `supabase/proof-bucket.sql` + `supabase/audit-rls.sql` once in Supabase SQL editor (RLS default-deny, no-update/no-delete; service_role bypass).
4. `npm run dev` / `npm run build`.

## Architecture

- Entrypoints: `src/app/layout.tsx` (Geist + `Toaster` from `@/components/ui/sonner`), `src/app/page.tsx` (public booking, `force-dynamic`, `FALLBACK_COURTS=[]` on DB miss), `src/app/{admin,login,register,track/[token]}/page.tsx`, ~25 `src/app/api/**/route.ts`, `src/proxy.ts`, `src/instrumentation.ts`, `netlify/functions/{outbox,retention,keepalive}.mts`.
- Auth: Next 16 **proxy** (`src/proxy.ts`, not `middleware.ts`). Uses `@supabase/ssr` `getClaims()` only — never `getSession()`. Gates `/admin/:path*`, redirects to `/login`.
- DB: Drizzle (`src/db/schema.ts`, 13 tables) + `postgres-js` with `prepare:false` (required for Supabase pooler) via lazy `getDb()` in `src/db/client.ts`. Throws `NOT_CONFIGURED` without `DATABASE_URL` so `next build` passes. Overlap guard is partial unique index `booking_slots_no_overlap_idx WHERE state IN (held,pending,approved)`. Migration preamble sets `timezone='Asia/Manila'` + `pgcrypto`.
- Mail/outbox: Gmail port 587 + App Password (`src/lib/mail/transport.ts`); `SMTP_HOST` set routes to local Mailpit instead (`127.0.0.1:1025`). Shared transport; `server-only` in Next importers but **not** in `lib/mail/*` (esbuild can't bundle it). Netlify functions use **relative `../../` imports only**. Crons: `outbox` every 5 min (`processOutboxBatch`), `retention` Sundays 02:00 (deletes only `holds.expires_at < now-24h`), `keepalive` is a stub.
- Sentry: errors-only (`tracesSampleRate:0`, no replay), silent no-op if DSN missing. `next.config.ts` skips `withSentryConfig` unless `SENTRY_AUTH_TOKEN` set — build passes without it.
- Styling: Tailwind v4.3 CSS-first (`@theme` in `src/app/globals.css`, single `@tailwindcss/postcss` plugin, no config file). shadcn `base-nova`, RSC, `lucide-react` named imports, `cn()` from `@/lib/utils`.
- Timezone: `Asia/Manila` via `Intl` helpers in `src/lib/courts.ts`. Never do browser-local date math; 12-month max booking date; `slot_start > now()` rule.

## Conventions / gotchas

- `netlify.toml`: build `npm run build`, publish `.next`, plugin `@netlify/plugin-nextjs`, functions dir `netlify/functions` (esbuild). `tsconfig.json` also includes `netlify/functions/**/*.mts`.
- `deno.lock` is Netlify-edge hashes only — not app Deno usage.
- Don't edit generated/artifacts: `.next/`, `node_modules/`, `tsconfig.tsbuildinfo`, `next-env.d.ts`, `drizzle/*.sql` + `drizzle/meta/*`, `.netlify/`, `scripts/seed-production.result.json`.
- Frozen context in `docs/DECISIONS.md` (ADR-01..10: rates/hours/auth/email/storage) and `docs/BACKUPS.md` (manual `pg_dump` runbook). `docs/OPEN-QUESTIONS.md` has no open questions.
- No test runner or fixtures. Manual verification needs live Supabase Postgres + Auth/Storage and Gmail App Password or Mailpit.
