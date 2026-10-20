# CK Grounds — Architecture Decisions (build-freeze log)

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

**Amendment 2026-10-05 (per owner: Vercel primary):** owner chose **Vercel as the primary host**. A commercial-allowed plan is required — the Vercel Hobby commercial ban from the original decision still applies, so use Pro (or another ToS-cleared plan). Netlify config (`netlify.toml` + `netlify/functions/`) is kept as a legacy fallback. Code supports both (Vercel crons in `vercel.json` + `src/app/api/cron/*` alongside Netlify functions). No other ADR changed.

## ADR-02 — Data model (Postgres, timestamptz, Asia/Manila)

Tables: `courts(id, name, status, created_at)` · `operating_hours` + `closures(scope, range, reason, by)` · `pricing_rules(court_id nullable, day_type, time_band, item_type, unit, amount)` · `holds(hold_token, court_id, slot_start, expires_at, owner_token)` · `bookings(id, tracking_token unique unguessable, status Pending/Approved/Rejected only — NO Cancelled and NO void per owner 2026-10-03 (erroneous approvals fixable only by direct DB intervention — risk accepted), full_name, email, phone, total, reject_reason, timestamps; ref_number COLUMN DROPPED per owner — approval is admin visual verification)` · `booking_slots(booking_id, court_id, slot_start)` with **partial unique index on (court_id, slot_start) WHERE state in held/pending/approved** (or exclusion constraint) · `booking_rentals(paddle_qty/hours, ball_fee one-time)` · `payment_proofs(booking_id, path, mime, bytes, uploaded_at)` — MANDATORY hard submit gate for EVERY booking (FROZEN per owner 2026-10-03: jpg/png/webp, ≤5MB, 1 file, immutable, private bucket + signed URLs; no proof = no booking row, hold stays until expiry) · `email_outbox(booking_id, template, to_addr, payload, status, attempts, next_attempt_at, message_id)` · `audit_log(actor, action, entity, entity_id, before/after, at)` append-only.

Derived, not stored: revenue rollups, booking QR (encodes tracking URL), website QR (static asset).

**Court rates are configured per court and operating-hours row by the admin. Customer-facing court pricing must use the matching `operating_hours.amount` for each selected slot, without labeling rates as day/night or assuming fixed time bands. Paddle and ball rates remain in `pricing_rules`.

## ADR-03 — Holds, concurrency, submit (DB is source of truth)

