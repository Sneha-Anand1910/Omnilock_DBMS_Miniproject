import "server-only";

export const LOW_STOCK_THRESHOLD = 10;
export type InventoryRow = { inventory_id: number; product_name: string; sku: string; warehouse: string; stock: number; reserved: number; available: number };
export type OrderRow = { order_id: number; customer: string; order_date: string | null; channel: string; status: string };
export type DashboardData = {
  stats: { products: string; orders: string; available: string; reserved: string; active: string; confirmed: string; low_stock: string };
  orders: OrderRow[]; inventory: InventoryRow[]; alerts: InventoryRow[]; updated: string;
};

export type RoleDashboard = {
  warehouses?: string; inventoryUnits?: string; revenue?: string; users?: string;
  admins?: string; staff?: string; pendingFulfillment: string;
  pendingShipments: string; pendingOrders?: string; pendingPayments?: string;
  awaitingDispatch?: string;
  activity?: { audit_id: number; actor: string; target: string; event_type: string; created_at: string }[];
};

export async function getRoleDashboard(role: "ADMIN" | "STAFF"): Promise<RoleDashboard | null> {
  try {
    const { sql } = await import("@/lib/neon-http");
    if (role === "ADMIN") {
      const rows = await sql`
        SELECT
          (SELECT count(*)::text FROM public.warehouse) AS warehouses,
          (SELECT COALESCE(sum(stock_quantity), 0)::text FROM public.inventory) AS "inventoryUnits",
          (SELECT COALESCE(sum(amount), 0)::text FROM public.payment WHERE status = 'SUCCESS') AS revenue,
          (SELECT count(*)::text FROM public.omnilock_account) AS users,
          (SELECT count(*)::text FROM public.omnilock_account WHERE role = 'ADMIN') AS admins,
          (SELECT count(*)::text FROM public.omnilock_account WHERE role = 'STAFF') AS staff,
          (SELECT count(*)::text FROM public.fulfillment WHERE status IN ('PENDING', 'PROCESSING', 'PACKED')) AS "pendingFulfillment",
          (SELECT count(*)::text FROM public.shipment WHERE status = 'PENDING') AS "pendingShipments"
      `;
      const ready = await sql`SELECT to_regclass('public.omnilock_admin_audit') IS NOT NULL AS ready`;
      const activity = ready[0]?.ready ? await sql`
        SELECT log.audit_id, actor.full_name AS actor, target.full_name AS target,
          log.event_type, log.created_at
        FROM public.omnilock_admin_audit log
        JOIN public.omnilock_account actor ON actor.account_id = log.actor_id
        JOIN public.omnilock_account target ON target.account_id = log.target_id
        ORDER BY log.created_at DESC, log.audit_id DESC LIMIT 5
      ` : [];
      return { ...rows[0], activity } as RoleDashboard;
    }
    const rows = await sql`
      SELECT
        (SELECT count(*)::text FROM public.orders WHERE status = 'PENDING') AS "pendingOrders",
        (SELECT count(*)::text FROM public.orders o WHERE o.status = 'PENDING'
          AND NOT EXISTS (SELECT 1 FROM public.payment p WHERE p.order_id = o.order_id AND p.status = 'SUCCESS')) AS "pendingPayments",
        (SELECT count(*)::text FROM public.fulfillment WHERE status IN ('PENDING', 'PROCESSING', 'PACKED')) AS "pendingFulfillment",
        (SELECT count(*)::text FROM public.shipment WHERE status = 'PENDING') AS "pendingShipments",
        (SELECT count(*)::text FROM public.shipment s JOIN public.fulfillment f ON f.fulfillment_id = s.fulfillment_id
          WHERE s.status = 'PENDING' AND f.status = 'PACKED') AS "awaitingDispatch"
    `;
    return rows[0] as RoleDashboard;
  } catch {
    console.error("OmniLock role dashboard: statistics unavailable.");
    return null;
  }
}

export async function getDashboard(): Promise<DashboardData | null> {
  try {
    // Import here so a missing configuration renders an honest unavailable state.
    const { sql } = await import("@/lib/neon-http");
    // One read-only statement gives every panel the same PostgreSQL snapshot.
    const rows = await sql`
      WITH availability AS (
        SELECT i.inventory_id, p.product_name, p.sku, w.name AS warehouse,
          COALESCE(i.stock_quantity, 0) AS stock,
          COALESCE(i.reserved_quantity, 0) AS reserved,
          COALESCE(i.stock_quantity, 0) - COALESCE(i.reserved_quantity, 0) AS available
        FROM inventory i JOIN product p USING (product_id) JOIN warehouse w USING (warehouse_id)
      ), recent AS (
        SELECT o.order_id, COALESCE(c.name, 'Customer unavailable') AS customer,
          o.order_date AT TIME ZONE 'UTC' AS order_date, o.order_date AS sort_date, o.channel, o.status
        FROM orders o LEFT JOIN customer c USING (customer_id)
        ORDER BY o.order_date DESC NULLS LAST, o.order_id DESC LIMIT 6
      )
      SELECT json_build_object(
        'products', (SELECT count(*)::text FROM product),
        'orders', (SELECT count(*)::text FROM orders),
        'available', (SELECT COALESCE(sum(COALESCE(stock_quantity,0) - COALESCE(reserved_quantity,0)),0)::text FROM inventory),
        'reserved', (SELECT COALESCE(sum(reserved_quantity),0)::text FROM inventory),
        'active', (SELECT count(*)::text FROM inventory_reservation WHERE reservation_status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP),
        'confirmed', (SELECT count(*)::text FROM orders WHERE status = 'CONFIRMED'),
        'low_stock', (SELECT count(*)::text FROM availability WHERE available <= ${LOW_STOCK_THRESHOLD})
      ) AS stats,
      COALESCE((SELECT json_agg(recent ORDER BY sort_date DESC NULLS LAST, order_id DESC) FROM recent), '[]') AS orders,
      COALESCE((SELECT json_agg(a ORDER BY available, inventory_id) FROM (SELECT * FROM availability ORDER BY available, inventory_id LIMIT 8) a), '[]') AS inventory,
      COALESCE((SELECT json_agg(a ORDER BY available, inventory_id) FROM (SELECT * FROM availability WHERE available <= ${LOW_STOCK_THRESHOLD} ORDER BY available, inventory_id LIMIT 5) a), '[]') AS alerts
    `;
    return { ...rows[0], updated: new Date().toISOString() } as DashboardData;
  } catch {
    // Never send database error details or connection information to the browser.
    console.error("OmniLock dashboard: database read unavailable.");
    return null;
  }
}

