-- CK Grounds finance expenses. Run after drizzle/*.sql and audit-rls.sql.
-- Safe to re-run in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  amount_centavos integer NOT NULL,
  paid_date date NOT NULL,
  description text,
  vendor text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT expenses_amount_centavos_check CHECK (amount_centavos > 0),
  CONSTRAINT expenses_category_check CHECK (category IN (
    'Rent', 'Payroll/Contractors', 'Utilities', 'Maintenance & Repairs',
    'Supplies & Equipment', 'Marketing', 'Software/Subscriptions',
    'Taxes & Fees', 'Other'
  ))
);

CREATE INDEX IF NOT EXISTS expenses_paid_date_idx
  ON public.expenses (paid_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS expenses_category_paid_date_idx
  ON public.expenses (category, paid_date DESC);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO service_role;
GRANT INSERT ON public.audit_log TO service_role;

-- No permissive policies are created: anon/authenticated callers are denied.
-- The app's service-role client bypasses RLS, while mutation integrity lives in
-- the RPCs below so writes and their audit records are atomic.

CREATE OR REPLACE FUNCTION public.rpc_create_expense(
  p_actor text, p_title text, p_category text, p_amount_centavos integer,
  p_paid_date date, p_description text DEFAULT NULL, p_vendor text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_expense public.expenses%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR length(btrim(p_actor)) = 0 THEN RAISE EXCEPTION 'UNAUTHORIZED: Missing actor.'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN RAISE EXCEPTION 'BAD_REQUEST: Title is required.'; END IF;
  IF p_amount_centavos IS NULL OR p_amount_centavos <= 0 THEN RAISE EXCEPTION 'BAD_REQUEST: Amount must be positive.'; END IF;
  IF p_paid_date IS NULL OR p_paid_date > (now() AT TIME ZONE 'Asia/Manila')::date THEN RAISE EXCEPTION 'BAD_REQUEST: Paid date cannot be in the future.'; END IF;
  INSERT INTO public.expenses (title, category, amount_centavos, paid_date, description, vendor, notes)
  VALUES (btrim(p_title), p_category, p_amount_centavos, p_paid_date, NULLIF(btrim(p_description), ''), NULLIF(btrim(p_vendor), ''), NULLIF(btrim(p_notes), ''))
  RETURNING * INTO v_expense;
  INSERT INTO public.audit_log (actor, action, entity, entity_id, after)
  VALUES (p_actor, 'expense.create', 'expense', v_expense.id::text, to_jsonb(v_expense));
  RETURN to_jsonb(v_expense);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_update_expense(
  p_id uuid, p_actor text, p_title text, p_category text, p_amount_centavos integer,
  p_paid_date date, p_description text DEFAULT NULL, p_vendor text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_before public.expenses%ROWTYPE; v_after public.expenses%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR length(btrim(p_actor)) = 0 THEN RAISE EXCEPTION 'UNAUTHORIZED: Missing actor.'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN RAISE EXCEPTION 'BAD_REQUEST: Title is required.'; END IF;
  IF p_amount_centavos IS NULL OR p_amount_centavos <= 0 THEN RAISE EXCEPTION 'BAD_REQUEST: Amount must be positive.'; END IF;
  IF p_paid_date IS NULL OR p_paid_date > (now() AT TIME ZONE 'Asia/Manila')::date THEN RAISE EXCEPTION 'BAD_REQUEST: Paid date cannot be in the future.'; END IF;
  SELECT * INTO v_before FROM public.expenses WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Expense not found.'; END IF;
  UPDATE public.expenses SET title = btrim(p_title), category = p_category, amount_centavos = p_amount_centavos,
    paid_date = p_paid_date, description = NULLIF(btrim(p_description), ''), vendor = NULLIF(btrim(p_vendor), ''),
    notes = NULLIF(btrim(p_notes), ''), updated_at = now() WHERE id = p_id RETURNING * INTO v_after;
  INSERT INTO public.audit_log (actor, action, entity, entity_id, before, after)
  VALUES (p_actor, 'expense.update', 'expense', p_id::text, to_jsonb(v_before), to_jsonb(v_after));
  RETURN to_jsonb(v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_delete_expense(p_id uuid, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_before public.expenses%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR length(btrim(p_actor)) = 0 THEN RAISE EXCEPTION 'UNAUTHORIZED: Missing actor.'; END IF;
  DELETE FROM public.expenses WHERE id = p_id RETURNING * INTO v_before;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Expense not found.'; END IF;
  INSERT INTO public.audit_log (actor, action, entity, entity_id, before)
  VALUES (p_actor, 'expense.delete', 'expense', p_id::text, to_jsonb(v_before));
END;
$$;

-- Restrict execution to the server's service-role client. SECURITY INVOKER
-- keeps normal table grants and RLS in force for the invoking role.
REVOKE ALL ON FUNCTION public.rpc_create_expense(text, text, text, integer, date, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_update_expense(uuid, text, text, text, integer, date, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_delete_expense(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_expense(text, text, text, integer, date, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_update_expense(uuid, text, text, text, integer, date, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_delete_expense(uuid, text) TO service_role;
