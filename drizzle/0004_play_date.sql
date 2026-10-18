-- Add bookings.play_date: the Manila *selection* date the customer booked
-- (YYYY-MM-DD), i.e. the day whose 06:00→03:00+1d grid the slots came from.
--
-- WHY THIS COLUMN EXISTS
-- Before it, the Play Date was re-derived on every surface from the earliest
-- booking_slots.slot_start. That instant is UTC, so a 06:00 Manila start
-- serializes as `...T22:00:00Z` on the *previous* UTC day, and the tracking
-- page rendered exactly that ("booked Oct 19, tracking says Oct 18" — the
-- production report). Deriving a civil date from an instant invites that bug
-- once per consumer; storing it makes the booking's day a fact.
--
-- The value is a *selection* date, not the slot's wall-clock date: slots
-- 00:00–02:00 sit on the next wall-clock day but belong to the previous
-- selection day, and the customer must see the day they picked.
--
-- Manila is a fixed UTC+8 with no DST, so the expression below is exact and
-- the `- interval '6 hours'` step is what folds the overnight tail back.

ALTER TABLE "bookings" ADD COLUMN "play_date" date;--> statement-breakpoint

-- Backfill existing rows from their earliest slot. Same rule as
-- src/lib/booking/slots.ts slotSelectionDateStr(): take the minimum
-- slot_start instant, shift to Manila, and anything before 06:00 belongs to
-- the previous selection day.
UPDATE "bookings" b
SET "play_date" = sub.selection_date
FROM (
  SELECT bs.booking_id,
         (
           (min(bs.slot_start) AT TIME ZONE 'Asia/Manila')
           - CASE WHEN (min(bs.slot_start) AT TIME ZONE 'Asia/Manila')::time < TIME '06:00'
                  THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END
         )::date AS selection_date
  FROM   booking_slots bs
  GROUP  BY bs.booking_id
) sub
WHERE b.id = sub.booking_id
  AND b.play_date IS NULL;--> statement-breakpoint

-- Slotless bookings (should not exist) fall back to their creation day in
-- Manila rather than staying NULL, so the column can be enforced below.
UPDATE "bookings"
SET "play_date" = (created_at AT TIME ZONE 'Asia/Manila')::date
WHERE "play_date" IS NULL;--> statement-breakpoint

ALTER TABLE "bookings" ALTER COLUMN "play_date" SET NOT NULL;--> statement-breakpoint

-- Dashboard/booking-list date filters and ranges read this directly.
CREATE INDEX "bookings_play_date_idx" ON "bookings" ("play_date");
