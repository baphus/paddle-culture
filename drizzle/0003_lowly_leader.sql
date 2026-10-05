-- Add tracking_code: nullable first, backfill existing rows, then enforce NOT NULL + UNIQUE.
ALTER TABLE "bookings" ADD COLUMN "tracking_code" text;--> statement-breakpoint
UPDATE "bookings"
  SET "tracking_code" = upper(substring(encode(gen_random_bytes(4), 'hex'), 1, 5))
  WHERE "tracking_code" IS NULL;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "tracking_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tracking_code_unique" UNIQUE("tracking_code");
