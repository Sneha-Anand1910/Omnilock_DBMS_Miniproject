-- MANUAL APPLICATION ONLY, once, after Stage A and safe cancellation/refunds.
-- This migration performs DDL only; it does not dispatch or repair existing data.
-- Existing procedures are NOT replaced. CONSUMED is outside their ACTIVE/CONFIRMED
-- hold sets. An additional order trigger rejects cancellation if dispatch exists.
BEGIN;

-- Preserve the actual installed status constraint, extending only its allowed
-- values. Fail closed if the expected single-column varchar/text check differs.
DO $$
DECLARE v_att smallint; v_check record; v_count integer;
BEGIN
  IF to_regprocedure('public.stage_a_lock_item(integer)') IS NULL OR
     to_regprocedure('public.cancel_order_with_refund(integer)') IS NULL OR
     to_regprocedure('public.expire_reservations()') IS NULL THEN
    RAISE EXCEPTION 'Stage A, safe cancellation and reservation expiry are prerequisites';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.stage_a_one_active_fulfillment')
      AND indrelid='public.fulfillment'::regclass AND indisunique AND indisvalid) OR
     NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.stage_a_one_active_shipment')
      AND indrelid='public.shipment'::regclass AND indisunique AND indisvalid) THEN
    RAISE EXCEPTION 'Valid Stage A duplicate-prevention indexes are required';
  END IF;
  SELECT a.attnum INTO v_att FROM pg_attribute a
    WHERE a.attrelid='public.inventory_reservation'::regclass
      AND a.attname='reservation_status' AND NOT a.attisdropped
      AND a.atttypid IN ('varchar'::regtype, 'text'::regtype);
  IF v_att IS NULL THEN RAISE EXCEPTION 'Expected varchar/text reservation_status'; END IF;
  SELECT count(*) INTO v_count FROM pg_constraint
    WHERE conrelid='public.inventory_reservation'::regclass AND contype='c'
      AND conkey=ARRAY[v_att]::smallint[];
  IF v_count <> 1 THEN RAISE EXCEPTION 'Review reservation status constraints before applying Stage B'; END IF;
  SELECT conname, pg_get_expr(conbin,conrelid) AS expression INTO v_check
    FROM pg_constraint WHERE conrelid='public.inventory_reservation'::regclass
      AND contype='c' AND conkey=ARRAY[v_att]::smallint[];
  EXECUTE format('ALTER TABLE public.inventory_reservation DROP CONSTRAINT %I',v_check.conname);
  EXECUTE format('ALTER TABLE public.inventory_reservation ADD CONSTRAINT %I CHECK ((%s) OR reservation_status = %L)',
    v_check.conname,v_check.expression,'CONSUMED');
END;
$$;

-- One immutable consumption entry per reservation, regardless of request retries.
CREATE TABLE public.inventory_dispatch (
  reservation_id integer PRIMARY KEY REFERENCES public.inventory_reservation(reservation_id),
  fulfillment_id integer NOT NULL REFERENCES public.fulfillment(fulfillment_id),
  order_item_id integer NOT NULL REFERENCES public.order_item(order_item_id),
  inventory_id integer NOT NULL REFERENCES public.inventory(inventory_id),
  quantity integer NOT NULL CHECK (quantity > 0),
  dispatched_at timestamp without time zone NOT NULL DEFAULT LOCALTIMESTAMP
);
CREATE INDEX stage_b_dispatch_fulfillment ON public.inventory_dispatch(fulfillment_id);
CREATE INDEX stage_b_dispatch_item ON public.inventory_dispatch(order_item_id);

