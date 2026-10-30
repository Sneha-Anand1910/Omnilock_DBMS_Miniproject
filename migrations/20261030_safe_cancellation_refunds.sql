-- MANUAL MIGRATION: apply once in the Neon SQL editor for omnilock_db.
-- Does not repair historically inconsistent cancellations/refunds automatically.
-- Simulated refunds only: no external gateway calls or movement of money.
-- All order writers (including future fulfillment code) must lock orders first.
-- Lock order: order -> payment -> inventory (ascending ID) -> reservations (ascending ID).
BEGIN;

CREATE TABLE public.payment_refund (
  refund_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id integer NOT NULL UNIQUE REFERENCES public.payment(payment_id),
  amount numeric NOT NULL CHECK (amount > 0),
  status varchar(20) NOT NULL DEFAULT 'SIMULATED' CHECK (status = 'SIMULATED'),
  reason text NOT NULL DEFAULT 'ORDER_CANCELLATION' CHECK (reason = 'ORDER_CANCELLATION'),
  transaction_ref text NOT NULL UNIQUE,
  refunded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE FUNCTION public.cancel_order_with_refund(p_order_id integer)
RETURNS jsonb LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text;
  v_payment record;
  v_hold record;
  v_refunds jsonb;
  v_released bigint := 0;
BEGIN
  IF p_order_id IS NULL OR p_order_id <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P4001', MESSAGE = 'Invalid order ID';
  END IF;

  SELECT status INTO v_status FROM public.orders
  WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P4040', MESSAGE = 'Order not found';
  END IF;
  IF v_status = 'FULFILLED' THEN
    RAISE EXCEPTION USING ERRCODE = 'P4091', MESSAGE = 'Fulfilled orders cannot be cancelled';
  END IF;
  IF v_status NOT IN ('PENDING', 'CONFIRMED', 'CANCELLED') THEN
    RAISE EXCEPTION USING ERRCODE = 'P4092', MESSAGE = 'Order state does not permit cancellation';
  END IF;

  -- Conservatively block fulfillment work; do not guess whether stock was shipped.
  -- Future fulfillment operations must serialize on the same order lock.
  IF EXISTS (
    SELECT 1 FROM public.fulfillment f JOIN public.order_item oi USING (order_item_id)
    WHERE oi.order_id = p_order_id AND (
      f.status <> 'CANCELLED' OR EXISTS (
        SELECT 1 FROM public.shipment s WHERE s.fulfillment_id = f.fulfillment_id
      )
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P4091', MESSAGE = 'Fulfillment or shipment prevents cancellation';
  END IF;

  PERFORM payment_id FROM public.payment WHERE order_id = p_order_id
  ORDER BY payment_id FOR UPDATE;
  PERFORM i.inventory_id FROM public.inventory i WHERE i.inventory_id IN (
    SELECT r.inventory_id FROM public.inventory_reservation r
    JOIN public.order_item oi USING (order_item_id)
    WHERE oi.order_id = p_order_id AND r.reservation_status IN ('ACTIVE', 'CONFIRMED')
  ) ORDER BY i.inventory_id FOR UPDATE;
  PERFORM r.reservation_id FROM public.inventory_reservation r
  JOIN public.order_item oi USING (order_item_id)
  WHERE oi.order_id = p_order_id
  ORDER BY r.reservation_id FOR UPDATE OF r;

  -- Do not claim success for historic payments already marked refunded without
  -- matching evidence, or for a ledger/payment mismatch.
  IF EXISTS (
    SELECT 1 FROM public.payment p LEFT JOIN public.payment_refund r USING (payment_id)
    WHERE p.order_id = p_order_id AND (
      (p.status = 'REFUNDED' AND r.refund_id IS NULL) OR
      (r.refund_id IS NOT NULL AND (p.status <> 'REFUNDED' OR r.amount <> p.amount))
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P4093', MESSAGE = 'Payment and refund records require reconciliation';
  END IF;

  IF v_status = 'CANCELLED' THEN
    IF EXISTS (SELECT 1 FROM public.payment WHERE order_id = p_order_id AND status IN ('SUCCESS', 'PENDING'))
      OR EXISTS (SELECT 1 FROM public.inventory_reservation r JOIN public.order_item oi USING (order_item_id)
        WHERE oi.order_id = p_order_id AND r.reservation_status IN ('ACTIVE', 'CONFIRMED')) THEN
      RAISE EXCEPTION USING ERRCODE = 'P4093', MESSAGE = 'Previously cancelled order requires reconciliation';
    END IF;
    -- A consistent retry returns the original ledger, without releasing stock again.
  ELSE
    IF v_status = 'CONFIRMED' AND NOT EXISTS (
      SELECT 1 FROM public.payment WHERE order_id = p_order_id AND status IN ('SUCCESS', 'REFUNDED')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P4093', MESSAGE = 'Confirmed order has no successful payment evidence';
    END IF;

    -- Each affected inventory row is already locked. Verify the complete hold
    -- ledger across ALL orders, not merely that this order fits in the counter.
    -- Otherwise an undercount could release stock still reserved by another order.
    -- Existing reserve/expire/cancel writers lock inventory before changing holds;
    -- confirm_payment only changes ACTIVE to CONFIRMED, preserving this sum.
    IF EXISTS (
      SELECT 1 FROM public.inventory i
      WHERE i.inventory_id IN (
        SELECT r.inventory_id FROM public.inventory_reservation r
        JOIN public.order_item oi USING (order_item_id)
        WHERE oi.order_id = p_order_id
          AND r.reservation_status IN ('ACTIVE', 'CONFIRMED')
      ) AND (
        i.reserved_quantity IS NULL OR i.stock_quantity IS NULL OR
        i.reserved_quantity < 0 OR i.stock_quantity < i.reserved_quantity OR
        i.reserved_quantity::bigint <> (
          SELECT COALESCE(sum(r.reserved_quantity), 0)
          FROM public.inventory_reservation r
          WHERE r.inventory_id = i.inventory_id
            AND r.reservation_status IN ('ACTIVE', 'CONFIRMED')
        )
      )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P4094', MESSAGE = 'Inventory holds require reconciliation';
    END IF;
    FOR v_payment IN SELECT payment_id, amount FROM public.payment
      WHERE order_id = p_order_id AND status = 'SUCCESS' ORDER BY payment_id
    LOOP
      INSERT INTO public.payment_refund (payment_id, amount, transaction_ref)
      VALUES (v_payment.payment_id, v_payment.amount, 'SIM-REFUND-' || v_payment.payment_id::text);
      UPDATE public.payment SET status = 'REFUNDED' WHERE payment_id = v_payment.payment_id;
    END LOOP;

    -- Both ACTIVE and CONFIRMED reservations still contribute to reserved_quantity.
    -- confirm_payment never subtracts stock_quantity, so adding physical stock here
    -- would create inventory. Release the holds only, grouped by inventory record.
    FOR v_hold IN
      SELECT r.inventory_id, sum(r.reserved_quantity) AS quantity
      FROM public.inventory_reservation r JOIN public.order_item oi USING (order_item_id)
      WHERE oi.order_id = p_order_id AND r.reservation_status IN ('ACTIVE', 'CONFIRMED')
      GROUP BY r.inventory_id ORDER BY r.inventory_id
    LOOP
      UPDATE public.inventory SET reserved_quantity = reserved_quantity - v_hold.quantity
      WHERE inventory_id = v_hold.inventory_id AND reserved_quantity >= v_hold.quantity;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P4094', MESSAGE = 'Inventory holds require reconciliation';
      END IF;
      v_released := v_released + v_hold.quantity;
    END LOOP;
    UPDATE public.inventory_reservation r SET reservation_status = 'RELEASED'
    FROM public.order_item oi WHERE oi.order_item_id = r.order_item_id
      AND oi.order_id = p_order_id AND r.reservation_status IN ('ACTIVE', 'CONFIRMED');
    UPDATE public.payment SET status = 'FAILED' WHERE order_id = p_order_id AND status = 'PENDING';
    UPDATE public.orders SET status = 'CANCELLED' WHERE order_id = p_order_id;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'refundId', r.refund_id, 'paymentId', r.payment_id, 'amount', r.amount::text,
    'status', r.status, 'transactionRef', r.transaction_ref
  ) ORDER BY r.refund_id), '[]'::jsonb) INTO v_refunds
  FROM public.payment_refund r JOIN public.payment p USING (payment_id)
  WHERE p.order_id = p_order_id;
  RETURN jsonb_build_object('orderId', p_order_id, 'alreadyCancelled', v_status = 'CANCELLED',
    'releasedQuantity', v_released, 'refunds', v_refunds,
    'message', CASE WHEN v_status = 'CANCELLED' THEN 'Order already cancelled; no changes made'
      WHEN jsonb_array_length(v_refunds) > 0 THEN 'Order cancelled, simulated refund recorded, and inventory holds released'
      ELSE 'Order cancelled and inventory holds released' END);
END;
$$;

-- Preserve the original function signature for existing callers, while removing
-- the unsafe implementation. Payment confirmation and reservation functions stay unchanged.
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id integer)
RETURNS text LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN public.cancel_order_with_refund(p_order_id)->>'message';
END;
$$;

COMMIT;

