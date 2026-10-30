import "server-only";

export type InventoryRecord = {
  inventory_id: number;
  product_name: string;
  sku: string;
  warehouse_id: number;
  warehouse: string;
  total: number;
  reserved: number;
  available: number;
};
export type WarehouseOption = { warehouse_id: number; name: string };
export type InventorySnapshot = { records: InventoryRecord[]; warehouses: WarehouseOption[] };

export async function getInventory(): Promise<InventorySnapshot | null> {
  try {
    const { sql } = await import("@/lib/neon-http");
    // One SELECT keeps warehouse options and inventory in the same snapshot.
    const rows = await sql`
      WITH stock AS (
        SELECT i.inventory_id, p.product_name, p.sku, i.warehouse_id,
          w.name AS warehouse,
          COALESCE(i.stock_quantity, 0) AS total,
          COALESCE(i.reserved_quantity, 0) AS reserved,
          COALESCE(i.stock_quantity, 0) - COALESCE(i.reserved_quantity, 0) AS available
        FROM inventory i
        JOIN product p ON p.product_id = i.product_id
        JOIN warehouse w ON w.warehouse_id = i.warehouse_id
      )
      SELECT
        COALESCE((SELECT json_agg(stock ORDER BY product_name, warehouse, inventory_id) FROM stock), '[]') AS records,
        COALESCE((SELECT json_agg(options ORDER BY name, warehouse_id)
          FROM (SELECT warehouse_id, name FROM warehouse) options), '[]') AS warehouses
    `;
    return rows[0] as InventorySnapshot;
  } catch {
    console.error("OmniLock inventory: database read unavailable.");
    return null;
  }
}
