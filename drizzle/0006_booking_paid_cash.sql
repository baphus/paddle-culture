-- Admin walk-in bookings paid at the desk in cash have no payment proof. Flag
-- them so the admin UI can say "paid in cash" instead of "proof unavailable".
-- Default false keeps every existing row and the customer flow unchanged.

ALTER TABLE "bookings" ADD COLUMN "paid_cash" boolean DEFAULT false NOT NULL;
