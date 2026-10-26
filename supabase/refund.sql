-- ---------------------------------------------------------------------------
-- Admin refund.
-- Run in the Supabase SQL editor AFTER supabase/rpc-functions.sql and BEFORE
-- supabase/security-lockdown.sql. Safe to re-run.
--
-- A refund is a terminal status ('Refunded') reachable only from 'Approved'.
-- Finance, revenue, and the dashboard all count `status = 'Approved'`, so a
-- refunded booking drops out of every report with no query changes. Refunding
-- also releases the court slots (state 'rejected' is not in the live set of
-- booking_slots_no_overlap_idx), so the hours can be re-booked.
-- ---------------------------------------------------------------------------

-- Optional admin note explaining the refund. Reused by the customer email.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_reason text;

-- Widen the lifecycle constraint. Drop-then-add (no IF NOT EXISTS for checks
-- before PG 16), so a re-run swaps the same definition in place.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Refunded'));

-- ===========================================================================
-- rpc_refund_booking
--    Approved -> Refunded in one transaction: status + note, slot release,
--    refund email outbox row, audit row. Idempotent: refunding twice returns
--    the current state with deduped = true and sends no second email.
-- ===========================================================================
CREATE OR REPLACE FUNCTION rpc_refund_booking(
  p_booking_id  uuid,
  p_actor_email text,
  p_reason      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_now     timestamptz := now();
BEGIN
  SELECT * INTO v_booking
  FROM   bookings
  WHERE  id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Booking not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.status = 'Refunded' THEN
    RETURN jsonb_build_object(
      'id',             v_booking.id,
      'status',         v_booking.status,
      'tracking_token', v_booking.tracking_token,
      'deduped',        true
    );
  END IF;

  -- Only collected money can be refunded. Pending/Rejected never paid (or were
  -- already released), so this is a hard gate, not a UI nicety.
  IF v_booking.status <> 'Approved' THEN
    RAISE EXCEPTION 'WRONG_STATUS: Only approved bookings can be refunded (current: %).', v_booking.status
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE bookings
  SET    status        = 'Refunded',
         refund_reason = p_reason,
         updated_at    = v_now
  WHERE  id = p_booking_id;

  -- 'rejected' is outside the live set of booking_slots_no_overlap_idx, so the
  -- slots become bookable again. Same state a reject uses.
  UPDATE booking_slots
  SET    state = 'rejected'
  WHERE  booking_id = p_booking_id;

  INSERT INTO email_outbox (booking_id, template, to_addr, payload, status, attempts, next_attempt_at)
  SELECT
    v_booking.id,
    'booking_customer_refunded',
    v_booking.email,
    jsonb_build_object(
      'trackingToken', v_booking.tracking_token,
      'fullName',      v_booking.full_name,
      'email',         v_booking.email,
      'phone',         v_booking.phone,
      'total',         v_booking.total,
      'refundReason',  p_reason,
      'slots', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'courtId',   bs.court_id,
            'courtName', c.name,
            'slotStart', bs.slot_start
          ) ORDER BY bs.slot_start
        )
        FROM   booking_slots bs
        JOIN   courts c ON c.id = bs.court_id
        WHERE  bs.booking_id = p_booking_id
      )
    ),
    'pending',
    0,
    v_now;

  INSERT INTO audit_log (actor, action, entity, entity_id, before, after)
  VALUES (
    p_actor_email,
    'booking.refund',
    'booking',
    p_booking_id::text,
    jsonb_build_object('status', 'Approved'),
    jsonb_build_object('status', 'Refunded') ||
      CASE WHEN p_reason IS NOT NULL AND p_reason <> ''
        THEN jsonb_build_object('refundReason', p_reason)
        ELSE '{}'::jsonb
      END
  );

  RETURN jsonb_build_object(
    'id',             v_booking.id,
    'status',         'Refunded',
    'tracking_token', v_booking.tracking_token,
    'deduped',        false
  );
END;
$$;

REVOKE ALL ON FUNCTION rpc_refund_booking(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_refund_booking(uuid, text, text) TO service_role;
