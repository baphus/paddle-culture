-- ---------------------------------------------------------------------------
-- RPC functions required by the Supabase-JS migration.
-- Run this once in the Supabase SQL editor (or via supabase db execute).
--
-- These functions move the three transactional paths that cannot be expressed
-- as supabase-js HTTP calls into Postgres functions:
--   1. rpc_submit_booking       — the 18-step atomic submit transaction
--                              (READ COMMITTED + row locks + unique indexes)
--   2. rpc_apply_decision       — approve/reject with outbox + audit
--   3. rpc_claim_outbox_batch   — FOR UPDATE SKIP LOCKED email outbox claim
--   4. rpc_delete_expired_holds – soft retention purge (used by retention cron)
--   5. rpc_delete_expired_proofs – 90-day payment-proof prune (proof-prune cron)
--   6. rpc_admin_create_booking – admin walk-in / phone booking, born approved
--
-- The index at the bottom of this file (holds_live_unique_idx) is the one
-- other piece of schema this app depends on: without it two customers can
-- hold the same (court, slot) and only discover the clash at submit time.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- rpc_replace_court_hours
--    Atomically replaces a court's entire weekly operating-hours schedule.
--    Days omitted from p_days become closed. Called only by the admin API.
-- ===========================================================================
CREATE OR REPLACE FUNCTION rpc_replace_court_hours(
  p_court_id uuid,
  p_days int[],
  p_open_time time,
  p_close_time time,
  p_amount numeric,
  p_actor_email text
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before jsonb;
  v_count int;
BEGIN
  PERFORM 1 FROM courts WHERE id = p_court_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Court not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_days IS NULL OR cardinality(p_days) < 1 OR cardinality(p_days) > 7
     OR EXISTS (SELECT 1 FROM unnest(p_days) AS days(day) WHERE day < 0 OR day > 6)
     OR (SELECT count(*) FROM unnest(p_days) AS days(day)) <> (SELECT count(DISTINCT day) FROM unnest(p_days) AS days(day))
     OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid court hours setup' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'dayOfWeek', day_of_week, 'openTime', open_time,
    'closeTime', close_time, 'amount', amount
  )), '[]'::jsonb)
  INTO v_before
  FROM operating_hours WHERE court_id = p_court_id;

  DELETE FROM operating_hours WHERE court_id = p_court_id;
  INSERT INTO operating_hours (court_id, day_of_week, open_time, close_time, amount)
  SELECT p_court_id, day, p_open_time, p_close_time, p_amount
  FROM unnest(p_days) AS days(day);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO audit_log (actor, action, entity, entity_id, before, after)
  VALUES (
    p_actor_email, 'hours.quick_setup', 'court', p_court_id::text, v_before,
    jsonb_build_object(
      'days', to_jsonb(p_days), 'openTime', p_open_time,
      'closeTime', p_close_time, 'amount', p_amount
    )
  );
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION rpc_replace_court_hours(uuid, int[], time, time, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_replace_court_hours(uuid, int[], time, time, numeric, text) TO service_role;

-- ===========================================================================
-- rpc_add_court_hours
--    Adds ranges to selected weekdays, replacing overlaps only after confirmation.
-- ===========================================================================
CREATE OR REPLACE FUNCTION rpc_add_court_hours(
  p_court_id uuid,
  p_days int[],
  p_open_time time,
  p_close_time time,
  p_amount numeric,
  p_confirm_overwrite boolean,
  p_actor_email text
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
SET datestyle = 'ISO, MDY'
AS $$
DECLARE
  v_conflicts jsonb;
  v_before jsonb;
  v_span int4range;
  v_count int;
BEGIN
  v_span := int4range(
    (extract(epoch FROM p_open_time) / 60)::int,
    (extract(epoch FROM p_close_time) / 60)::int
      + CASE WHEN p_close_time > p_open_time THEN 0 ELSE 1440 END
  );
  PERFORM 1 FROM courts WHERE id = p_court_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Court not found' USING ERRCODE = 'P0002'; END IF;
  IF p_days IS NULL OR cardinality(p_days) < 1 OR cardinality(p_days) > 7
     OR EXISTS (SELECT 1 FROM unnest(p_days) d(day) WHERE day < 0 OR day > 6)
     OR (SELECT count(*) FROM unnest(p_days)) <> (SELECT count(DISTINCT day) FROM unnest(p_days) d(day))
     OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid court hours setup' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(format('%s %s–%s (₱%s)',
    CASE day_of_week WHEN 0 THEN 'Sunday' WHEN 1 THEN 'Monday' WHEN 2 THEN 'Tuesday'
      WHEN 3 THEN 'Wednesday' WHEN 4 THEN 'Thursday' WHEN 5 THEN 'Friday' ELSE 'Saturday' END,
    to_char(open_time, 'HH12:MI AM'), to_char(close_time, 'HH12:MI AM'), amount
  )), '[]'::jsonb)
  INTO v_conflicts
  FROM operating_hours existing
  WHERE court_id = p_court_id AND day_of_week = ANY(p_days)
    AND existing.span && v_span;

  IF jsonb_array_length(v_conflicts) > 0 AND NOT p_confirm_overwrite THEN
    RAISE EXCEPTION 'HOURS_OVERLAP:%', v_conflicts::text;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(h)), '[]'::jsonb) INTO v_before
  FROM operating_hours h WHERE court_id = p_court_id AND day_of_week = ANY(p_days)
    AND h.span && v_span;

  DELETE FROM operating_hours h WHERE court_id = p_court_id AND day_of_week = ANY(p_days)
    AND h.span && v_span;
  INSERT INTO operating_hours (court_id, day_of_week, open_time, close_time, amount)
  SELECT p_court_id, day, p_open_time, p_close_time, p_amount FROM unnest(p_days) d(day);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO audit_log (actor, action, entity, entity_id, before, after)
  VALUES (p_actor_email, 'hours.quick_setup', 'court', p_court_id::text, v_before,
    jsonb_build_object('days', to_jsonb(p_days), 'openTime', p_open_time, 'closeTime', p_close_time, 'amount', p_amount));
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION rpc_add_court_hours(uuid, int[], time, time, numeric, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rpc_add_court_hours(uuid, int[], time, time, numeric, boolean, text) TO service_role;

-- ===========================================================================
-- 1. rpc_claim_outbox_batch
--    Claims up to p_limit due outbox rows atomically (FOR UPDATE SKIP LOCKED),
--    bumps attempts + sets status='sending', returns the claimed rows.
--
--    p_booking_id (optional) narrows the claim to one booking's rows. The
--    submit route drains inline with a 5s budget before answering the
--    customer; without this filter it claimed up to 50 rows belonging to
--    OTHER customers and sent them serially (~5s each on a cold instance),
--    so the 2nd booking in a burst already timed out and everyone after it
--    waited behind a queue. NULL (the cron/backstop case) keeps the old
--    behaviour of claiming anything due.
-- ===========================================================================
-- DROP THE OLD ARITY FIRST. `CREATE OR REPLACE` with a different argument
-- list does not replace anything — it creates an OVERLOAD. Leaving the old
-- one-argument function in place is a silent disaster: PostgREST resolves a
-- 2-arg call like `{p_limit, p_booking_id}` to the OLD 1-arg function and
-- silently ignores p_booking_id (so the unscoped claim comes back), and it
-- stays anonymous-callable with its original PUBLIC grant. Dropping it makes
-- the path unambiguous. Safe to re-run: IF EXISTS.
DROP FUNCTION IF EXISTS rpc_claim_outbox_batch(int);

CREATE OR REPLACE FUNCTION rpc_claim_outbox_batch(
  p_limit      int  DEFAULT 50,
  p_booking_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  template    text,
  to_addr     text,
  payload     jsonb,
  attempts    int,
  booking_id  uuid
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Reclaim rows stranded in 'sending'. A process that dies mid-batch (Vercel
  -- timeout, deploy, OOM) leaves its claims in 'sending' forever, because the
  -- claim below only looks at 'pending'/'retry'. Those emails never sent and
  -- nothing would ever retry them. 15 minutes is far longer than any single
  -- batch, so a genuinely in-flight claim is never stolen.
  UPDATE email_outbox
  SET    status   = 'retry',
         next_attempt_at = now()
  WHERE  status = 'sending'
    AND  claimed_at < now() - interval '15 minutes';

  RETURN QUERY
    UPDATE email_outbox AS o
    SET    status   = 'sending',
           attempts = o.attempts + 1,
           claimed_at = now()
    WHERE  o.id IN (
      SELECT inner_o.id FROM email_outbox AS inner_o
      WHERE  inner_o.status IN ('pending', 'retry')
        AND  (inner_o.next_attempt_at IS NULL OR inner_o.next_attempt_at <= now())
        AND  (p_booking_id IS NULL OR inner_o.booking_id = p_booking_id)
      ORDER BY inner_o.next_attempt_at NULLS FIRST
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
SET search_path = public, pg_temp
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
-- 2b. rpc_reclaim_holds
--     Atomically revive an owner's expired holds (ADR-03 amendment).
--
--     The JS path in hold-owner.ts checks availability, clashes, and closures
--     and then does DELETE-then-INSERT as two separate HTTP statements. Two
--     statements means a window where the hold is gone: a concurrent submit's
--     FOR UPDATE, or another session's insert for the same slot, can slip
--     between them. This function does the swap in one transaction.
--
--     It is deliberately *not* a re-implementation of the whole eligibility
--     ladder — the caller (reclaimHolds) still owns availability, closures,
--     and the "is this inside the grace window" rule, because those need
--     reads of other tables and the availability engine. This function only
--     performs the atomic row swap for a set the caller has already proven
--     eligible. It re-checks the one thing that must never be raced: the
--     (court_id, slot_start) unique index.
--
--     p_owner_token: the owner capability minted in the browser.
--     p_pairs: jsonb [{ court_id uuid, slot_start timestamptz }]
--     p_expires_at: the new deadline (caller computes now + TTL)
--     p_new_tokens: text[]  — one fresh token per pair, in the same order.
--     Returns the inserted rows.
-- ===========================================================================
CREATE OR REPLACE FUNCTION rpc_reclaim_holds(
  p_owner_token text,
  p_pairs       jsonb,
  p_expires_at  timestamptz,
  p_new_tokens  text[]
)
RETURNS TABLE (hold_token text, court_id uuid, slot_start timestamptz, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pair_count int := jsonb_array_length(p_pairs);
BEGIN
  IF v_pair_count = 0 THEN
    RAISE EXCEPTION 'RECLAIM_EMPTY: No pairs to reclaim.' USING ERRCODE = 'P0002';
  END IF;
  IF array_length(p_new_tokens, 1) <> v_pair_count THEN
    RAISE EXCEPTION 'RECLAIM_ARITY: Token/pair count mismatch.' USING ERRCODE = 'P0002';
  END IF;

  -- Drop this owner's dead rows for exactly these pairs. Scoped by owner_token
  -- AND the pair, so a row another session revived for the same slot under a
  -- different owner is never touched here.
  DELETE FROM holds h
  USING  (SELECT (p->>'court_id')::uuid AS court_id,
                 (p->>'slot_start')::timestamptz AS slot_start
          FROM   jsonb_array_elements(p_pairs) AS p) AS req
  WHERE  h.owner_token = p_owner_token
    AND  h.court_id   = req.court_id
    AND  h.slot_start = req.slot_start
    AND  h.expires_at <= now();

  -- Re-check live bookings INSIDE this transaction. The app checks before
  -- calling here, but between that check and this insert another session can
  -- take the slot (a submit, or an admin walk-in). Without this lock the first
  -- commit wins and this caller is handed a hold on an already-booked slot.
  -- FOR UPDATE blocks a concurrent submit's clash read until we commit.
  PERFORM 1
  FROM   booking_slots bs
  JOIN   (SELECT (p->>'court_id')::uuid          AS court_id,
                 (p->>'slot_start')::timestamptz AS slot_start
          FROM   jsonb_array_elements(p_pairs) AS p) req
         ON bs.court_id = req.court_id AND bs.slot_start = req.slot_start
  WHERE  bs.state IN ('held', 'pending', 'approved')
  FOR UPDATE OF bs;
  IF FOUND THEN
    RAISE EXCEPTION 'SLOT_TAKEN: That slot was just taken.' USING ERRCODE = '23505';
  END IF;

  -- Insert the fresh rows. holds_court_slot_unique_idx arbitrates a race with
  -- another session; a 23505 here is surfaced to the caller as SLOT_TAKEN.
  INSERT INTO holds (hold_token, court_id, slot_start, expires_at, owner_token)
  SELECT t.token,
         (p->>'court_id')::uuid,
         (p->>'slot_start')::timestamptz,
         p_expires_at,
         p_owner_token
  FROM   jsonb_array_elements(p_pairs) WITH ORDINALITY AS p(p, ord)
  JOIN   unnest(p_new_tokens) WITH ORDINALITY AS t(token, ord) ON t.ord = p.ord;

  RETURN QUERY
    SELECT h.hold_token, h.court_id, h.slot_start, h.expires_at
    FROM   holds h
    WHERE  h.owner_token = p_owner_token
      AND  h.hold_token = ANY(p_new_tokens);
END;
$$;

-- ===========================================================================
-- 3. rpc_apply_decision
--    Approve or reject a booking in one atomic transaction.
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking        bookings%ROWTYPE;
  v_next_slot_state text;
  v_template       text;
  v_now            timestamptz := now();
BEGIN
  -- Note: SET LOCAL transaction_isolation removed — PostgREST already has a
  -- query running before the function body, so SET TRANSACTION fails with
  -- 25001. The partial unique index on booking_slots enforces overlap
  -- safety; FOR UPDATE below handles the double-decision race.

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
         approved_at   = CASE WHEN p_decision = 'Approved' THEN v_now END,
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
--    Atomic submit transaction (READ COMMITTED + row locks + unique indexes).
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking_id     uuid;
  v_now            timestamptz := now();
  v_claimed_key    text;
  v_prior_bk_id    uuid;
  v_prior_row      bookings%ROWTYPE;
BEGIN
  -- Note: SET LOCAL transaction_isolation removed — see rpc_apply_decision.

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

  -- ── Lazy expiry: drop dead holds *in this token set* ────────────────────
  -- Scoped, not blanket: a concurrent reclaimHolds in another session can
  -- revive rows for this same owner_token, and a table-wide DELETE would
  -- wipe that revival before our FOR UPDATE runs. The weekly cron handles
  -- abandoned holds; this only clears the tokens the caller already named
  -- so the count + lock below sees the rows exactly as the caller expects.
  DELETE FROM holds
  WHERE  hold_token = ANY(p_hold_tokens)
    AND  expires_at <= now();

  -- ── Lock holds FOR UPDATE (expiry re-check) ───────────────────────────
  -- Verify all tokens are present AND still live (already validated by
  -- caller, but we lock them here to prevent races and re-check expiry so
  -- a row that expired between the route's read and this RPC is rejected).
  PERFORM 1 FROM holds
  WHERE   hold_token = ANY(p_hold_tokens)
    AND   expires_at > now()
  FOR UPDATE;

  IF (SELECT count(*) FROM holds
      WHERE hold_token = ANY(p_hold_tokens)
        AND expires_at > now())
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
  -- play_date is computed here, once, from the requested slots: the business
  -- day of the earliest instant. A business day is anchored at 07:00 Manila
  -- and runs to 06:59 next calendar date, so a slot at 00:00–06:59 stays on
  -- the day the customer selected. Storing it stops
  -- every consumer from re-deriving a civil date out of a UTC instant — that
  -- re-derivation is what showed customers the wrong Play Date.
  INSERT INTO bookings (tracking_token, tracking_code, status, full_name, email, phone, total, play_date)
  SELECT p_tracking_token, p_tracking_code, 'Pending', p_full_name, p_email, p_phone, p_total::numeric,
         -- date - 1 when the earliest slot is 00:00–06:59 Manila (overnight
         -- tail); date - 0 otherwise. Matches selectionDateStr() in slots.ts.
         ((min((s->>'slot_start')::timestamptz) AT TIME ZONE 'Asia/Manila')::date
          - CASE WHEN (min((s->>'slot_start')::timestamptz) AT TIME ZONE 'Asia/Manila')::time < time '07:00' THEN 1 ELSE 0 END)
  FROM   jsonb_array_elements(p_slots) AS s
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


-- ===========================================================================
-- 5. holds_court_slot_unique_idx — one hold per (court, slot)
--
-- The problem:  holds is a soft reservation table. Two customers holding the
-- same (court_id, slot_start) both pass the availability check and only one
-- wins the booking_slots_no_overlap_idx insert at submit time; the loser gets
-- SLOT_TAKEN after typing all their details and uploading a proof.
--
-- A unique index moves the clash to hold time, which is where the UI can say
-- "that slot just went". POST /api/holds maps this violation to 409.
--
-- Why it is NOT partial:  the tempting rule is "only live holds clash",
-- WHERE expires_at > now(). Postgres rejects it outright (index predicates
-- must be IMMUTABLE, now() is STABLE), and wrapping now() in a function
-- marked IMMUTABLE would be a lie the planner is allowed to act on. More
-- importantly it would not have worked: a partial predicate is tested when a
-- row is written and never re-tested, so an expired row keeps its index entry
-- and keeps blocking. Expiry only stops blocking because the row is deleted.
-- Plain UNIQUE is therefore the same rule, minus the lie.
--
-- So an expired hold still blocks its slot until a DELETE reaches it. Three
-- things do that: rpc_submit_booking purges the expired rows in the submitted
-- token set (see the "scoped lazy expiry" step), rpc_delete_expired_holds
-- runs weekly, and POST /api/holds deletes the expired rows for the pairs it
-- is about to insert. Without that last step an abandoned hold could pin a
-- slot for a week. Keep them in sync.
-- ===========================================================================
CREATE UNIQUE INDEX IF NOT EXISTS holds_court_slot_unique_idx
  ON holds (court_id, slot_start);

-- The Drizzle migration created a non-unique index on the same two columns
-- (holds_court_slot_idx). The unique one answers every query it did — court_id
-- is its leftmost prefix — so drop the duplicate instead of paying for it on
-- every hold insert/delete. If the statement above failed with 23505 on an
-- older install, run the dedupe DELETE below first, then re-run this file.
DROP INDEX IF EXISTS holds_court_slot_idx;

-- Pre-existing installs may already hold duplicates; the statement below
-- clears them so the index can be created. Re-run once after deploying if
-- creation fails with 23505 (it is idempotent afterwards).
--   DELETE FROM holds a USING holds b
--   WHERE a.ctid < b.ctid
--     AND a.court_id = b.court_id
--     AND a.slot_start = b.slot_start;


-- ===========================================================================
-- 6. holds_expires_at_idx + payment_proofs_path_uniq — the two scans
--
-- holds_expires_at_idx:  the unique index above cannot answer an expiry scan
-- (expires_at is not in it), so both purge paths read the whole holds table:
-- rpc_delete_expired_holds (DELETE ... WHERE expires_at < p_cutoff) and the
-- scoped-expiry step in rpc_submit_booking (DELETE ... WHERE hold_token =
-- ANY(p_hold_tokens) AND expires_at <= now()).
--
-- payment_proofs_path_uniq:  the proof-reuse check in rpc_submit_booking
-- (SELECT 1 FROM payment_proofs WHERE path = p_proof_path FOR UPDATE) needs a
-- *unique* index so two concurrent submits of the same path cannot both pass
-- the check at READ COMMITTED. The FOR UPDATE only locks rows that already
-- exist; without uniqueness the second INSERT still succeeds. A unique index
-- turns the second INSERT into a 23505 that the route maps to
-- PROOF_ALREADY_USED. One proof path → one booking, enforced at the DB.
--
-- holds_expires_at_idx is plain, non-unique: many holds share an expiry.
-- ===========================================================================
CREATE INDEX IF NOT EXISTS holds_expires_at_idx ON holds (expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS payment_proofs_path_uniq ON payment_proofs (path);
-- The Drizzle migration created a non-unique index on the same column
-- (payment_proofs_path_idx). The unique one answers every query it did, so
-- drop the duplicate instead of paying for it on every proof insert.
DROP INDEX IF EXISTS payment_proofs_path_idx;


-- ===========================================================================
-- 6b. holds.owner_token — hold reclaim after a refresh (ADR-03 amendment)
--
-- Every bit of booking-wizard state used to live only in React memory, and a
-- hold row carried no owner. So a customer who left the page for their banking
-- app and came back to a reload landed on step 1 with everything gone: their
-- hold tokens were lost with the page, the slots stayed 'held' (blocked for
-- everyone else) until expiry, and /api/proofs/upload-url + /api/submit both
-- refused to work without live tokens — leaving a customer who had already
-- paid with no way to deliver the proof.
--
-- owner_token is a browser-session capability (crypto.randomUUID) stamped on
-- every row a session creates. It is NOT an identity: nothing about the person
-- is stored with it, and it never widens who may book a slot — every write
-- path still re-validates availability and holds_court_slot_unique_idx still
-- arbitrates the insert. It only widens who can *name* a hold row, which is
-- what POST /api/holds/reclaim needs.
--
-- Reclaim rules (src/lib/booking/hold-owner.ts):
--   live     -> push expires_at out to a full HOLD_TTL_MINUTES
--   expired  -> re-insert the same (court, slot) pairs, but only inside
--               HOLD_GRACE_MINUTES of expiry and only if every pair is still
--               free. Past that the slots are genuinely released.
-- The grace window bounds how long a paid-but-unsubmitted booking can pin
-- inventory: HOLD_TTL_MINUTES + HOLD_GRACE_MINUTES = 40 minutes worst case.
--
-- Nullable on purpose: rows written before this column existed simply have no
-- reclaim path and keep the old TTL behaviour.
-- ===========================================================================
ALTER TABLE holds ADD COLUMN IF NOT EXISTS owner_token text;

-- Reclaim looks rows up by owner token alone (the browser holds no row ids).
-- Partial: only rows that actually carry a token are ever searchable, and the
-- majority of recent rows do, so the index stays useful without carrying the
-- legacy NULL rows.
CREATE INDEX IF NOT EXISTS holds_owner_token_idx
  ON holds (owner_token)
  WHERE owner_token IS NOT NULL;


-- ===========================================================================
-- 6b. pricing_rules guards — money correctness
--
-- The runtime reads the whole table and picks the first matching rule. That is
-- safe against a non-numeric amount (the column is numeric(12,2) NOT NULL), but
-- two things it cannot guard against are (a) an amount of 0 or below, which
-- silently prices a slot at nothing, and (b) two rules for the same
-- (court_id, day_type, time_band, item_type) key — the *first* one wins by
-- table order, so a newer edit inserted as a new row can be shadowed by an
-- older one. These two constraints close both.
--
-- NULLS NOT DISTINCT (Postgres 15+) makes the unique index also treat the
-- global rows (court_id IS NULL) as one key, so there can be exactly one
-- global rule per (day_type, time_band, item_type). On PG14 or older, replace
-- the index with a COALESCE expression index on a sentinel uuid.
-- ===========================================================================
-- Idempotent: this file is re-run in full against the live database, so a bare
-- ADD CONSTRAINT would fail with 42710 on every run after the first. Postgres
-- has no ADD CONSTRAINT IF NOT EXISTS, hence the catalog guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pricing_rules_amount_positive'
      AND conrelid = 'pricing_rules'::regclass
  ) THEN
    ALTER TABLE pricing_rules
      ADD CONSTRAINT pricing_rules_amount_positive CHECK (amount > 0);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_key_uniq
  ON pricing_rules (court_id, day_type, time_band, item_type) NULLS NOT DISTINCT;


-- ===========================================================================
-- 7. rpc_delete_expired_proofs
--    90-day payment-proof prune, called by the proof-prune cron
--    (vercel.json: /api/cron/proof-prune, 1st of the month 03:00 UTC).
--
--    Deletes payment_proofs rows uploaded before the cutoff and returns their
--    storage paths in one row, so the caller can remove the matching objects
--    from the private `proofs` bucket (same two-store rule as the holds purge:
--    the DB row goes first — an object without a row is invisible to the app).
--
--    Nothing references payment_proofs (it is the child of bookings via the
--    booking_id PK / ON DELETE CASCADE), so unlike a bookings delete this can
--    never be blocked by email_outbox or idempotency_keys FKs.
--
--    A proof whose booking is still 'Pending' is NOT pruned: a submission
--    undecided for 90 days is still in the admin queue, and deleting its
--    screenshot removes the evidence the owner needs to decide. Approved /
--    Rejected / Cancelled bookings don't need their proof kept forever, so
--    only those are pruned. (If you genuinely want to abandon a Pending
--    booking after N days, run rpc_apply_decision('Rejected', ...) first.)
-- ===========================================================================
CREATE OR REPLACE FUNCTION rpc_delete_expired_proofs(p_cutoff timestamptz)
RETURNS TABLE (deleted_paths text[])
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_paths text[];
BEGIN
  WITH deleted AS (
    DELETE FROM payment_proofs
    WHERE uploaded_at < p_cutoff
      AND booking_id NOT IN (
        SELECT id FROM bookings WHERE status = 'Pending'
      )
    RETURNING path
  )
  SELECT coalesce(array_agg(path), '{}'::text[]) INTO v_paths FROM deleted;

  RETURN QUERY SELECT v_paths;
END;
$$;


-- ===========================================================================
-- 8. rpc_admin_create_booking
--    Admin-side booking creation (walk-ins, phone bookings, internal records).
--
--    Differs from rpc_submit_booking in four ways, all deliberate:
--      * No holds. The admin picks straight off the live slot grid, so there
--        is nothing to lock and nothing to release — the row is written once.
--      * Born 'Approved'. booking_slots are inserted already in the
--        'approved' state, and the customer email is the *approved* template
--        (never the "we got your request" one — it is already decided).
--      * Conflicting holds are force-deleted (Q15). A customer mid-checkout
--        must not be able to block a slot the front desk is selling right
--        now. This happens *before* the booking_slots insert so
--        booking_slots_no_overlap_idx is never violated.
--      * Notification is optional (Q4/Q9). p_notify = false writes the audit
--        row and returns, with no outbox entry at all.
--
--    Availability (open hours, closures, horizon) and pricing are enforced by
--    the caller: POST /api/admin/bookings runs assertSlotsOpen() and
--    recalculateTotal() before calling this, exactly like the customer path.
--
--    p_slots:         [{ court_id, slot_start }]
--    p_slot_summary:  [{ courtId, courtName, slotStart }]  (outbox payload)
--    p_proof:         { path, mime, bytes } | null
--    p_paid_cash:     true when the front desk collected cash (no proof needed)
--    Returns { booking_id, tracking_token, tracking_code, total, status,
--              notify, deduped, evicted_holds }
-- ===========================================================================
-- The signature changed when paid_cash was added; drop the old overload so
-- PostgREST can never resolve a 18-arg call to a stale definition.
DROP FUNCTION IF EXISTS rpc_admin_create_booking(text, text, text, text, text, text, text, jsonb, jsonb, int, text, text, text, text, int, boolean, jsonb, text);

CREATE OR REPLACE FUNCTION rpc_admin_create_booking(
  p_idempotency_key  text,
  p_tracking_token   text,
  p_tracking_code    text,
  p_full_name        text,
  p_email            text,
  p_phone            text,
  p_total            text,
  p_slots            jsonb,   -- [{ court_id uuid, slot_start timestamptz }]
  p_slot_summary     jsonb,
  p_paddle_qty       int,
  p_paddle_hours     text,    -- nullable string
  p_ball_fee         text,    -- nullable string
  p_proof_path       text,    -- nullable
  p_proof_mime       text,    -- nullable
  p_proof_bytes      int,     -- nullable
  p_notify           boolean, -- false -> audit only, no email
  p_lines            jsonb,
  p_actor_email      text,
  p_paid_cash        boolean  -- cash collected at the desk
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking_id   uuid;
  v_now          timestamptz := now();
  v_claimed_key  text;
  v_prior_bk_id  uuid;
  v_prior_row    bookings%ROWTYPE;
  v_evicted      int := 0;
BEGIN
  -- Note: SET LOCAL transaction_isolation removed — see rpc_apply_decision.

  -- ── Idempotency: first writer wins ──────────────────────────────────────
  INSERT INTO idempotency_keys (key) VALUES (p_idempotency_key)
  ON CONFLICT (key) DO NOTHING
  RETURNING key INTO v_claimed_key;

  IF v_claimed_key IS NULL THEN
    SELECT booking_id INTO v_prior_bk_id
    FROM   idempotency_keys
    WHERE  key = p_idempotency_key;

    IF v_prior_bk_id IS NULL THEN
      RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS: A booking with this key is already being created.'
        USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_prior_row FROM bookings WHERE id = v_prior_bk_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INTERNAL: Prior booking is unreadable.' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
      'booking_id',     v_prior_bk_id,
      'tracking_token', v_prior_row.tracking_token,
      'tracking_code',  v_prior_row.tracking_code,
      'total',          v_prior_row.total,
      'status',         v_prior_row.status,
      'notify',         p_notify,
      'deduped',        true,
      'evicted_holds',  0
    );
  END IF;

  -- ── Proof reuse check ───────────────────────────────────────────────────
  IF p_proof_path IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM payment_proofs WHERE path = p_proof_path FOR UPDATE) THEN
      RAISE EXCEPTION 'PROOF_ALREADY_USED: This payment proof was already used.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- ── Evict live holds on the requested (court, slot) ────────────────────
  -- Scoped to the pairs being booked. This used to be preceded by a
  -- table-wide `DELETE FROM holds WHERE expires_at <= now()`, which threw
  -- away every other customer's expired-but-still-in-grace hold, so their
  -- "Restore my slots" came back HOLD_NOT_FOUND while they were in their
  -- banking app. The pair-scoped delete below is all this function needs.
  WITH req AS (
    SELECT (s->>'court_id')::uuid          AS court_id,
           (s->>'slot_start')::timestamptz AS slot_start
    FROM   jsonb_array_elements(p_slots) AS s
  ), evicted AS (
    DELETE FROM holds h
    USING req
    WHERE h.court_id = req.court_id
      AND h.slot_start = req.slot_start
    RETURNING 1
  )
  SELECT count(*) INTO v_evicted FROM evicted;

  -- ── Clash check against live bookings (unique index is the real guard) ──
  IF EXISTS (
    SELECT 1
    FROM   booking_slots bs
    JOIN   (
      SELECT (s->>'court_id')::uuid          AS court_id,
             (s->>'slot_start')::timestamptz AS slot_start
      FROM   jsonb_array_elements(p_slots) AS s
    ) req ON bs.court_id = req.court_id AND bs.slot_start = req.slot_start
    WHERE  bs.state IN ('held', 'pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'SLOT_TAKEN: A selected slot is no longer available.' USING ERRCODE = '23505';
  END IF;

  -- ── Insert booking (born Approved) ───────────────────────────────────────
  -- play_date: see rpc_submit_booking — the Manila business day of the
  -- earliest requested slot (07:00 anchor, so overnight slots stay on the
  -- selected day), computed in SQL so it can never disagree with the
  -- rows written to booking_slots just below.
  INSERT INTO bookings (tracking_token, tracking_code, status, full_name, email, phone, total, play_date, paid_cash, approved_at)
  SELECT p_tracking_token, p_tracking_code, 'Approved', p_full_name, p_email, p_phone, p_total::numeric,
         ((min((s->>'slot_start')::timestamptz) AT TIME ZONE 'Asia/Manila')::date
          - CASE WHEN (min((s->>'slot_start')::timestamptz) AT TIME ZONE 'Asia/Manila')::time < time '07:00' THEN 1 ELSE 0 END),
         p_paid_cash,
         now()
  FROM   jsonb_array_elements(p_slots) AS s
  RETURNING id INTO v_booking_id;

  -- ── Insert booking_slots, already approved ───────────────────────────────
  INSERT INTO booking_slots (booking_id, court_id, slot_start, state)
  SELECT v_booking_id,
         (s->>'court_id')::uuid,
         (s->>'slot_start')::timestamptz,
         'approved'
  FROM   jsonb_array_elements(p_slots) AS s;

  -- ── Insert booking_rentals (always, zeros when none) ─────────────────────
  INSERT INTO booking_rentals (booking_id, paddle_qty, paddle_hours, ball_fee)
  VALUES (
    v_booking_id,
    p_paddle_qty,
    CASE WHEN p_paddle_hours IS NOT NULL THEN p_paddle_hours::numeric ELSE NULL END,
    CASE WHEN p_ball_fee     IS NOT NULL THEN p_ball_fee::numeric     ELSE NULL END
  );

  -- ── Insert payment_proofs (optional — admin may skip it) ────────────────
  IF p_proof_path IS NOT NULL THEN
    INSERT INTO payment_proofs (booking_id, path, mime, bytes)
    VALUES (v_booking_id, p_proof_path, p_proof_mime, p_proof_bytes);
  END IF;

  -- ── Outbox: approved email only when the admin asked for it ─────────────
  IF p_notify THEN
    INSERT INTO email_outbox (booking_id, template, to_addr, payload, status, attempts, next_attempt_at)
    VALUES (
      v_booking_id,
      'booking_customer_approved',
      p_email,
      jsonb_build_object(
        'trackingToken', p_tracking_token,
        'trackingCode',  p_tracking_code,
        'fullName',      p_full_name,
        'email',         p_email,
        'phone',         p_phone,
        'total',         p_total,
        'slots',         p_slot_summary
      ) || jsonb_build_object('lines', p_lines),
      'pending', 0, v_now
    );
  END IF;

  -- ── Audit row ────────────────────────────────────────────────────────────
  INSERT INTO audit_log (actor, action, entity, entity_id, after)
  VALUES (
    p_actor_email,
    'booking.admin_create',
    'booking',
    v_booking_id::text,
    jsonb_build_object(
      'trackingToken', p_tracking_token,
      'trackingCode',  p_tracking_code,
      'total',         p_total,
      'status',        'Approved',
      'notify',        p_notify,
      'paidCash',      p_paid_cash,
      'evictedHolds',  v_evicted,
      'slots',         p_slot_summary
    )
  );

  -- ── Stamp idempotency key with booking_id ────────────────────────────────
  UPDATE idempotency_keys SET booking_id = v_booking_id WHERE key = p_idempotency_key;

  RETURN jsonb_build_object(
    'booking_id',     v_booking_id,
    'tracking_token', p_tracking_token,
    'tracking_code',  p_tracking_code,
    'total',          p_total,
    'status',         'Approved',
    'notify',         p_notify,
    'deduped',        false,
    'evicted_holds',  v_evicted
  );
END;
$$;
