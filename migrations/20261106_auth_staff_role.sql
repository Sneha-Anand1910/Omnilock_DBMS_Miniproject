-- Apply after 20261105_auth_accounts_sessions.sql. Existing business tables are untouched.
-- All current and future accounts default to Staff; the registration API never accepts a role.
ALTER TABLE public.omnilock_account
  ADD COLUMN IF NOT EXISTS role varchar(20) NOT NULL DEFAULT 'STAFF'
  CHECK (role IN ('STAFF', 'ADMIN'));
