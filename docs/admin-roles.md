# OmniLock account roles

Apply `20261105_auth_accounts_sessions.sql`, then
`20261106_auth_staff_role.sql`, then
`20261107_admin_role_management.sql` on the intended Neon branch. The last
migration creates a role-change function but changes no accounts. New accounts
always register as STAFF. Admin pages and APIs check the role from the current
PostgreSQL session on every request; the role-change function also rechecks the
actor's role and prevents removal of the last Admin.

## Assign the first Administrator manually

This is an owner-only action. Obtain explicit owner approval, verify that the
target is an existing Staff account owned by the intended person, and run the
following in the Neon SQL Editor for the correct branch. Replace both markers
with the verified account ID and email. The SQL refuses to run if an Admin
already exists or if the account does not match both identifiers.

```sql
BEGIN;
SELECT pg_advisory_xact_lock(65453, 1);
DO $bootstrap$
BEGIN
  IF EXISTS (SELECT 1 FROM public.omnilock_account WHERE role = 'ADMIN') THEN
    RAISE EXCEPTION 'An Administrator already exists; use User Management instead';
  END IF;
  UPDATE public.omnilock_account
  SET role = 'ADMIN'
  WHERE account_id = <VERIFIED_ACCOUNT_ID>
    AND lower(email) = lower('<VERIFIED_EMAIL>')
    AND role = 'STAFF';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verified Staff account was not found';
  END IF;
END;
$bootstrap$;
COMMIT;
```

Afterward, refresh the application and open the profile menu to reach User
Management. Admin users can promote or demote accounts there. Review each
change before confirming. Staff can use operational modules but receive HTTP
403 from Admin-only routes. The account listing omits password hashes and
session tokens.

For a live permission check, run `tests/admin-access.integration.mjs` with
`OMNILOCK_TEST_STAFF_SESSION` set to a valid Staff session cookie. It requests
the Admin page and APIs, including a PATCH that must be rejected before any
mutation. Do not share or commit the token.
