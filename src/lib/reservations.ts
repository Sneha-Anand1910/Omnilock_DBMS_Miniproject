import "server-only";

export type ReservationRow = { reservation_id: number; order_id: number; customer: string; product: string; sku: string | null; warehouse: string; quantity: number; status: string | null; channel: string | null; expires: string | null; overdue: boolean };
export type ReservationData = {
  reservations: ReservationRow[];
  customers: { id: number; name: string }[];
  products: { id: number; name: string; sku: string | null }[];
  warehouses: { id: number; name: string }[];
  inventory: { product_id: number; warehouse_id: number; available: number }[];
};

export async function getReservations(): Promise<ReservationData | null> {
  try {
    const { sql } = await import("@/lib/neon-http");
    const rows = await sql`
      WITH records AS (
        SELECT r.reservation_id, o.order_id, COALESCE(c.name, 'Customer unavailable') AS customer,
          COALESCE(p.product_name, 'Product unavailable') AS product, p.sku,
          COALESCE(w.name, 'Warehouse unavailable') AS warehouse,
          r.reserved_quantity AS quantity, r.reservation_status AS status, o.channel,
          to_char(r.expires_at, 'DD Mon YYYY, HH24:MI:SS') AS expires,
          COALESCE(r.reservation_status = 'ACTIVE' AND r.expires_at <= CURRENT_TIMESTAMP, false) AS overdue
        FROM inventory_reservation r
        LEFT JOIN order_item oi ON oi.order_item_id = r.order_item_id
        LEFT JOIN orders o ON o.order_id = oi.order_id
        LEFT JOIN customer c ON c.customer_id = o.customer_id
        LEFT JOIN product p ON p.product_id = oi.product_id
        LEFT JOIN inventory i ON i.inventory_id = r.inventory_id
        LEFT JOIN warehouse w ON w.warehouse_id = i.warehouse_id
      )
      SELECT
        COALESCE((SELECT json_agg(records ORDER BY reservation_id DESC) FROM records), '[]') AS reservations,
        COALESCE((SELECT json_agg(c ORDER BY name, id) FROM (SELECT customer_id AS id, name FROM customer) c), '[]') AS customers,
        COALESCE((SELECT json_agg(p ORDER BY name, id) FROM (SELECT product_id AS id, product_name AS name, sku FROM product) p), '[]') AS products,
        COALESCE((SELECT json_agg(w ORDER BY name, id) FROM (SELECT warehouse_id AS id, name FROM warehouse) w), '[]') AS warehouses,
        COALESCE((SELECT json_agg(i) FROM (SELECT product_id, warehouse_id,
          COALESCE(stock_quantity, 0) - COALESCE(reserved_quantity, 0) AS available FROM inventory) i), '[]') AS inventory
    `;
    return rows[0] as ReservationData;
  } catch {
    console.error("OmniLock reservations: database read unavailable.");
    return null;
  }
}