CREATE FUNCTION public.stage_b_guard_consumption()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_TABLE_NAME='inventory_dispatch' THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Dispatch ledger entries are immutable';
  END IF;
  -- Handle DELETE completely before any NEW reference, even if this shared
  -- function is attached to another DELETE trigger in the future.
  IF TG_OP='DELETE' THEN
    IF TG_TABLE_NAME='inventory_reservation' THEN
      IF OLD.reservation_status='CONSUMED' THEN
        RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Consumed reservations cannot be released, changed or deleted';
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME='orders' THEN
    IF NEW.status='CANCELLED' AND EXISTS (
      SELECT 1 FROM public.inventory_dispatch d JOIN public.order_item oi USING(order_item_id)
      WHERE oi.order_id=OLD.order_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Dispatched inventory prevents cancellation or automatic refund';
    END IF;
  ELSE
    IF OLD.reservation_status='CONSUMED' THEN
      RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Consumed reservations cannot be released, changed or deleted';
    END IF;
    IF TG_OP='UPDATE' THEN
      IF NEW.reservation_status='CONSUMED' AND NOT EXISTS (
        SELECT 1 FROM public.inventory_dispatch d WHERE d.reservation_id=NEW.reservation_id
          AND d.order_item_id=NEW.order_item_id AND d.inventory_id=NEW.inventory_id
          AND d.quantity=NEW.reserved_quantity
      ) THEN
        RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Consumption requires a matching dispatch ledger entry';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stage_b_immutable_dispatch BEFORE UPDATE OR DELETE ON public.inventory_dispatch
  FOR EACH ROW EXECUTE FUNCTION public.stage_b_guard_consumption();
CREATE TRIGGER stage_b_consumed_reservation BEFORE UPDATE OR DELETE ON public.inventory_reservation
  FOR EACH ROW EXECUTE FUNCTION public.stage_b_guard_consumption();
-- Even if cancellation changes inventory before its final order UPDATE, this
-- exception rolls back that entire function call. No procedure replacement needed.
CREATE TRIGGER stage_b_no_dispatched_cancellation BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.stage_b_guard_consumption();

CREATE FUNCTION public.stage_b_assert_dispatched(p_fulfillment integer)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_item public.order_item; v_f public.fulfillment;
BEGIN
  SELECT * INTO v_f FROM public.fulfillment WHERE fulfillment_id=p_fulfillment;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4040', MESSAGE='Fulfillment not found'; END IF;
  SELECT * INTO v_item FROM public.order_item WHERE order_item_id=v_f.order_item_id;
  IF NOT FOUND OR v_f.status <> 'FULFILLED' OR v_f.fulfillment_date IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Successful inventory dispatch is required';
  END IF;
  IF (SELECT COALESCE(sum(quantity),0) FROM public.inventory_dispatch WHERE fulfillment_id=p_fulfillment) <> v_item.quantity OR
    EXISTS (SELECT 1 FROM public.inventory_dispatch d
      JOIN public.inventory_reservation r USING(reservation_id)
      JOIN public.inventory i ON i.inventory_id=d.inventory_id
      WHERE d.fulfillment_id=p_fulfillment AND
        (d.order_item_id<>v_item.order_item_id OR r.order_item_id<>v_item.order_item_id OR
         r.inventory_id<>d.inventory_id OR r.reserved_quantity<>d.quantity OR
         r.reservation_status<>'CONSUMED' OR i.product_id<>v_item.product_id)) OR
    EXISTS (SELECT 1 FROM public.inventory_reservation r WHERE r.order_item_id=v_item.order_item_id AND
      (r.reservation_status IN ('ACTIVE','CONFIRMED') OR
       (r.reservation_status='CONSUMED' AND NOT EXISTS
         (SELECT 1 FROM public.inventory_dispatch d WHERE d.reservation_id=r.reservation_id AND d.fulfillment_id=p_fulfillment))))
  THEN RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Dispatch ledger requires reconciliation'; END IF;
END;
$$;

CREATE FUNCTION public.stage_b_dispatch_fulfillment(p_id integer,p_current text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_item public.order_item; v_order public.orders; v_f public.fulfillment;
  v_item_id integer; v_order_id integer; v_hold record; v_ship public.shipment;
BEGIN
  IF p_current IS DISTINCT FROM 'PACKED' THEN
    RAISE EXCEPTION USING ERRCODE='P4000', MESSAGE='Dispatch requires expected status PACKED';
  END IF;
  SELECT oi.order_item_id,oi.order_id INTO v_item_id,v_order_id FROM public.fulfillment f
    JOIN public.order_item oi USING(order_item_id) WHERE f.fulfillment_id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4040', MESSAGE='Fulfillment not found'; END IF;
  -- Same parent-order serialization as Stage A, payment, expiry and cancellation.
  SELECT * INTO v_order FROM public.orders WHERE order_id=v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4040', MESSAGE='Order not found'; END IF;
  IF v_order.status NOT IN ('CONFIRMED','FULFILLED') THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Only confirmed paid orders can be dispatched';
  END IF;
  PERFORM payment_id FROM public.payment WHERE order_id=v_order_id ORDER BY payment_id FOR UPDATE;
  IF v_order.total_amount<=0 OR
    (SELECT count(*) FROM public.payment WHERE order_id=v_order_id AND status='SUCCESS')<>1 OR
    NOT EXISTS (SELECT 1 FROM public.payment WHERE order_id=v_order_id AND status='SUCCESS' AND amount=v_order.total_amount) OR
    EXISTS (SELECT 1 FROM public.payment WHERE order_id=v_order_id AND status='REFUNDED') OR
    EXISTS (SELECT 1 FROM public.payment_refund pr JOIN public.payment p USING(payment_id) WHERE p.order_id=v_order_id)
  THEN RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Successful unrefunded payment is required'; END IF;
  SELECT * INTO v_item FROM public.order_item WHERE order_item_id=v_item_id AND order_id=v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Order item changed'; END IF;
  -- Inventory before reservations/fulfillment, matching existing writers. NOWAIT
  -- avoids cycles with expire_reservations retaining locks across multiple orders.
  PERFORM i.inventory_id FROM public.inventory i WHERE i.inventory_id IN
    (SELECT inventory_id FROM public.inventory_reservation WHERE order_item_id=v_item_id)
    ORDER BY i.inventory_id FOR UPDATE NOWAIT;
  PERFORM reservation_id FROM public.inventory_reservation WHERE order_item_id=v_item_id
    ORDER BY reservation_id FOR UPDATE;
  SELECT * INTO v_f FROM public.fulfillment WHERE fulfillment_id=p_id FOR UPDATE;
  IF NOT FOUND OR v_f.order_item_id<>v_item_id THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Fulfillment changed';
  END IF;
  -- A retry returns verified prior success; it never performs another deduction.
  IF v_f.status='FULFILLED' THEN
    PERFORM public.stage_b_assert_dispatched(p_id);
    RETURN jsonb_build_object('record',to_jsonb(v_f),'alreadyDispatched',true);
  END IF;
  IF v_f.status<>p_current OR v_order.status<>'CONFIRMED' OR v_f.fulfillment_date IS NOT NULL OR
    EXISTS (SELECT 1 FROM public.inventory_dispatch WHERE order_item_id=v_item_id) THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Fulfillment is stale or inventory was already dispatched';
  END IF;
  -- Stage A creates shipments only while PACKED: require preparation first so
  -- dispatch cannot leave a fulfilled item with no supported shipping workflow.
  SELECT * INTO v_ship FROM public.shipment WHERE fulfillment_id=p_id AND status<>'CANCELLED' FOR UPDATE;
  IF NOT FOUND OR v_ship.status<>'PENDING' OR v_ship.ship_date IS NOT NULL OR v_ship.delivery_date IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Create a pending shipment before dispatching fulfillment';
  END IF;
  IF (SELECT COALESCE(sum(reserved_quantity),0) FROM public.inventory_reservation
      WHERE order_item_id=v_item_id AND reservation_status='CONFIRMED')<>v_item.quantity OR
    EXISTS (SELECT 1 FROM public.inventory_reservation WHERE order_item_id=v_item_id AND reservation_status IN ('ACTIVE','CONSUMED')) OR
    EXISTS (SELECT 1 FROM public.inventory_reservation r JOIN public.inventory i USING(inventory_id)
      WHERE r.order_item_id=v_item_id AND r.reservation_status='CONFIRMED' AND
        (i.product_id<>v_item.product_id OR r.reserved_quantity<=0 OR i.stock_quantity<i.reserved_quantity OR
         i.reserved_quantity<0 OR i.reserved_quantity<>(SELECT COALESCE(sum(x.reserved_quantity),0)
           FROM public.inventory_reservation x WHERE x.inventory_id=i.inventory_id AND x.reservation_status IN ('ACTIVE','CONFIRMED'))))
  THEN RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Confirmed reservation coverage or inventory ledger is inconsistent'; END IF;

  INSERT INTO public.inventory_dispatch(reservation_id,fulfillment_id,order_item_id,inventory_id,quantity)
    SELECT reservation_id,p_id,order_item_id,inventory_id,reserved_quantity
    FROM public.inventory_reservation WHERE order_item_id=v_item_id AND reservation_status='CONFIRMED';
  FOR v_hold IN SELECT inventory_id,sum(reserved_quantity)::integer AS quantity
    FROM public.inventory_reservation WHERE order_item_id=v_item_id AND reservation_status='CONFIRMED'
    GROUP BY inventory_id ORDER BY inventory_id
  LOOP
    UPDATE public.inventory SET stock_quantity=stock_quantity-v_hold.quantity,
      reserved_quantity=reserved_quantity-v_hold.quantity
      WHERE inventory_id=v_hold.inventory_id AND stock_quantity>=v_hold.quantity AND reserved_quantity>=v_hold.quantity;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Insufficient stock or reserved quantity'; END IF;
  END LOOP;
  UPDATE public.inventory_reservation SET reservation_status='CONSUMED'
    WHERE order_item_id=v_item_id AND reservation_status='CONFIRMED';
  UPDATE public.fulfillment SET status='FULFILLED',fulfillment_date=LOCALTIMESTAMP
    WHERE fulfillment_id=p_id RETURNING * INTO v_f;
  PERFORM public.stage_b_assert_dispatched(p_id);
  IF NOT EXISTS (SELECT 1 FROM public.order_item oi WHERE oi.order_id=v_order_id AND NOT EXISTS
    (SELECT 1 FROM public.fulfillment f WHERE f.order_item_id=oi.order_item_id AND f.status='FULFILLED'
      AND (SELECT COALESCE(sum(d.quantity),0) FROM public.inventory_dispatch d WHERE d.fulfillment_id=f.fulfillment_id)=oi.quantity)) THEN
    UPDATE public.orders SET status='FULFILLED' WHERE order_id=v_order_id;
  END IF;
  RETURN jsonb_build_object('record',to_jsonb(v_f),'alreadyDispatched',false);
END;
$$;

CREATE FUNCTION public.stage_b_transition_shipment(p_id integer,p_current text,p_next text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v_order_id integer; v_fid integer; v_order public.orders; v_f public.fulfillment; v_s public.shipment;
BEGIN
  IF p_current IS NULL OR p_next IS NULL OR NOT
    ((p_current='PENDING' AND p_next='SHIPPED') OR (p_current='SHIPPED' AND p_next='IN_TRANSIT') OR
     (p_current='IN_TRANSIT' AND p_next='OUT_FOR_DELIVERY') OR (p_current='OUT_FOR_DELIVERY' AND p_next='DELIVERED')) THEN
    RAISE EXCEPTION USING ERRCODE='P4000', MESSAGE='Only sequential delivery transitions are supported; returns and cancellation require a separate workflow';
  END IF;
  SELECT oi.order_id,f.fulfillment_id INTO v_order_id,v_fid FROM public.shipment s
    JOIN public.fulfillment f USING(fulfillment_id) JOIN public.order_item oi USING(order_item_id) WHERE s.shipment_id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P4040', MESSAGE='Shipment not found'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE order_id=v_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status NOT IN ('CONFIRMED','FULFILLED') THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Order no longer permits shipment';
  END IF;
  PERFORM payment_id FROM public.payment WHERE order_id=v_order_id ORDER BY payment_id FOR UPDATE;
  IF v_order.total_amount<=0 OR (SELECT count(*) FROM public.payment WHERE order_id=v_order_id AND status='SUCCESS')<>1 OR
    NOT EXISTS (SELECT 1 FROM public.payment WHERE order_id=v_order_id AND status='SUCCESS' AND amount=v_order.total_amount) OR
    EXISTS (SELECT 1 FROM public.payment WHERE order_id=v_order_id AND status='REFUNDED') OR
    EXISTS (SELECT 1 FROM public.payment_refund pr JOIN public.payment p USING(payment_id) WHERE p.order_id=v_order_id)
  THEN RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Successful unrefunded payment is required'; END IF;
  SELECT * INTO v_f FROM public.fulfillment WHERE fulfillment_id=v_fid FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.order_item WHERE order_item_id=v_f.order_item_id AND order_id=v_order_id) THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Fulfillment changed';
  END IF;
  PERFORM public.stage_b_assert_dispatched(v_fid);
  SELECT * INTO v_s FROM public.shipment WHERE shipment_id=p_id FOR UPDATE;
  IF NOT FOUND OR v_s.fulfillment_id<>v_fid OR v_s.status<>p_current THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Shipment changed; refresh before retrying';
  END IF;
  IF v_s.delivery_date IS NOT NULL OR (p_current='PENDING' AND v_s.ship_date IS NOT NULL) OR
    (p_current<>'PENDING' AND v_s.ship_date IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='P4090', MESSAGE='Shipment dates require reconciliation';
  END IF;
  UPDATE public.shipment SET status=p_next,
    ship_date=CASE WHEN p_next='SHIPPED' THEN LOCALTIMESTAMP ELSE ship_date END,
    delivery_date=CASE WHEN p_next='DELIVERED' THEN GREATEST(LOCALTIMESTAMP,ship_date) ELSE delivery_date END
    WHERE shipment_id=p_id RETURNING * INTO v_s;
  RETURN to_jsonb(v_s);
END;
$$;
COMMIT;
