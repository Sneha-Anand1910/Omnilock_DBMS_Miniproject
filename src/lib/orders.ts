import "server-only";

export type OrderItem = { order_item_id: number; product: string; sku: string | null; quantity: number; unit_price: string | null };
export type ManagedOrder = { order_id: number; customer: string; channel: string | null; date: string | null; total_amount: string | null; status: string | null; items: OrderItem[] };

export async function getOrders(): Promise<ManagedOrder[] | null> {
  try {
    const { sql } = await import("@/lib/neon-http");
    const rows = await sql`
      SELECT o.order_id, COALESCE(c.name, 'Customer unavailable') AS customer,
        o.channel, to_char(o.order_date, 'DD Mon YYYY, HH24:MI') AS date,
        o.total_amount::text, o.status,
        COALESCE((SELECT json_agg(json_build_object(
          'order_item_id', oi.order_item_id,
          'product', COALESCE(p.product_name, 'Product unavailable'),
          'sku', p.sku, 'quantity', oi.quantity, 'unit_price', oi.unit_price::text
        ) ORDER BY oi.order_item_id)
        FROM order_item oi LEFT JOIN product p ON p.product_id = oi.product_id
        WHERE oi.order_id = o.order_id), '[]'::json) AS items
      FROM orders o LEFT JOIN customer c ON c.customer_id = o.customer_id
      ORDER BY o.order_date DESC NULLS LAST, o.order_id DESC
    `;
    return rows as ManagedOrder[];
  } catch {
    console.error("OmniLock orders: database read unavailable.");
    return null;
  }
}
