-- Apply manually in Neon before enabling the OmniLock sign-in flow.
-- These tables are independent of existing business records and procedures.
CREATE TABLE IF NOT EXISTS public.omnilock_account (
  account_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name varchar(100) NOT NULL CHECK (length(btrim(full_name)) > 0),
  email varchar(254) NOT NULL,
  password_hash text NOT NULL,
  phone varchar(20),
  failed_logins integer NOT NULL DEFAULT 0 CHECK (failed_logins >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS omnilock_account_email_unique
  ON public.omnilock_account (lower(email));

CREATE TABLE IF NOT EXISTS public.omnilock_session (
  token_hash char(64) PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES public.omnilock_account(account_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS omnilock_session_account_id_idx
  ON public.omnilock_session (account_id);
CREATE INDEX IF NOT EXISTS omnilock_session_expires_at_idx
  ON public.omnilock_session (expires_at);