- Countdown is cosmetic client-side; server enforces `expires_at > now()` on every read. No in-memory hold state, no guaranteed cron for expiry (lazy expiry).
- **Hold reclaim (amended 2026-02, owner-approved).** `holds.owner_token` (nullable text, browser-session `crypto.randomUUID`) records the capability that created a hold; `POST /api/holds/reclaim` extends a live hold to a full `HOLD_TTL_MINUTES`, or re-inserts the same `(court_id, slot_start)` pairs when they expired **within `HOLD_GRACE_MINUTES` (30)** and are still free. Past that window the slots are genuinely released. `/api/proofs/upload-url` and `/api/submit` accept `ownerToken` as an alternative credential so a customer whose hold lapsed mid-payment can still deliver the proof they already paid for. `owner_token` is a capability, **not an identity** — it never widens who may book a slot; availability, `holds_court_slot_unique_idx` and the submit transaction still decide that. Rationale: the wizard was 100% in-memory, so a mobile browser refresh after a banking-app detour silently reset the customer to step 1, and with every proof/submit path gated on live tokens a paid customer had no route back to their own hold. Worst-case inventory pin = `HOLD_TTL_MINUTES + HOLD_GRACE_MINUTES` = 40 min.
- **Wizard draft persistence (same amendment).** The booking wizard mirrors its state to `sessionStorage` (`src/lib/booking/draft.ts`, per-tab, dies with the tab) so a reload restores the customer to the step they were on. Confirmation is never persisted. Server validation is unchanged — the draft is a convenience, never a source of truth.
- Submit is **one serializable transaction**: delete expired holds → `SELECT … FOR UPDATE` → re-validate availability → server-side total recalc → insert booking + slots → delete hold → insert 2 outbox rows (customer submission + owner alert; approve/reject decision email enqueued at decision time per ADR-05). Idempotency key on submit kills duplicate POSTs.
- All times `timestamptz`, app TZ fixed to `Asia/Manila` (CONFIRMED by owner 2026-10-03).
- Midnight-crossing (06:00→03:00+1d) handled as datetime ranges, selection date = start date.
- Same-day bookings ALLOWED per owner 2026-10-03 (PRD §9 forbade them; acceptance gate #2 inverted). Only future slots bookable: `slot_start > now()` enforced in UI and server-side.

## ADR-04 — Auth (admin-only, customers unauthenticated)

Supabase Auth email+password for admins only. Invites FROZEN per owner 2026-10-03: per-invite single-use rows `admin_invites(token_hash, created_by_admin, created_at, used_at)` — NO expiry, unused rows valid until used; revoke = delete the unused row. Admin copies link → Messenger → invitee registers name/email/password → use stamps `used_at` (single-use enforced). Audit logs generate + use + delete. Deviates from PRD §4.1 24h expiry — owner-accepted. Email immutable after register (app-level guard), name mutable, deactivation = `banned_until`/disabled flag blocking login. Concurrent sessions allowed. Customers: no account, identity denormalized on booking. Admin SMTP for invites = same Gmail mailbox (ckgrounds1@gmail.com, client-owned, per owner 2026-10-03).

## ADR-05 — Email (outbox + */5 cron, never inline)

Booking handler never calls `sendMail()` inline — it inserts outbox rows atomically: customer submission email + OWNER new-booking alert to ckgrounds1@gmail.com (per owner 2026-10-03), then approval or rejection email on decision (3–4 sends per booking; Gmail ceiling ≈ 125/day worst case — still far above scale). Scheduled Function `schedule = "*/5 * * * *"` claims `LIMIT 50 FOR UPDATE SKIP LOCKED`, reuses **one** Nodemailer transport (587/TLS or 465/OAuth2), persists `message_id`, classifies Gmail errors: 4xx transient → backoff `min(6h, 60s·2^(n-1))` + jitter, 8 attempts then `failed`; `550 5.4.5` limit → retry in 1h without burning attempts; 535/534 auth, 550 5.7.x policy, 553 bad address → dead-letter + alert. Auth path: App Password generated by developer (holds Gmail password per owner 2026-10-03), stored in Netlify env; password change kills it until redeploy — transfer credentials + runbook to client at acceptance. Budget ≈ 8/300 credits at 20 bookings/day. `*/5` (≈24 credits), never per-minute (≈120 credits).

- Amendment 2026-10-04 (per owner: mail must arrive immediately, local + prod): submit/approve/reject routes now `await drainOutboxBestEffort()` right after commit — sends due rows at once instead of waiting up to 5 min for the cron. Still outbox-based (rows commit atomically first; the drain never throws, so a mail outage can't fail a booking), and the cron + `POST /api/admin/outbox/process` remain as backstops (claiming is atomic, no double-sends). Local SMTP via `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`MAIL_FROM` (Mailpit `127.0.0.1:1025`, no auth); unset `SMTP_HOST` keeps the Gmail path. Manual drain: `npx tsx scripts/drain-outbox.ts`.

## ADR-05b — Calendar links in customer email (added 2026-10-06)

**Decision:** the `booking_customer_approved` and `booking_customer_submitted` emails carry an **"Add to Google Calendar" link**, **one per court session**, reusing `src/lib/booking/calendar.ts`.

**Why:**
- **Customers were re-typing their slots into their phones.** The web receipt (`booking-invoice.tsx`) already had the button; the email — the artifact customers keep — did not.
- **Approved + pending review, not just approved.** The pending email is the one that arrives while the booking is still fresh in the customer's head. It carries the caveat *"Your slot is not confirmed until we verify your payment proof"* so the calendar entry is never mistaken for a confirmation, and the filled "View Booking Status" CTA still outranks it visually.
- **One event per session.** A booking can be two courts, or two different days. `googleCalendarUrl` merges a whole booking into one span (first start → 1h after the last end), which for a two-day booking puts a week-long event on the customer's calendar. The emails therefore use the additive `googleCalendarUrlForRange({startIso, endIso})`. `googleCalendarUrl` is unchanged so the web receipt keeps its existing single-span behaviour (guarded by `test/calendar-url.test.ts`).
- **Not the rejected email.** `booking_customer_rejected` schedules nothing — the slots are released, so a calendar entry would be actively wrong.

**Rejected: `.ics` attachment (`text/calendar; METHOD:PUBLISH`).** It would also serve Apple Calendar and Outlook, but costs one more attachment per email against the Gmail daily ceiling (ADR-05), several clients only surface the first `VEVENT` (wrong for multi-session bookings), and Gmail renders it as a system card the sender cannot style or label. Link-only keeps the change inside the templates with no worker, DB or RPC change — the approve/submit payloads already carry `trackingToken`, `email` and `slots[{courtName, slotStart}]`. Revisit if customers on iOS/Outlook ask for it.

**Consequence:** `CourtSession` in `templates.ts` now also carries `startIso`/`endIso` alongside its display strings, so the calendar link never re-parses formatted dates. No `supabase/*.sql` or `src/lib/mail/worker.ts` change.

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

## ADR-11 — Hourly pricing windows (added 2026-10-20)

**Decision:** court rates may be expressed as whole-hour windows `HH:00-HH:00` (Manila) in `pricing_rules.time_band`, e.g. `06:00-12:00 → ₱120`. A window row is `day_type='all'`, `item_type='court'`, `unit='slot'`; `court_id` is the court or NULL for global. Windows are **day-agnostic** — the same set applies to every day, and `day_type` does not scope them.

- **Coverage gate.** Windows are active for a court only when that court's own windows ∪ global windows cover *every* bookable hourly start (derived from `operating_hours` with the global fallback availability uses; falls back to the fixed 21-slot 06:00→03:00 grid when hours cannot be read). If any hour is uncovered, windows are inert and the existing band fallback prices every court slot exactly as before. When active, window rows price court slots exclusively (no band fallback); paddle/ball keep using bands.
- **Precedence.** Within active windows: court-scoped window beats global window. Bands (`morning`/`evening`/`all`) never price a court slot while windows are active.
- **Overlap rule.** Saving a window that overlaps an existing window of the **same scope** is rejected (409) naming the conflict; touching endpoints (06-12 / 12-18) are not overlaps and overnight wrap (18-03) is allowed. Court windows may overlap global windows — the court row wins. The DB key index is unchanged; no SQL change.
- **Deletes.** Global *band* rows still cannot be deleted (they are the fallback). Global *window* rows can be deleted like court-scoped rows.
- **Supersedes ADR-02's fixed band card only when coverage is complete** for that court. Until then, ADR-02's morning/evening rates remain the price.

**Why:** the owner wants time-of-day pricing beyond the two frozen bands without a migration; windows live in the existing rule table and are inert until fully specified, so a half-entered window set can never leave a bookable hour unpriced or silently change rates.

**Amendment 2026-10-20 — windows are per-weekday.** A window's `day_type` now scopes it to a weekday set: `'all'` or a canonical comma list of `sun..sat` keys (`'mon'`, `'sat,sun'`). `day_type` is plain text, so no SQL change. `'weekday'`/`'weekend'`/`'holiday'` are rejected for window rows (bands keep them). The overlap rule (409) now requires both a time overlap **and** a shared weekday; windows on disjoint days may use the same hours. The coverage gate is evaluated per weekday with the same all-or-nothing rule per court: for every day, that day's bookable hours must be covered by the court's ∪ global windows scoped to that day; a closed day counts as covered. A slot is priced by a window only when the window's day set contains the slot's Manila weekday, so a Monday window never prices a Tuesday. A holiday prices by its weekday's windows.

## ADR-12 — Court pricing moves to a real `pricing_windows` table (added 2026-10-20, supersedes ADR-11's row overload)

**Decision:** court rates live in **`public.pricing_windows`**, not in `pricing_rules.time_band`. ADR-11 overloaded `pricing_rules` with `"HH:00-HH:00"` band strings and day-key text; that encoding is gone (`parseWindowBand` / `DAY_KEYS` deleted).

- **Shape.** `id uuid`, `court_id uuid NULL` (`NULL` = global, `ON DELETE CASCADE`), `days int[]` (1..7, each 0=Sun..6=Sat, **mirroring `operating_hours.day_of_week`**), `start_hour`/`end_hour int` (0..23, end **exclusive**; `end <= start` wraps midnight), `amount numeric(12,2) >= 0`, `created_at`.
- **Overlap = DB constraint.** `hour_span int4range` is a generated stored column: `[start, end)` normally, `[start, end+24)` for a wrap. `pricing_windows_no_overlap` is a gist `EXCLUDE` on `(coalesce(court_id, '00000000-…'::uuid) WITH =, hour_span WITH &&, days WITH &&)` — the NULL coalesce gives global rows a gist-comparable sentinel so two global windows conflict. Touching windows `[6,12)` / `[12,18)` do not conflict; a wrap window is **one row**. The API runs the same check in JS first only to return a friendly 409 naming the conflicting row (`dayListLabel` + `windowLabel`); PG `23P01` maps to the same 409. The DB constraint is the single overlap judge.
- **Slot matching.** `recalculateTotal` reads `pricing_windows` and prices a court slot by the court-scoped window covering its Manila `day`+`hour`, then a global window for the same day+hour; a wrapped row covers its hours on every day in `days`. Court window wins per hour, global fills holes. **No band fallback for courts, ever.** No window → `PRICING_NOT_CONFIGURED` (503). The engine no longer reads `operating_hours`; hours are advisory (coverage badge in the admin page only).
- **Days dedupe.** `days` uniqueness is app-enforced (`pricingWindowSchema` rejects duplicates); a CHECK cannot express `DISTINCT`. `shortcut:` comment in the SQL file.
- **Edits.** `PATCH` changes **amount only**. Schedule edits are delete + recreate, which keeps the exclusion constraint the one overlap judge.
- **Paddle/ball unchanged.** They remain band rows in `pricing_rules` and keep the `pickRule` fallback chain (`weekday/weekend/holiday/all` × `morning/evening/all`).
- **Landing display.** `deriveDisplayRates` now derives a court **"from" price = min window amount** (global windows when present, else all windows) and sets both `morning`/`evening` to it; `paddle`/`ball` still come from `pricing_rules`. No windows + no rental rates → null → `FALLBACK_RATES` (`X-Pricing-Fallback: 1` on `/api/pricing`), i.e. the "rates pending" path.
- **SQL record.** `supabase/pricing-windows.sql` is the copy-runnable record (applied via Supabase MCP after the drizzle migrations). `src/db/schema.ts` gets the matching table for `$inferSelect` types only; the generated `hour_span` and the exclusion constraint exist in SQL only because Drizzle cannot express them. `drizzle/*.sql` is untouched.

**Why:** ADR-11's band-string hack could not be indexed or constrained — two admin saves could create overlapping windows and only the app noticed. A real table gives typed day/hour columns, one generated overlap key, and a DB-level guarantee, with per-weekday windows and amount-only edits.

**Amendment 2026-10-20 — global window scope removed from the app.** Windows are per-court only: `pricingWindowSchema.courtId` is a required uuid, the engine matches only `court_id = slot.courtId` (no global fallback), and the landing "from" price is the min across court windows. The DB still permits `court_id NULL` and keeps its exclusion-constraint sentinel (no migration); the app no longer reads or writes that scope.

## ADR-13 — The operating-hours row carries the rate (added 2026-10-20, supersedes ADR-12)

**Decision:** the court rate lives **directly on the `operating_hours` row**. `pricing_windows` is dropped; there is one source of truth for both when a court is open and what that hour costs.

- **Shape.** `operating_hours = (court_id uuid NOT NULL FK courts, day_of_week 0..6, open_time "HH:MM", close_time "HH:MM", amount numeric(12,2) NULLABLE)`. `close_time <= open_time` wraps midnight. `amount` is the hourly rate for the row's range. `NULL` is the legacy "hours exist, rate not configured yet" state — the engine prices it as `PRICING_NOT_CONFIGURED` (503) naming the day and range until the owner fills it in.
- **Overlap = DB constraint.** A generated stored `span int4range` covers `[open, close)` in minutes, `[open, close+1440)` on a wrap. `operating_hours_no_overlap` is a gist `EXCLUDE` on `(court_id WITH =, day_of_week WITH =, span WITH &&)`. Only `btree_gist` is needed (no `intarray`). Touching rows (06:00–12:00, 12:00–22:00) do not conflict. The API runs the same check first only to return a friendly 409 (`This overlaps Thu 12:00–22:00 — pick a different time.`); PG `23P01` maps to the same 409.
- **Semantics flip: no rows = CLOSED.** Previously a court/day with no hours row meant "open all day" (with a global `court_id NULL` fallback). Now each court owns its rows, there is no global scope, and a weekday with no row for that court is closed. Availability (`isSlotOpen`) and the pricing engine agree.
- **Per-court only.** The old global hours rows were copied onto every court (amount `NULL`) and deleted, then `court_id` was set `NOT NULL`. New courts need their own hours + rates; there is no inherited default.
- **Pricing.** `recalculateTotal` finds the hours row for `(slot.courtId, Manila weekday of the slot start)` whose span contains the start hour (wrap: `hour` or `hour+24`). No row → 503 "not open"; row with `amount NULL` → 503 "no rate configured yet for {day} {range}". The line detail is `{AM/PM range} @ ISO`. Paddle/ball keep the `pricing_rules` band chain unchanged.
- **Edits.** `POST /api/admin/hours` takes `{courtId, dayOfWeek, openTime, closeTime, amount}` in one write; `PATCH /api/admin/hours/[id]` edits amount only; `DELETE /api/admin/hours/[id]` removes the row (and that day's rate). The `/api/admin/pricing/windows/**` routes are gone, as are `listPricingWindows`, `PricingWindow`, `pricingWindowSchema`, `create/update/deletePricingWindow`, and `computeWindowStatus` (no coverage badge).
- **Landing display.** Court "from" price = minimum non-NULL `operating_hours.amount`; zero rows or all-NULL → null → `FALLBACK_RATES` (the existing "rates pending" path).
- **SQL record.** `supabase/hours-rates.sql` is the copy-runnable record (migration `hours_carry_rates`). `supabase/pricing-windows.sql` is kept for history but marked superseded; do not run it after ADR-13. `drizzle/*.sql` is untouched.

**Why:** ADR-12 kept two tables for one concept — an hours row said "open 06:00–12:00" and a separate window said what that range cost, with overlap judged twice (once per weekday in windows, once per range in hours). Attaching the rate to the hours row makes one row the complete answer, lets the overlap constraint cover schedule and price together, and makes "closed" and "no rate" distinct, explicit states instead of implicit fallbacks.

## Build order

Scaffold (Next 16 + Tailwind v4 + shadcn + ADR-10 set) → Schema + constraints → holds/submit transaction → admin auth/invites → upload (signed URLs) → outbox + cron + Gmail smoke test → approve/reject flows + tracking + QR → dashboard + audit → backups doc + Sentry.
