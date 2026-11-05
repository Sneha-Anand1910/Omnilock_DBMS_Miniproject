-- Apply manually on the intended Neon branch. Future holds become 20 minutes.
-- Existing reservation rows and their expires_at values are not changed.
-- The installed function body is retained verbatim except for its one interval;
-- inventory row locking, stock checks, and atomic order creation remain intact.
BEGIN;
DO $migration$
DECLARE
  v_definition text;
  v_15 constant text := 'CURRENT_TIMESTAMP + INTERVAL ''15 minutes''';
  v_35 constant text := 'CURRENT_TIMESTAMP + INTERVAL ''35 minutes''';
  v_20 constant text := 'CURRENT_TIMESTAMP + INTERVAL ''20 minutes''';
  v_previous text;
BEGIN
  SELECT pg_get_functiondef(to_regprocedure(
    'public.reserve_inventory(integer,integer,integer,integer,character varying)'
  )) INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'reserve_inventory() was not found; no change applied';
  END IF;
  IF position(v_20 IN v_definition) > 0 AND
     position(v_15 IN v_definition) = 0 AND position(v_35 IN v_definition) = 0 THEN
    RAISE NOTICE 'Reservation duration is already 20 minutes';
    RETURN;
  END IF;
  IF position(v_15 IN v_definition) > 0 AND position(v_35 IN v_definition) = 0 THEN
    v_previous := v_15;
  ELSIF position(v_35 IN v_definition) > 0 AND position(v_15 IN v_definition) = 0 THEN
    v_previous := v_35;
  ELSE
    RAISE EXCEPTION 'Unexpected reserve_inventory() interval; review manually before changing it';
  END IF;
  IF length(v_definition) - length(replace(v_definition, v_previous, '')) <> length(v_previous)
     OR position(v_20 IN v_definition) > 0 THEN
    RAISE EXCEPTION 'Ambiguous reserve_inventory() definition; no change applied';
  END IF;

  EXECUTE replace(v_definition, v_previous, v_20);
END;
$migration$;
COMMIT;
