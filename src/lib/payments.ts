import "server-only";

export type PaymentRecord = { payment_id: number; order_id: number; customer: string; amount: string; method: string; transaction_ref: string | null; status: string; date: string | null };
export type PayableOrder = { order_id: number; customer: string; amount: string };
export type PaymentsData = { history: PaymentRecord[]; eligible: PayableOrder[] };

export async function getPayments(): Promise<PaymentsData | null> {
  try {
    const { sql } = await import("@/lib/neon-http");
    const rows = await sql`
      WITH history AS (
        SELECT p.payment_id, p.order_id, COALESCE(c.name, 'Customer unavailable') AS customer,
          p.amount::text, p.method, p.transaction_ref, p.status,
          to_char(p.payment_date, 'DD Mon YYYY, HH24:MI:SS') AS date, p.payment_date AS sort_date
        FROM payment p LEFT JOIN orders o ON o.order_id = p.order_id
        LEFT JOIN customer c ON c.customer_id = o.customer_id
      ), eligible AS (
        SELECT o.order_id, COALESCE(c.name, 'Customer unavailable') AS customer, o.total_amount::text AS amount
        FROM orders o LEFT JOIN customer c ON c.customer_id = o.customer_id
        WHERE o.status = 'PENDING' AND o.total_amount > 0
          AND NOT EXISTS (SELECT 1 FROM payment p WHERE p.order_id = o.order_id AND p.status = 'SUCCESS')
          AND EXISTS (SELECT 1 FROM order_item oi WHERE oi.order_id = o.order_id)
          AND NOT EXISTS (SELECT 1 FROM order_item oi WHERE oi.order_id = o.order_id AND NOT EXISTS (
            SELECT 1 FROM inventory_reservation r WHERE r.order_item_id = oi.order_item_id
              AND r.reservation_status = 'ACTIVE' AND r.expires_at > CURRENT_TIMESTAMP
          ))
      ) SELECT
        COALESCE((SELECT json_agg(history ORDER BY sort_date DESC NULLS LAST, payment_id DESC) FROM history), '[]') AS history,
        COALESCE((SELECT json_agg(eligible ORDER BY order_id DESC) FROM eligible), '[]') AS eligible
    `;
    return rows[0] as PaymentsData;
  } catch {
    console.error("OmniLock payments: database read unavailable.");
    return null;
  }
}
