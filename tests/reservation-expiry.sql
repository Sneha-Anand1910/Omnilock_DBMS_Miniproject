-- Manual integration test ONLY on an isolated Neon test branch, after applying
-- 20261108_reservation_20_minutes.sql. This transaction always ends in ROLLBACK.
-- It needs one customer and one product/warehouse inventory row with available
-- stock and a positive product price. Do not run on the working data branch.
BEGIN;
DO $test$
DECLARE
  v_customer integer;
  v_product integer;
  v_warehouse integer;
  v_inventory integer;
  v_before integer;
  v_order integer;
  v_order_item integer;
  v_reservation integer;
  v_expiry timestamptz;
  v_status text;
  v_reserved integer;
BEGIN
  SELECT customer_id INTO v_customer FROM public.customer ORDER BY customer_id LIMIT 1;
  SELECT i.product_id, i.warehouse_id, i.inventory_id, i.reserved_quantity
    INTO v_product, v_warehouse, v_inventory, v_before
  FROM public.inventory i JOIN public.product p USING (product_id)
  WHERE i.stock_quantity - i.reserved_quantity >= 1 AND p.price > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.inventory_reservation r
      WHERE r.inventory_id = i.inventory_id AND r.reservation_status = 'ACTIVE'
        AND r.expires_at <= now()
    )
  ORDER BY i.inventory_id LIMIT 1;
  IF v_customer IS NULL OR v_inventory IS NULL THEN
    RAISE EXCEPTION 'Test requires a customer and one eligible stock row';
  END IF;

  v_order := public.reserve_inventory(v_customer, v_product, v_warehouse, 1, 'WEBSITE');
  SELECT oi.order_item_id, r.reservation_id, r.expires_at
    INTO v_order_item, v_reservation, v_expiry
  FROM public.order_item oi JOIN public.inventory_reservation r USING (order_item_id)
  WHERE oi.order_id = v_order;
  IF v_expiry NOT BETWEEN now() + interval '19 minutes 30 seconds'
                      AND now() + interval '20 minutes 30 seconds' THEN
    RAISE EXCEPTION 'New reservation does not expire in approximately 20 minutes';
  END IF;
  UPDATE public.inventory_reservation SET expires_at = now() - interval '1 minute'
  WHERE reservation_id = v_reservation;
  PERFORM public.expire_reservations();
  SELECT reservation_status INTO v_status FROM public.inventory_reservation
  WHERE reservation_id = v_reservation;
  SELECT reserved_quantity INTO v_reserved FROM public.inventory WHERE inventory_id = v_inventory;
  IF v_status <> 'EXPIRED' OR v_reserved <> v_before THEN
    RAISE EXCEPTION 'Expired hold did not release exactly one reserved unit';
  END IF;

  v_order := public.reserve_inventory(v_customer, v_product, v_warehouse, 1, 'WEBSITE');
  SELECT r.reservation_id INTO v_reservation
  FROM public.order_item oi JOIN public.inventory_reservation r USING (order_item_id)
  WHERE oi.order_id = v_order;
  PERFORM public.confirm_payment(v_order, 'UPI', 'TEST-EXPIRY-' || v_order::text);
  UPDATE public.inventory_reservation SET expires_at = now() - interval '1 minute'
  WHERE reservation_id = v_reservation;
  PERFORM public.expire_reservations();
  SELECT reservation_status INTO v_status FROM public.inventory_reservation
  WHERE reservation_id = v_reservation;
  SELECT reserved_quantity INTO v_reserved FROM public.inventory WHERE inventory_id = v_inventory;
  IF v_status <> 'CONFIRMED' OR v_reserved <> v_before + 1 THEN
    RAISE EXCEPTION 'Confirmed reservation was incorrectly expired or released';
  END IF;
END;
$test$;
ROLLBACK;
