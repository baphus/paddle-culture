-- Schema-lane preamble (ADR-03): all times timestamptz, app TZ Asia/Manila.
SET timezone = 'Asia/Manila';
--> statement-breakpoint
-- gen_random_uuid() PK defaults need pgcrypto (pre-enabled on Supabase).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TABLE "admin_invites" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"created_by_admin" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_rentals" (
	"booking_id" uuid PRIMARY KEY NOT NULL,
	"paddle_qty" integer DEFAULT 0 NOT NULL,
	"paddle_hours" numeric(12, 2),
	"ball_fee" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "booking_slots" (
	"booking_id" uuid NOT NULL,
	"court_id" uuid NOT NULL,
	"slot_start" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracking_token" text NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_tracking_token_unique" UNIQUE("tracking_token"),
	CONSTRAINT "bookings_status_check" CHECK ("bookings"."status" IN ('Pending', 'Approved', 'Rejected'))
);
--> statement-breakpoint
CREATE TABLE "closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"court_id" uuid,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"reason" text,
	"by" text,
	CONSTRAINT "closures_range_check" CHECK ("closures"."end_at" > "closures"."start_at")
);
--> statement-breakpoint
CREATE TABLE "courts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"template" text NOT NULL,
	"to_addr" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"message_id" text
);
--> statement-breakpoint
CREATE TABLE "holds" (
	"hold_token" text PRIMARY KEY NOT NULL,
	"court_id" uuid NOT NULL,
	"slot_start" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"booking_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operating_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"court_id" uuid,
	"day_of_week" integer NOT NULL,
	"open_time" time NOT NULL,
	"close_time" time NOT NULL,
	CONSTRAINT "operating_hours_day_range_check" CHECK ("operating_hours"."day_of_week" >= 0 AND "operating_hours"."day_of_week" <= 6)
);
--> statement-breakpoint
CREATE TABLE "payment_proofs" (
	"booking_id" uuid PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"court_id" uuid,
	"day_type" text NOT NULL,
	"time_band" text NOT NULL,
	"item_type" text NOT NULL,
	"unit" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_rentals" ADD CONSTRAINT "booking_rentals_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closures" ADD CONSTRAINT "closures_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_hours" ADD CONSTRAINT "operating_hours_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_slots_no_overlap_idx" ON "booking_slots" USING btree ("court_id","slot_start") WHERE "booking_slots"."state" IN ('held', 'pending', 'approved');--> statement-breakpoint
CREATE INDEX "booking_slots_booking_idx" ON "booking_slots" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "closures_court_range_idx" ON "closures" USING btree ("court_id","start_at","end_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_outbox_claim_idx" ON "email_outbox" USING btree ("status","next_attempt_at") WHERE "email_outbox"."status" IN ('pending', 'retry');--> statement-breakpoint
CREATE INDEX "holds_court_slot_idx" ON "holds" USING btree ("court_id","slot_start");--> statement-breakpoint
CREATE INDEX "operating_hours_court_day_idx" ON "operating_hours" USING btree ("court_id","day_of_week");--> statement-breakpoint
CREATE INDEX "pricing_rules_lookup_idx" ON "pricing_rules" USING btree ("court_id","day_type","time_band","item_type");