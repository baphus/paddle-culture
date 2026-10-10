-- ---------------------------------------------------------------------------
-- RPC functions required by the Supabase-JS migration.
-- Run this once in the Supabase SQL editor (or via supabase db execute).
--
-- These functions move the three transactional paths that cannot be expressed
-- as supabase-js HTTP calls into Postgres functions:
--   1. rpc_submit_booking       — the 18-step SERIALIZABLE submit transaction
--   2. rpc_apply_decision       — approve/reject with outbox + audit
--   3. rpc_claim_outbox_batch   — FOR UPDATE SKIP LOCKED email outbox claim
--   4. rpc_delete_expired_holds — soft retention purge (used by retention cron)
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. rpc_claim_outbox_batch
--    Claims up to p_limit due outbox rows atomically (FOR UPDATE SKIP LOCKED),
--    bumps attempts + sets status='sending', returns the claimed rows.
-- ===========================================================================
CREATE OR REPLACE FUNCTION rpc_claim_outbox_batch(p_limit int DEFAULT 50)
RETURNS TABLE (
  id          uuid,
  template    text,
  to_addr     text,
  payload     jsonb,
  attempts    int,
  booking_id  uuid
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    UPDATE email_outbox AS o
    SET    status   = 'sending',
           attempts = o.attempts + 1
    WHERE  o.id IN (
      SELECT id FROM email_outbox
      WHERE  status IN ('pending', 'retry')
        AND  (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY next_attempt_at NULLS FIRST
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING o.id, o.template, o.to_addr, o.payload, o.attempts, o.booking_id;
END;
$$;

-- ===========================================================================
-- 2. rpc_delete_expired_holds
--    Deletes holds whose expires_at is before the given cutoff.
--    Returns the count of purged rows.
-- ===========================================================================
CREATE OR REPLACE FUNCTION rpc_delete_expired_holds(p_cutoff timestamptz)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  DELETE FROM holds WHERE expires_at < p_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ===========================================================================
-- 3. rpc_apply_decision
--    Approve or reject a booking in one SERIALIZABLE transaction.
--    Returns a JSON object with { id, status, tracking_token, deduped }.
-- ===========================================================================
CREATE OR REPLACE FUNCTION rpc_apply_decision(
  p_booking_id   uuid,
  p_decision     text,          -- 'Approved' | 'Rejected'
  p_actor_email  text,
  p_reason       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_booking        bookings%ROWTYPE;
  v_next_slot_state text;
  v_template       text;
  v_now            timestamptz := now();
BEGIN
  -- SERIALIZABLE for the whole function body
  SET LOCAL transaction_isolation TO 'serializable';

  -- Lock the booking row
  SELECT * INTO v_booking
  FROM   bookings
  WHERE  id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Booking not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: same decision already applied
  IF v_booking.status = p_decision THEN
    RETURN jsonb_build_object(
      'id',             v_booking.id,
      'status',         v_booking.status,
      'tracking_token', v_booking.tracking_token,
      'deduped',        true
    );
  END IF;

  -- Wrong status (already decided the other way)
  IF v_booking.status <> 'Pending' THEN
    RAISE EXCEPTION 'WRONG_STATUS: Booking is already %.', v_booking.status
      USING ERRCODE = 'P0002';
  END IF;

  -- Flip slot state
  v_next_slot_state := CASE WHEN p_decision = 'Approved' THEN 'approved' ELSE 'rejected' END;

  UPDATE bookings
  SET    status        = p_decision,
         reject_reason = CASE WHEN p_decision = 'Rejected' THEN p_reason ELSE NULL END,
         updated_at    = v_now
  WHERE  id = p_booking_id;

  UPDATE booking_slots
  SET    state = v_next_slot_state
  WHERE  booking_id = p_booking_id;

  -- Outbox row
  v_template := CASE WHEN p_decision = 'Approved'
                  THEN 'booking_customer_approved'
                  ELSE 'booking_customer_rejected' END;

  INSERT INTO email_outbox (booking_id, template, to_addr, payload, status, attempts, next_attempt_at)
  SELECT
    v_booking.id,
    v_template,
    v_booking.email,
    jsonb_build_object(
      'trackingToken', v_booking.tracking_token,
      'fullName',      v_booking.full_name,
      'email',         v_booking.email,
      'phone',         v_booking.phone,
      'total',         v_booking.total,
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
    ) ||
    CASE WHEN p_decision = 'Rejected'
      THEN jsonb_build_object('rejectReason', p_reason)
      ELSE '{}'::jsonb
    END,
    'pending',
    0,
    v_now;

  -- Audit row
  INSERT INTO audit_log (actor, action, entity, entity_id, before, after)
  VALUES (
    p_actor_email,
    CASE WHEN p_decision = 'Approved' THEN 'booking.approve' ELSE 'booking.reject' END,
    'booking',
    p_booking_id::text,
    jsonb_build_object('status', 'Pending'),
    jsonb_build_object('status', p_decision) ||
      CASE WHEN p_decision = 'Rejected'
        THEN jsonb_build_object('rejectReason', p_reason)
        ELSE '{}'::jsonb
      END
  );

  RETURN jsonb_build_object(
    'id',             v_booking.id,
    'status',         p_decision,
    'tracking_token', v_booking.tracking_token,
    'deduped',        false
  );
END;
$$;

-- ===========================================================================
-- 4. rpc_submit_booking
--    Full SERIALIZABLE submit transaction.
--    p_slots: [{ court_id, slot_start }]
--    p_rentals: { paddle_qty, paddle_hours, ball }
--    p_proof: { path, mime, bytes }
--    p_customer: { full_name, email, phone }
--    p_hold_tokens: text[]
--    p_idempotency_key: text
--    p_total: text  (server-calculated by recalculateTotal, passed in)
--    p_lines: jsonb (pricing lines, passed in)
--    p_slot_summary: jsonb  ([ { courtId, courtName, slotStart } ])
--    p_tracking_token: text
--    p_tracking_code: text
--    Returns { tracking_token, tracking_code, total, status, deduped, booking_id }
--
-- NOTE: proof-reuse check, clash check, hold validation are done in the
-- caller (route handler) before this RPC is invoked. This function focuses
-- on the atomic write path only.
-- ===========================================================================
CREATE OR REPLACE FUNCTION rpc_submit_booking(
  p_idempotency_key  text,
  p_tracking_token   text,
  p_tracking_code    text,
  p_full_name        text,
  p_email            text,
  p_phone            text,
  p_total            text,
  p_hold_tokens      text[],
  p_slots            jsonb,   -- [{ court_id uuid, slot_start timestamptz }]
  p_paddle_qty       int,
  p_paddle_hours     text,    -- nullable string
  p_ball_fee         text,    -- nullable string
  p_proof_path       text,
  p_proof_mime       text,
  p_proof_bytes      int,
  p_outbox_payload   jsonb,   -- shared payload for customer + owner outbox rows
  p_owner_email      text,
  p_lines            jsonb,
  p_slot_summary     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_booking_id     uuid;
  v_now            timestamptz := now();
  v_claimed_key    text;
  v_prior_bk_id    uuid;
  v_prior_row      bookings%ROWTYPE;
BEGIN
  SET LOCAL transaction_isolation TO 'serializable';

  -- ── Idempotency: first writer wins ──────────────────────────────────────
  INSERT INTO idempotency_keys (key) VALUES (p_idempotency_key)
  ON CONFLICT (key) DO NOTHING
  RETURNING key INTO v_claimed_key;

  IF v_claimed_key IS NULL THEN
    -- Key already exists: return prior result
    SELECT booking_id INTO v_prior_bk_id
    FROM   idempotency_keys
    WHERE  key = p_idempotency_key;

    IF v_prior_bk_id IS NULL THEN
      RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS: A submission with this key is already being processed.'
        USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_prior_row FROM bookings WHERE id = v_prior_bk_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INTERNAL: Prior submission is unreadable.' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
      'tracking_token', v_prior_row.tracking_token,
      'tracking_code',  v_prior_row.tracking_code,
      'total',          v_prior_row.total,
      'status',         v_prior_row.status,
      'booking_id',     v_prior_bk_id,
      'deduped',        true
    );
  END IF;

  -- ── Lazy expiry: drop dead holds ────────────────────────────────────────
  DELETE FROM holds WHERE expires_at <= now();

  -- ── Lock holds FOR UPDATE ───────────────────────────────────────────────
  -- Verify all tokens are present (already validated by caller, but we
  -- lock them here to prevent races).
  PERFORM 1 FROM holds
  WHERE   hold_token = ANY(p_hold_tokens)
  FOR UPDATE;

  IF (SELECT count(*) FROM holds WHERE hold_token = ANY(p_hold_tokens))
     < array_length(p_hold_tokens, 1)
  THEN
    RAISE EXCEPTION 'HOLD_INVALID: One or more holds are missing or expired.'
      USING ERRCODE = 'P0002';
  END IF;

  -- ── Clash check: no live booking_slots rows for the same (court, slot) ──
  IF EXISTS (
    SELECT 1
    FROM   booking_slots bs
    JOIN   (
      SELECT (s->>'court_id')::uuid AS court_id,
             (s->>'slot_start')::timestamptz AS slot_start
      FROM   jsonb_array_elements(p_slots) AS s
    ) req ON bs.court_id = req.court_id AND bs.slot_start = req.slot_start
    WHERE  bs.state IN ('held', 'pending', 'approved')
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'SLOT_TAKEN: A selected slot was just taken.' USING ERRCODE = '23505';
  END IF;

  -- ── Proof reuse check ───────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM payment_proofs WHERE path = p_proof_path FOR UPDATE) THEN
    RAISE EXCEPTION 'PROOF_ALREADY_USED: This payment proof was already used.' USING ERRCODE = 'P0002';
  END IF;

  -- ── Insert booking ───────────────────────────────────────────────────────
  INSERT INTO bookings (tracking_token, tracking_code, status, full_name, email, phone, total)
  VALUES (p_tracking_token, p_tracking_code, 'Pending', p_full_name, p_email, p_phone, p_total::numeric)
  RETURNING id INTO v_booking_id;

  -- ── Insert booking_slots ─────────────────────────────────────────────────
  INSERT INTO booking_slots (booking_id, court_id, slot_start, state)
  SELECT v_booking_id,
         (s->>'court_id')::uuid,
         (s->>'slot_start')::timestamptz,
         'pending'
  FROM   jsonb_array_elements(p_slots) AS s;

  -- ── Insert booking_rentals ───────────────────────────────────────────────
  INSERT INTO booking_rentals (booking_id, paddle_qty, paddle_hours, ball_fee)
  VALUES (
    v_booking_id,
    p_paddle_qty,
    CASE WHEN p_paddle_hours IS NOT NULL THEN p_paddle_hours::numeric ELSE NULL END,
    CASE WHEN p_ball_fee     IS NOT NULL THEN p_ball_fee::numeric     ELSE NULL END
  );

  -- ── Insert payment_proofs ────────────────────────────────────────────────
  INSERT INTO payment_proofs (booking_id, path, mime, bytes)
  VALUES (v_booking_id, p_proof_path, p_proof_mime, p_proof_bytes);

  -- ── Release holds ────────────────────────────────────────────────────────
  DELETE FROM holds WHERE hold_token = ANY(p_hold_tokens);

  -- ── Outbox: customer + owner alert ───────────────────────────────────────
  INSERT INTO email_outbox (booking_id, template, to_addr, payload, status, attempts, next_attempt_at)
  VALUES
    (v_booking_id, 'booking_customer_submitted', p_email,
     p_outbox_payload || jsonb_build_object('lines', p_lines),
     'pending', 0, v_now),
    (v_booking_id, 'booking_owner_alert', p_owner_email,
     p_outbox_payload || jsonb_build_object('lines', p_lines),
     'pending', 0, v_now);

  -- ── Audit row ────────────────────────────────────────────────────────────
  INSERT INTO audit_log (actor, action, entity, entity_id, after)
  VALUES (
    p_email,
    'booking.submit',
    'booking',
    v_booking_id::text,
    jsonb_build_object(
      'trackingToken', p_tracking_token,
      'trackingCode',  p_tracking_code,
      'total',         p_total,
      'status',        'Pending',
      'slots',         p_slot_summary
    )
  );

  -- ── Stamp idempotency key with booking_id ─────────────────────────────────
  UPDATE idempotency_keys SET booking_id = v_booking_id WHERE key = p_idempotency_key;

  RETURN jsonb_build_object(
    'tracking_token', p_tracking_token,
    'tracking_code',  p_tracking_code,
    'total',          p_total,
    'status',         'Pending',
    'booking_id',     v_booking_id,
    'deduped',        false
  );
END;
$$;
