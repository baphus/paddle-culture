# Paddle Culture — Architecture Decisions (build-freeze log)

Date: 2026-10-03 · Status: **Accepted, before code** · PRD: v1.0 Final (launch Oct 20, 2026)
Constraints locked by owner: **$0 as much as possible · Gmail SMTP via Nodemailer · serverless · simplest setup · production-ready**

Scale driver (from PRD): 2 courts, 21h/day (06:00–03:00), 1h slots, 1–12h consecutive, multi-court, no same-day, 12-mo rolling ≈ **15,330 live slot rows**. Single-to-low-double-digit bookings/day. No sharding/replicas needed.

## ADR-01 — Stack: Netlify Free + Supabase Free + Drizzle + Nodemailer/Gmail

**Decision:** Next.js (adapter v5) on **Netlify Free** · **Supabase Free** for Postgres + Auth + Storage · **Drizzle** (or supabase-js) · **Nodemailer → smtp.gmail.com:587** via outbox.

**Why:**
- Netlify Free is the only checked $0 Node host that is explicitly commercial-allowed, no card, with cron. Vercel Hobby bans commercial use (ToS, not quota) — rejected for production.
- Supabase collapses 3 services into 1 dashboard (DB + Auth + Storage) vs Netlify + Neon + R2 + Better Auth. Fewer env vars, no R2 custom-domain, no Better Auth `rateLimit.storage / joins / search_path` fixes.
- Drizzle stays: 0 deps, negligible cold start, protocol-level prepared statements OK with pooler.

**Rejected:** Vercel Hobby (commercial ban) · Neon+R2 (more dashboards/config for same scale) · Cloudflare Workers-only (10ms CPU kills scrypt/bcrypt login; partial `node:tls`) · AWS/Firebase (card required) · Hetzner VPS (cheapest production at ~€5.99/mo, but violates $0 + adds ops) · Render free DB (deleted 30 days after creation).

**Free quotas (hard walls):** Netlify 300 credits/mo = 30 GB-h functions + 1.5M requests + 15GB bandwidth + ~20 prod deploys/mo (previews free) · Gmail consumer 500 msgs/day rolling → **≈125–166 bookings/day @3–4 emails** (owner alert added per owner 2026-10-03) · Supabase Free: 500MB DB, 1GB storage, 50MB/file, 5GB egress, pause after 1 week idle, 2 projects, 1-day logs.

## ADR-02 — Data model (Postgres, timestamptz, Asia/Manila)

Tables: `courts(id, name, status, created_at)` · `operating_hours` + `closures(scope, range, reason, by)` · `pricing_rules(court_id nullable, day_type, time_band, item_type, unit, amount)` · `holds(hold_token, court_id, slot_start, expires_at)` · `bookings(id, tracking_token unique unguessable, status Pending/Approved/Rejected only — NO Cancelled and NO void per owner 2026-10-03 (erroneous approvals fixable only by direct DB intervention — risk accepted), full_name, email, phone, total, reject_reason, timestamps; ref_number COLUMN DROPPED per owner — approval is admin visual verification)` · `booking_slots(booking_id, court_id, slot_start)` with **partial unique index on (court_id, slot_start) WHERE state in held/pending/approved** (or exclusion constraint) · `booking_rentals(paddle_qty/hours, ball_fee one-time)` · `payment_proofs(booking_id, path, mime, bytes, uploaded_at)` — MANDATORY hard submit gate for EVERY booking (FROZEN per owner 2026-10-03: jpg/png/webp, ≤5MB, 1 file, immutable, private bucket + signed URLs; no proof = no booking row, hold stays until expiry) · `email_outbox(booking_id, template, to_addr, payload, status, attempts, next_attempt_at, message_id)` · `audit_log(actor, action, entity, entity_id, before/after, at)` append-only.

Derived, not stored: revenue rollups, booking QR (encodes tracking URL), website QR (static asset).

**Rates FROZEN per owner 2026-10-03:** off-peak ₱150/slot-hour (06:00–18:00), peak ₱200/slot-hour (18:00–03:00), ALL days (weekday = weekend); paddle ₱25/paddle/hour; ball ₱15 flat one-time per booking. CORRECTION: peak starts 18:00, not 17:00 (code `timeBandFor` must use 18:00).

## ADR-03 — Holds, concurrency, submit (DB is source of truth)

