-- Apply manually after 20261105_auth_accounts_sessions.sql and
-- 20261106_auth_staff_role.sql. No accounts are promoted by this migration.
BEGIN;
ALTER TABLE public.omnilock_account
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.omnilock_admin_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id bigint NOT NULL REFERENCES public.omnilock_account(account_id),
  target_id bigint NOT NULL REFERENCES public.omnilock_account(account_id),
  event_type varchar(20) NOT NULL CHECK (event_type IN ('ROLE_CHANGED', 'ACCOUNT_DISABLED', 'ACCOUNT_ENABLED')),
  old_role varchar(20) NOT NULL CHECK (old_role IN ('ADMIN', 'STAFF')),
  new_role varchar(20) NOT NULL CHECK (new_role IN ('ADMIN', 'STAFF')),
  old_active boolean NOT NULL,
  new_active boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS omnilock_admin_audit_created_idx
  ON public.omnilock_admin_audit (created_at DESC, audit_id DESC);

-- Both functions use the same transaction-scoped lock, then actor and target
-- row locks. Stock/order procedures and existing credentials are untouched.
CREATE OR REPLACE FUNCTION public.omnilock_set_account_role(
  p_actor_id bigint, p_target_id bigint, p_new_role varchar
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor_role varchar(20);
  v_actor_active boolean;
  v_target_role varchar(20);
  v_target_active boolean;
  v_result jsonb;
BEGIN
  IF p_new_role IS NULL OR p_new_role NOT IN ('ADMIN', 'STAFF') THEN
    RAISE EXCEPTION 'Invalid account role' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(65453, 1);
  SELECT a.role, a.is_active INTO v_actor_role, v_actor_active
    FROM public.omnilock_account a WHERE a.account_id = p_actor_id FOR UPDATE;
  IF v_actor_role IS DISTINCT FROM 'ADMIN' OR v_actor_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  SELECT a.role, a.is_active INTO v_target_role, v_target_active
    FROM public.omnilock_account a WHERE a.account_id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002'; END IF;
  IF p_target_id = p_actor_id THEN
    RAISE EXCEPTION 'Administrators cannot change their own role' USING ERRCODE = 'P4091';
  END IF;
  IF v_target_role = p_new_role THEN
    RAISE EXCEPTION 'Role is already current' USING ERRCODE = 'P4090';
  END IF;
  IF v_target_role = 'ADMIN' AND v_target_active AND p_new_role = 'STAFF' AND
     (SELECT count(*) FROM public.omnilock_account WHERE role = 'ADMIN' AND is_active) <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last active administrator' USING ERRCODE = 'P4092';
  END IF;
  UPDATE public.omnilock_account a SET role = p_new_role WHERE a.account_id = p_target_id
    RETURNING jsonb_build_object('id', a.account_id, 'name', a.full_name,
      'email', a.email, 'phone', a.phone, 'role', a.role,
      'isActive', a.is_active, 'createdAt', a.created_at) INTO v_result;
  DELETE FROM public.omnilock_session WHERE account_id = p_target_id;
  INSERT INTO public.omnilock_admin_audit
    (actor_id, target_id, event_type, old_role, new_role, old_active, new_active)
    VALUES (p_actor_id, p_target_id, 'ROLE_CHANGED', v_target_role, p_new_role,
      v_target_active, v_target_active);
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.omnilock_set_account_active(
  p_actor_id bigint, p_target_id bigint, p_new_active boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor_role varchar(20);
  v_actor_active boolean;
  v_target_role varchar(20);
  v_target_active boolean;
  v_result jsonb;
BEGIN
  IF p_new_active IS NULL THEN
    RAISE EXCEPTION 'Invalid account status' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(65453, 1);
  SELECT a.role, a.is_active INTO v_actor_role, v_actor_active
    FROM public.omnilock_account a WHERE a.account_id = p_actor_id FOR UPDATE;
  IF v_actor_role IS DISTINCT FROM 'ADMIN' OR v_actor_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  SELECT a.role, a.is_active INTO v_target_role, v_target_active
    FROM public.omnilock_account a WHERE a.account_id = p_target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found' USING ERRCODE = 'P0002'; END IF;
  IF p_target_id = p_actor_id THEN
    RAISE EXCEPTION 'Administrators cannot change their own status' USING ERRCODE = 'P4091';
  END IF;
  IF v_target_active = p_new_active THEN
    RAISE EXCEPTION 'Status is already current' USING ERRCODE = 'P4090';
  END IF;
  IF v_target_role = 'ADMIN' AND v_target_active AND NOT p_new_active AND
     (SELECT count(*) FROM public.omnilock_account WHERE role = 'ADMIN' AND is_active) <= 1 THEN
    RAISE EXCEPTION 'Cannot disable the last active administrator' USING ERRCODE = 'P4092';
  END IF;
  UPDATE public.omnilock_account a SET is_active = p_new_active WHERE a.account_id = p_target_id
    RETURNING jsonb_build_object('id', a.account_id, 'name', a.full_name,
      'email', a.email, 'phone', a.phone, 'role', a.role,
      'isActive', a.is_active, 'createdAt', a.created_at) INTO v_result;
  IF NOT p_new_active THEN
    DELETE FROM public.omnilock_session WHERE account_id = p_target_id;
  END IF;
  INSERT INTO public.omnilock_admin_audit
    (actor_id, target_id, event_type, old_role, new_role, old_active, new_active)
    VALUES (p_actor_id, p_target_id,
      CASE WHEN p_new_active THEN 'ACCOUNT_ENABLED' ELSE 'ACCOUNT_DISABLED' END,
      v_target_role, v_target_role, v_target_active, p_new_active);
  RETURN v_result;
END;
$function$;
COMMIT;
