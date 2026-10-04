import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Paddle Culture schema lane — Postgres / Supabase-compatible, ADR-02 + ADR-03.
 *
 * Conventions:
 * - All datetimes are `timestamptz`. App TZ is fixed to `Asia/Manila`
 *   (ADR-03); a `SET timezone = 'Asia/Manila'` preamble is prepended to the
 *   generated migration SQL (see drizzle/ migration file header).
 * - `defaultRandom()` emits `gen_random_uuid()` (pgcrypto — pre-enabled on
 *   Supabase; the migration preamble also runs CREATE EXTENSION IF NOT EXISTS).
 * - Booking lifecycle is Pending → Approved | Rejected ONLY. No Cancelled,
 *   no void, no ref_number (owner-frozen, ADR-02).
 */

// ---------------------------------------------------------------- courts ---
export const courts = pgTable("courts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ------------------------------------------------------- operating_hours ---
// One row per court (or global default when court_id IS NULL) per weekday.
// Overnight ranges (06:00 → 03:00+1d) are handled app-side as datetime
// ranges (ADR-03); selection date = start date. dayOfWeek: 0=Sunday..6=Saturday.
export const operatingHours = pgTable(
  "operating_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courtId: uuid("court_id").references(() => courts.id),
    dayOfWeek: integer("day_of_week").notNull(),
    openTime: time("open_time").notNull(),
    closeTime: time("close_time").notNull(),
  },
  (t) => [
    index("operating_hours_court_day_idx").on(t.courtId, t.dayOfWeek),
    check(
      "operating_hours_day_range_check",
      sql`${t.dayOfWeek} >= 0 AND ${t.dayOfWeek} <= 6`,
    ),
  ],
);

// --------------------------------------------------------------- closures ---
// ADR-02 allows a tstzrange or start/end pair; start/end chosen because
// Drizzle has no range-column type. scope: 'global' | 'court'.
export const closures = pgTable(
  "closures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    courtId: uuid("court_id").references(() => courts.id),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
    by: text("by"),
  },
  (t) => [
    index("closures_court_range_idx").on(t.courtId, t.startAt, t.endAt),
    check("closures_range_check", sql`${t.endAt} > ${t.startAt}`),
  ],
);

// ----------------------------------------------------------- pricing_rules ---
// Precedence (app-side, later lane): court-specific row beats global
// (court_id NULL) row for the same (day_type, time_band, item_type).
export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courtId: uuid("court_id").references(() => courts.id),
    dayType: text("day_type").notNull(),
    timeBand: text("time_band").notNull(),
    itemType: text("item_type").notNull(),
    unit: text("unit").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [index("pricing_rules_lookup_idx").on(t.courtId, t.dayType, t.timeBand, t.itemType)],
);

// ------------------------------------------------------------------ holds ---
export const holds = pgTable(
  "holds",
  {
    holdToken: text("hold_token").primaryKey(),
    courtId: uuid("court_id")
      .notNull()
      .references(() => courts.id),
    slotStart: timestamp("slot_start", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("holds_court_slot_idx").on(t.courtId, t.slotStart)],
);

// --------------------------------------------------------------- bookings ---
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackingToken: text("tracking_token").notNull().unique(),
    status: text("status").notNull().default("Pending"),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    rejectReason: text("reject_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "bookings_status_check",
      sql`${t.status} IN ('Pending', 'Approved', 'Rejected')`,
    ),
  ],
);

// ---------------------------------------------------------- booking_slots ---
// Overlap protection: partial unique index on (court_id, slot_start) for
// rows whose state is still "live". Drizzle expresses this via
// uniqueIndex().on().where() — see generated migration SQL.
export const bookingSlots = pgTable(
  "booking_slots",
  {
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    courtId: uuid("court_id")
      .notNull()
      .references(() => courts.id),
    slotStart: timestamp("slot_start", { withTimezone: true }).notNull(),
    state: text("state").notNull().default("pending"),
  },
  (t) => [
    uniqueIndex("booking_slots_no_overlap_idx")
      .on(t.courtId, t.slotStart)
      .where(sql`${t.state} IN ('held', 'pending', 'approved')`),
    index("booking_slots_booking_idx").on(t.bookingId),
  ],
);

// -------------------------------------------------------- booking_rentals ---
// One row per booking. ball_fee is one-time (not per hour).
export const bookingRentals = pgTable("booking_rentals", {
  bookingId: uuid("booking_id")
    .primaryKey()
    .references(() => bookings.id, { onDelete: "cascade" }),
  paddleQty: integer("paddle_qty").notNull().default(0),
  paddleHours: numeric("paddle_hours", { precision: 12, scale: 2 }),
  ballFee: numeric("ball_fee", { precision: 12, scale: 2 }),
});

// --------------------------------------------------------- payment_proofs ---
// MANDATORY hard submit gate for EVERY booking is enforced app-side in the
// submit transaction (later lane): no proof row = no booking row. One file
// per booking (booking_id PK), immutable (no update path by design).
export const paymentProofs = pgTable("payment_proofs", {
  bookingId: uuid("booking_id")
    .primaryKey()
    .references(() => bookings.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ----------------------------------------------------------- email_outbox ---
// Statuses: pending → sending → sent | retry → failed (dead-letter).
// The */5 cron claims rows via FOR UPDATE SKIP LOCKED (later lane).
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").references(() => bookings.id),
    template: text("template").notNull(),
    toAddr: text("to_addr").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    messageId: text("message_id"),
  },
  (t) => [
    uniqueIndex("email_outbox_claim_idx")
      .on(t.status, t.nextAttemptAt)
      .where(sql`${t.status} IN ('pending', 'retry')`),
  ],
);

// --------------------------------------------------------------- audit_log ---
// Append-only: this module exports NO update/delete helpers, and the table
// is insert+select only by convention. When the Supabase project exists, add
// RLS policies that DENY UPDATE/DELETE (see supabase/ notes in a later lane).
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------------------------------------- admin_invites ---
// Single-use invite rows (ADR-04): no expiry; revoke = delete unused row;
// use stamps used_at. Email immutable after register (app-level guard).
export const adminInvites = pgTable("admin_invites", {
  tokenHash: text("token_hash").primaryKey(),
  createdByAdmin: uuid("created_by_admin"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

// ------------------------------------------------------- idempotency_keys ---
// Duplicate-POST protection for the submit transaction (ADR-03).
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  bookingId: uuid("booking_id").references(() => bookings.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ----------------------------------------------------------------- types ---
export type Court = typeof courts.$inferSelect;
export type OperatingHours = typeof operatingHours.$inferSelect;
export type Closure = typeof closures.$inferSelect;
export type PricingRule = typeof pricingRules.$inferSelect;
export type Hold = typeof holds.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type BookingSlot = typeof bookingSlots.$inferSelect;
export type BookingRental = typeof bookingRentals.$inferSelect;
export type PaymentProof = typeof paymentProofs.$inferSelect;
export type EmailOutbox = typeof emailOutbox.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type AdminInvite = typeof adminInvites.$inferSelect;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
