-- ---------------------------------------------------------------------------
-- Admin hard-delete of a booking.
-- Run in the Supabase SQL editor AFTER supabase/refund.sql and BEFORE
-- supabase/security-lockdown.sql. Safe to re-run.
--
-- Delete is permanent and allowed on any status. Unlike a refund it leaves no
-- booking row at all, so an approved booking's revenue disappears from Finance
-- (they key on status = 'Approved'). The audit row keeps a snapshot of what was
-- removed, since audit_log has no FK to bookings.
--
-- FKs from booking_slots / booking_rentals / payment_proofs cascade, so their
-- rows (and the slot locks) go with the booking. email_outbox and
-- idempotency_keys do NOT cascade — they are removed explicitly first.
-- shortcut: the payment-proof file in Storage is left behind; the existing
-- proof-prune retention cron removes aged objects later.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_delete_booking(
  p_booking_id  uuid,
  p_actor_email text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking
  FROM   bookings
  WHERE  id = p_booking_id
  FOR UPDATE;

  -- Idempotent: a booking deleted twice reports deleted = false, not an error.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('id', p_booking_id, 'deleted', false);
  END IF;

  DELETE FROM email_outbox     WHERE booking_id = p_booking_id;
  DELETE FROM idempotency_keys WHERE booking_id = p_booking_id;

  -- Snapshot first: after the DELETE the row is gone. audit_log deliberately
  -- keeps no FK to bookings, so this record outlives the deletion.
  INSERT INTO audit_log (actor, action, entity, entity_id, before, after)
  VALUES (
    p_actor_email,
    'booking.delete',
    'booking',
    p_booking_id::text,
    jsonb_build_object(
      'status',   v_booking.status,
      'fullName', v_booking.full_name,
      'email',    v_booking.email,
      'phone',    v_booking.phone,
      'total',    v_booking.total,
      'playDate', v_booking.play_date
    ),
    NULL
  );

  DELETE FROM bookings WHERE id = p_booking_id;

  RETURN jsonb_build_object('id', p_booking_id, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION rpc_delete_booking(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_delete_booking(uuid, text) TO service_role;