- Countdown is cosmetic client-side; server enforces `expires_at > now()` on every read. No in-memory hold state, no guaranteed cron for expiry (lazy expiry).
- Submit is **one serializable transaction**: delete expired holds → `SELECT … FOR UPDATE` → re-validate availability → server-side total recalc → insert booking + slots → delete hold → insert 2 outbox rows (customer submission + owner alert; approve/reject decision email enqueued at decision time per ADR-05). Idempotency key on submit kills duplicate POSTs.
- All times `timestamptz`, app TZ fixed to `Asia/Manila` (CONFIRMED by owner 2026-10-03).
- Midnight-crossing (06:00→03:00+1d) handled as datetime ranges, selection date = start date.
- Same-day bookings ALLOWED per owner 2026-10-03 (PRD §9 forbade them; acceptance gate #2 inverted). Only future slots bookable: `slot_start > now()` enforced in UI and server-side.

## ADR-04 — Auth (admin-only, customers unauthenticated)

Supabase Auth email+password for admins only. Invites FROZEN per owner 2026-10-03: per-invite single-use rows `admin_invites(token_hash, created_by_admin, created_at, used_at)` — NO expiry, unused rows valid until used; revoke = delete the unused row. Admin copies link → Messenger → invitee registers name/email/password → use stamps `used_at` (single-use enforced). Audit logs generate + use + delete. Deviates from PRD §4.1 24h expiry — owner-accepted. Email immutable after register (app-level guard), name mutable, deactivation = `banned_until`/disabled flag blocking login. Concurrent sessions allowed. Customers: no account, identity denormalized on booking. Admin SMTP for invites = same Gmail mailbox (paddleculture0@gmail.com, client-owned, per owner 2026-10-03).

## ADR-05 — Email (outbox + */5 cron, never inline)

Booking handler never calls `sendMail()` inline — it inserts outbox rows atomically: customer submission email + OWNER new-booking alert to paddleculture0@gmail.com (per owner 2026-10-03), then approval or rejection email on decision (3–4 sends per booking; Gmail ceiling ≈ 125/day worst case — still far above scale). Scheduled Function `schedule = "*/5 * * * *"` claims `LIMIT 50 FOR UPDATE SKIP LOCKED`, reuses **one** Nodemailer transport (587/TLS or 465/OAuth2), persists `message_id`, classifies Gmail errors: 4xx transient → backoff `min(6h, 60s·2^(n-1))` + jitter, 8 attempts then `failed`; `550 5.4.5` limit → retry in 1h without burning attempts; 535/534 auth, 550 5.7.x policy, 553 bad address → dead-letter + alert. Auth path: App Password generated by developer (holds Gmail password per owner 2026-10-03), stored in Netlify env; password change kills it until redeploy — transfer credentials + runbook to client at acceptance. Budget ≈ 8/300 credits at 20 bookings/day. `*/5` (≈24 credits), never per-minute (≈120 credits).

## ADR-06 — Storage (private bucket, signed URLs)

Bucket `proofs` **private** (renamed from `payment-proofs`, schema table stays `payment_proofs`). Customer upload via server-minted signed upload URL (scoped, short TTL); admin view/zoom/download via signed read URLs. No public-write, no replace/delete endpoints. Allowlist FROZEN per owner 2026-10-03: jpg/png/webp, ≤5MB, 1 file per website booking, immutable. Static assets (logo, court photos, GCash/BDO/BPI QRs, website QR) in public bucket or site repo.

## ADR-07 — Ops on free (what "production-ready" means here)

- Correctness from constraints + outbox, not from uptime. Overlap impossible even with double cold start.
- Observability: Netlify + Supabase 1-day/1h logs only — add Sentry from day 1 for auth/submit failures.
- Backups: none on free (same as PRD §30 exclusion) — weekly `pg_dump` stored outside Supabase, client-owned; document it.
- Deploy discipline: ≤20 prod deploys/mo, use branch previews; keep functions + DB in same region; ISR/`revalidate` everything cacheable.

## ADR-08 — Admin bookings table (columns FROZEN per owner 2026-10-03)

Columns: name · email · court(s) · date · time slots (e.g. 6–7AM, 7–8AM) · rented paddles · rented ball · total · status · actions. Phone lives in the row-detail drawer (captured at submit per PRD, not a column). Multi-court booking = ONE row with courts joined (not one row per slot). Search: name substring for now. Filters: date range + status for now (court filter deferred). Default sort newest-first, 20/page. Proof shown as thumbnail/link in detail drawer, not a column. Actions: view, approve, reject (reason mandatory, releases slots), tracking-link copy.

## ADR-09 — Admin-created bookings: REMOVED (per owner 2026-10-03)

No admin-created bookings. ALL bookings originate from the customer website flow (proof mandatory, Pending → approve/reject). Admins approve, reject (reason mandatory, releases slots), and manage courts/pricing/hours/admins only. Consequence: no on-site backdoor — walk-ins use the website, which allows same-day (future slots only).

## ADR-10 — Frontend package set (FROZEN per owner 2026-10-03, verified Oct 2026)

Next 16.3 + React 19 + Tailwind v4.3 (CSS-first `@theme` in globals.css, no config file; `@tailwindcss/postcss` separate — no autoprefixer/postcss-import) + shadcn CLI 4.21 with **Base UI** base pinned (`-b base` — CLI 4.21.1 rejects `-b base-ui`; same base, current flag name) + `sonner` 2.0 (toasts) + `lucide-react` 1.51 (named imports only). Forms: `react-hook-form` 7.89 + `zod` 4.6 + `@hookform/resolvers` 5.9. Dates: `date-fns` 4.4 + `@date-fns/tz` — slots modeled as index 0–20 → `timestamptz` via explicit `Asia/Manila`, never browser-local math. Tracking QR: `qrcode.react` 4.2 `QRCodeSVG`. Charts: `recharts` 3.10 via shadcn `chart`, admin-only behind `next/dynamic`. Tables: plain server-rendered shadcn `Table` + `?q=&page=` (NO TanStack). Upload: no package — client size/type check, direct browser→Supabase Storage (never through a route handler; Netlify buffers 6MB). Countdown: hand-written from server `deadlineMs`. Supabase: `@supabase/ssr` only (`auth-helpers-nextjs` banned); `getClaims()` server-side, never `getSession()`; Next 16 session file is `proxy.ts`, not `middleware.ts`. Do NOT install: MUI/AntD/Chakra/Mantine, react-admin/Refine, Redux/Zustand, moment/dayjs, react-dropzone/image-compression, bcrypt, tailwindcss-animate, shadcn toast, prereleases (RHF 8, drizzle 1.0-rc, supabase-js 3).

## Build order

Scaffold (Next 16 + Tailwind v4 + shadcn + ADR-10 set) → Schema + constraints → holds/submit transaction → admin auth/invites → upload (signed URLs) → outbox + cron + Gmail smoke test → approve/reject flows + tracking + QR → dashboard + audit → backups doc + Sentry.
