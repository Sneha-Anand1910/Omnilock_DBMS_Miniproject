-- Apply manually in Neon after reviewing the target branch.
-- Existing records intentionally remain NULL: their real creation time is unknown.
-- The second statement gives only future inserts a timezone-safe creation instant.
BEGIN;
ALTER TABLE public.customer ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.customer ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.category ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.category ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.product ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.product ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.warehouse ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.warehouse ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.inventory ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.shipment ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.shipment ALTER COLUMN created_at SET DEFAULT now();
COMMIT;
