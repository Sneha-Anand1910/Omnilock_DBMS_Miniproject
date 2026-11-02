-- MANUAL APPLICATION ONLY. Review and apply once in Neon; never run automatically.
-- Adds Stage A preparation writers and duplicate guards. No existing function is replaced.
-- Existing records are not repaired or changed. Index creation fails if duplicates exist.
BEGIN;

CREATE UNIQUE INDEX stage_a_one_active_fulfillment
  ON public.fulfillment (order_item_id) WHERE status <> 'CANCELLED';
CREATE UNIQUE INDEX stage_a_one_active_shipment
  ON public.shipment (fulfillment_id) WHERE status <> 'CANCELLED';

-- New helper: locks only, never changes order/payment/inventory/reservation rows.
-- All Stage A writers take order -> payment -> inventory (ID order) -> reservations
-- (ID order) -> fulfillment -> shipment locks, matching existing cancellation.
CREATE FUNCTION public.stage_a_lock_item(p_item integer)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_order_id integer; v_order record; v_item record;
BEGIN
  SELECT order_id INTO v_order_id FROM public.order_item WHERE order_item_id=p_item;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4040', MESSAGE='Order item not found'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE order_id=v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4040', MESSAGE='Order not found'; END IF;
  SELECT * INTO v_item FROM public.order_item WHERE order_item_id=p_item AND order_id=v_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Order item changed'; END IF;
  IF v_order.status <> 'CONFIRMED' THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Only confirmed paid orders can enter preparation';
  END IF;
  PERFORM payment_id FROM public.payment WHERE order_id=v_order_id ORDER BY payment_id FOR UPDATE;
  IF v_order.total_amount <= 0 OR
    (SELECT count(*) FROM public.payment WHERE order_id=v_order_id AND status='SUCCESS') <> 1 OR
    NOT EXISTS (SELECT 1 FROM public.payment WHERE order_id=v_order_id AND status='SUCCESS' AND amount=v_order.total_amount) OR
    EXISTS (SELECT 1 FROM public.payment WHERE order_id=v_order_id AND status='REFUNDED') OR
    EXISTS (SELECT 1 FROM public.payment_refund pr JOIN public.payment p USING(payment_id) WHERE p.order_id=v_order_id)
  THEN RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Successful unrefunded payment is required'; END IF;

  PERFORM i.inventory_id FROM public.inventory i WHERE i.inventory_id IN
    (SELECT inventory_id FROM public.inventory_reservation WHERE order_item_id=p_item)
    ORDER BY i.inventory_id FOR UPDATE;
  PERFORM reservation_id FROM public.inventory_reservation WHERE order_item_id=p_item
    ORDER BY reservation_id FOR UPDATE;
  IF (SELECT COALESCE(sum(reserved_quantity),0) FROM public.inventory_reservation
      WHERE order_item_id=p_item AND reservation_status='CONFIRMED') <> v_item.quantity OR
    EXISTS (SELECT 1 FROM public.inventory_reservation WHERE order_item_id=p_item AND reservation_status='ACTIVE') OR
    EXISTS (SELECT 1 FROM public.inventory_reservation r JOIN public.inventory i USING(inventory_id)
      WHERE r.order_item_id=p_item AND r.reservation_status='CONFIRMED' AND
      (i.product_id <> v_item.product_id OR r.reserved_quantity <= 0 OR
       i.stock_quantity < i.reserved_quantity OR i.reserved_quantity < 0 OR
       i.reserved_quantity <> (SELECT COALESCE(sum(x.reserved_quantity),0) FROM public.inventory_reservation x
         WHERE x.inventory_id=i.inventory_id AND x.reservation_status IN ('ACTIVE','CONFIRMED'))))
  THEN RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Confirmed reservations do not match the item or inventory ledger'; END IF;
  -- Confirmed holds do not expire like ACTIVE holds; expires_at is intentionally ignored.
END;
$$;

