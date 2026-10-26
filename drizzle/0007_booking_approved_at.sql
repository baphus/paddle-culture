-- Add bookings.approved_at: the instant an admin approved the booking (the
-- payment-verification moment).
--
-- WHY THIS COLUMN EXISTS
-- Finance and the dashboard attributed a booking's revenue to its booking_slots
-- dates (when the customer will play), so a booking made on Oct 26 for Nov 1
-- only appeared in November's revenue. Revenue is cash-basis: it is earned when
-- the customer pays / the admin approves. Nothing recorded that instant —
-- updated_at came closest, but only because nothing else ever updates a booking
-- row. rpc_apply_decision and rpc_admin_create_booking now write it explicitly.
--
-- BACKFILL
-- Every decided booking's updated_at IS its decision time today (rpc_apply_decision
-- is the only bookings UPDATE in the codebase; walk-ins are inserted Approved with
-- updated_at = now()). Rejected and Pending rows stay NULL and are never revenue.

ALTER TABLE "bookings" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint

UPDATE "bookings" SET "approved_at" = "updated_at" WHERE "status" = 'Approved';
