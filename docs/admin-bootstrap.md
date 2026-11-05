# First OmniLock administrator

The owner must approve this one-time change. Public registration always creates STAFF.
Use the Neon SQL Editor on the intended branch, with trusted database-owner access.
Never put this SQL behind a public endpoint.

1. Apply `migrations/20261105_auth_accounts_sessions.sql` and `migrations/20261106_auth_staff_role.sql` if they have not already been applied. Then apply `migrations/20261107_admin_role_management.sql`. These are version-controlled; committing them does not execute them in Neon.
2. Sign up normally. Find the existing account ID using a read-only query:

```sql
SELECT account_id, full_name, email, role, is_active
FROM public.omnilock_account
ORDER BY account_id;
```

3. Replace `123` below with the approved existing account ID. Review the ID and target branch before executing. This transaction succeeds only when no ADMIN exists and the chosen account is active STAFF. It does not change the password or any business record.

```sql
BEGIN;
DO $bootstrap$
DECLARE
  v_target_id bigint := 123; -- replace with the approved existing account ID
  v_role varchar(20);
  v_active boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(65453, 1);
  IF EXISTS (SELECT 1 FROM public.omnilock_account WHERE role = 'ADMIN') THEN
    RAISE EXCEPTION 'An administrator already exists; use User Management instead';
  END IF;
  SELECT role, is_active INTO v_role, v_active
    FROM public.omnilock_account WHERE account_id = v_target_id FOR UPDATE;
  IF NOT FOUND OR v_role IS DISTINCT FROM 'STAFF' OR v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Target must be an existing active STAFF account';
  END IF;
  UPDATE public.omnilock_account SET role = 'ADMIN' WHERE account_id = v_target_id;
  DELETE FROM public.omnilock_session WHERE account_id = v_target_id;
END;
$bootstrap$;
COMMIT;
```

4. Confirm with `SELECT account_id, role, is_active FROM public.omnilock_account WHERE account_id = 123;`, using the same ID. Sign out or sign in again. The prior session is revoked by the bootstrap transaction.

After this, use `/admin/users` for all role and status changes. The initial owner-approved promotion is intentionally not attributed to an application administrator in the audit log; subsequent UI changes are audited.

## Manual verification after the migration

1. Register a separate test account and confirm its role is STAFF. Its `/` heading must read “Staff Operations Dashboard”; `/admin/users` and `/api/admin/users` must deny access.
2. Sign in as the approved ADMIN. Its `/` heading must read “Administrator Dashboard”; the sidebar must show Administration → User Management. Search and filter the account list.
3. With at least two active ADMIN accounts, promote and demote a different account. The changed account must sign in again because its sessions are revoked. Confirm each change appears in the dashboard audit panel.
4. Attempt to demote or disable your own account and the last active ADMIN; both must be rejected. Disable a separate test STAFF account and confirm its existing session loses access and login is refused. Re-enable it and confirm it can sign in.
5. Review inventory, reservation, payment, fulfillment, shipment, ticket, and 3D warehouse screens. These workflows are not changed by the role migration.

The integration test `tests/admin-access.integration.mjs` needs a separately supplied Staff session token and a running local server; it is skipped without them. Do not put a session token in the repository.