CREATE FUNCTION public.stage_a_create_fulfillment(p_item integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_record public.fulfillment;
BEGIN
  PERFORM public.stage_a_lock_item(p_item);
  IF EXISTS (SELECT 1 FROM public.fulfillment WHERE order_item_id=p_item AND status <> 'CANCELLED') THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Active fulfillment already exists';
  END IF;
  INSERT INTO public.fulfillment(order_item_id, fulfillment_date, status)
    VALUES(p_item,NULL,'PENDING') RETURNING * INTO v_record;
  RETURN to_jsonb(v_record);
END;
$$;

CREATE FUNCTION public.stage_a_update_fulfillment(p_id integer,p_current text,p_next text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_item integer; v_record public.fulfillment;
BEGIN
  IF p_current IS NULL OR p_next IS NULL OR NOT
     ((p_current='PENDING' AND p_next='PROCESSING') OR (p_current='PROCESSING' AND p_next='PACKED')) THEN
    RAISE EXCEPTION USING ERRCODE='P4000', MESSAGE='Stage A permits only PENDING to PROCESSING to PACKED';
  END IF;
  SELECT order_item_id INTO v_item FROM public.fulfillment WHERE fulfillment_id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4040', MESSAGE='Fulfillment not found'; END IF;
  PERFORM public.stage_a_lock_item(v_item);
  SELECT * INTO v_record FROM public.fulfillment WHERE fulfillment_id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4040', MESSAGE='Fulfillment not found'; END IF;
  IF v_record.order_item_id <> v_item OR v_record.status <> p_current THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Fulfillment changed; refresh before retrying';
  END IF;
  UPDATE public.fulfillment SET status=p_next WHERE fulfillment_id=p_id RETURNING * INTO v_record;
  RETURN to_jsonb(v_record);
END;
$$;

CREATE FUNCTION public.stage_a_create_shipment(p_fulfillment integer,p_courier text,p_tracking text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_item integer; v_fulfillment public.fulfillment; v_record public.shipment;
BEGIN
  IF p_courier IS NULL OR length(btrim(p_courier)) NOT BETWEEN 1 AND 100 OR length(btrim(p_tracking)) > 100 THEN
    RAISE EXCEPTION USING ERRCODE='P4000', MESSAGE='Invalid courier or tracking number';
  END IF;
  SELECT order_item_id INTO v_item FROM public.fulfillment WHERE fulfillment_id=p_fulfillment;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4040', MESSAGE='Fulfillment not found'; END IF;
  PERFORM public.stage_a_lock_item(v_item);
  SELECT * INTO v_fulfillment FROM public.fulfillment WHERE fulfillment_id=p_fulfillment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4040', MESSAGE='Fulfillment not found'; END IF;
  IF v_fulfillment.order_item_id <> v_item OR v_fulfillment.status <> 'PACKED' THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Shipment preparation requires PACKED fulfillment';
  END IF;
  IF EXISTS (SELECT 1 FROM public.shipment WHERE fulfillment_id=p_fulfillment AND status <> 'CANCELLED') THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Active shipment already exists';
  END IF;
  INSERT INTO public.shipment(fulfillment_id,courier,tracking_no,status,ship_date,delivery_date)
    VALUES(p_fulfillment,btrim(p_courier),NULLIF(btrim(p_tracking),''),'PENDING',NULL,NULL) RETURNING * INTO v_record;
  RETURN to_jsonb(v_record);
END;
$$;

CREATE FUNCTION public.stage_a_update_shipment(p_id integer,p_current text,p_next text,p_courier text,p_tracking text,
  p_expected_courier text,p_expected_tracking text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_item integer; v_fid integer; v_fulfillment public.fulfillment; v_record public.shipment;
BEGIN
  IF p_current IS DISTINCT FROM 'PENDING' OR p_next IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION USING ERRCODE='P4000', MESSAGE='Stage A supports PENDING shipments only';
  END IF;
  IF p_courier IS NULL OR length(btrim(p_courier)) NOT BETWEEN 1 AND 100 OR length(btrim(p_tracking)) > 100 THEN
    RAISE EXCEPTION USING ERRCODE='P4000', MESSAGE='Invalid courier or tracking number';
  END IF;
  SELECT f.order_item_id,f.fulfillment_id INTO v_item,v_fid FROM public.shipment s
    JOIN public.fulfillment f USING(fulfillment_id) WHERE s.shipment_id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4040', MESSAGE='Shipment not found'; END IF;
  PERFORM public.stage_a_lock_item(v_item);
  SELECT * INTO v_fulfillment FROM public.fulfillment WHERE fulfillment_id=v_fid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4040', MESSAGE='Fulfillment not found'; END IF;
  IF v_fulfillment.order_item_id <> v_item OR v_fulfillment.status <> 'PACKED' THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Shipment preparation requires PACKED fulfillment';
  END IF;
  SELECT * INTO v_record FROM public.shipment WHERE shipment_id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4040', MESSAGE='Shipment not found'; END IF;
  IF v_record.fulfillment_id <> v_fid OR v_record.status <> 'PENDING' OR
    v_record.courier IS DISTINCT FROM p_expected_courier OR v_record.tracking_no IS DISTINCT FROM p_expected_tracking OR
    v_record.ship_date IS NOT NULL OR v_record.delivery_date IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Shipment changed or has dispatch dates; refresh before retrying';
  END IF;
  UPDATE public.shipment SET courier=btrim(p_courier),tracking_no=NULLIF(btrim(p_tracking),'')
    WHERE shipment_id=p_id RETURNING * INTO v_record;
  RETURN to_jsonb(v_record);
END;
$$;
COMMIT;
