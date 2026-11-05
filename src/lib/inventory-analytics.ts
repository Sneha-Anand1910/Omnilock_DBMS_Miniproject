import "server-only";

export type InventoryAnalyticsFilters = {
  search: string;
  warehouseId: number | null;
  categoryId: number | null;
  threshold: number;
};

export type InventoryAnalyticsData = {
  summary: {
    totalProducts: string;
    totalWarehouses: string;
    physical: string;
    reserved: string;
    available: string;
  };
  lowStock: {
    inventoryId: string;
    productId: string;
    productName: string;
    sku: string | null;
    warehouse: string;
    physical: string;
    reserved: string;
    available: string;
  }[];
  warehouses: {
    warehouseId: string;
    warehouse: string;
    stockedProducts: string;
    physical: string;
    reserved: string;
    available: string;
  }[];
  topProducts: {
    rank: string;
    productId: string;
    productName: string;
    sku: string | null;
    quantityOrdered: string;
    orderCount: string;
  }[];
  filterOptions: {
    warehouses: { id: string; name: string }[];
    categories: { id: string; name: string }[];
  };
};

function safeDatabaseDiagnostic(error: unknown) {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : null;
  const code = typeof record?.code === "string" && /^[0-9A-Z]{5}$/.test(record.code) ? record.code : "UNKNOWN";
  const rawMessage = typeof record?.message === "string" ? record.message : "Database request failed.";
  const message = rawMessage
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[redacted connection string]")
    .replace(/(password|passwd|pwd|DATABASE_URL)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 400);
  return { code, message };
}

export async function getInventoryAnalytics(filters: InventoryAnalyticsFilters): Promise<InventoryAnalyticsData | null> {
  try {
    const { sql } = await import("@/lib/neon-http");
    const rows = await sql`
      WITH filtered_products AS (
        SELECT p.product_id, p.product_name, p.sku, p.category_id
        FROM public.product p
        LEFT JOIN public.category c ON c.category_id = p.category_id
        WHERE (${filters.search} = '' OR strpos(
          lower(concat_ws(' ', p.product_name, p.sku, c.category_name)),
          lower(${filters.search})
        ) > 0)
          AND (${filters.categoryId}::integer IS NULL OR p.category_id = ${filters.categoryId})
      ), selected_warehouses AS (
        SELECT w.warehouse_id, w.name
        FROM public.warehouse w
        WHERE (${filters.warehouseId}::integer IS NULL OR w.warehouse_id = ${filters.warehouseId})
      ), stock AS (
        SELECT i.inventory_id, p.product_id, p.product_name, p.sku,
          w.warehouse_id, w.name AS warehouse,
          COALESCE(i.stock_quantity, 0)::numeric AS physical,
          COALESCE(i.reserved_quantity, 0)::numeric AS reserved,
          (COALESCE(i.stock_quantity, 0) - COALESCE(i.reserved_quantity, 0))::numeric AS available
        FROM public.inventory i
        JOIN filtered_products p ON p.product_id = i.product_id
        JOIN selected_warehouses w ON w.warehouse_id = i.warehouse_id
      ), summary AS (
        SELECT
          (SELECT count(*)::text FROM filtered_products) AS "totalProducts",
          (SELECT count(*)::text FROM selected_warehouses) AS "totalWarehouses",
          COALESCE(sum(physical), 0)::text AS physical,
          COALESCE(sum(reserved), 0)::text AS reserved,
          COALESCE(sum(available), 0)::text AS available
        FROM stock
      ), warehouse_report AS (
        SELECT w.warehouse_id::text AS "warehouseId", w.name AS warehouse,
          count(DISTINCT s.product_id)::text AS "stockedProducts",
          COALESCE(sum(s.physical), 0)::text AS physical,
          COALESCE(sum(s.reserved), 0)::text AS reserved,
          COALESCE(sum(s.available), 0)::text AS available
        FROM selected_warehouses w
        LEFT JOIN stock s ON s.warehouse_id = w.warehouse_id
        GROUP BY w.warehouse_id, w.name
      ), ordered_products AS (
        SELECT p.product_id, p.product_name, p.sku,
          COALESCE(sum(oi.quantity), 0)::text AS quantity_ordered,
          count(DISTINCT oi.order_id)::text AS order_count
        FROM filtered_products p
        JOIN public.order_item oi ON oi.product_id = p.product_id
        JOIN public.orders o ON o.order_id = oi.order_id
        GROUP BY p.product_id, p.product_name, p.sku
      ), ranked_products AS (
        SELECT row_number() OVER (ORDER BY quantity_ordered::numeric DESC, order_count::numeric DESC, product_name, product_id)::text AS rank,
          product_id::text AS "productId", product_name AS "productName", sku,
          quantity_ordered AS "quantityOrdered", order_count AS "orderCount"
        FROM ordered_products
      )
      SELECT
        (SELECT row_to_json(summary) FROM summary) AS summary,
        COALESCE((SELECT json_agg(row_to_json(low) ORDER BY low.available::numeric, low.product_name, low.warehouse)
          FROM (
            SELECT inventory_id::text AS "inventoryId", product_id::text AS "productId", product_name AS "productName", sku, warehouse,
              physical::text AS physical, reserved::text AS reserved, available::text AS available
            FROM stock WHERE available <= ${filters.threshold}
          ) low), '[]'::json) AS low_stock,
        COALESCE((SELECT json_agg(row_to_json(report) ORDER BY report.warehouse)
          FROM (SELECT * FROM warehouse_report) report), '[]'::json) AS warehouses,
        COALESCE((SELECT json_agg(row_to_json(top_product) ORDER BY top_product.rank::integer)
          FROM (SELECT * FROM ranked_products ORDER BY rank::integer LIMIT 10) top_product), '[]'::json) AS top_products,
        json_build_object(
          'warehouses', COALESCE((SELECT json_agg(json_build_object('id', w.warehouse_id::text, 'name', w.name) ORDER BY w.name, w.warehouse_id) FROM public.warehouse w), '[]'::json),
          'categories', COALESCE((SELECT json_agg(json_build_object('id', c.category_id::text, 'name', c.category_name) ORDER BY c.category_name, c.category_id) FROM public.category c), '[]'::json)
        ) AS filter_options
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      summary: row.summary,
      lowStock: row.low_stock,
      warehouses: row.warehouses,
      topProducts: row.top_products,
      filterOptions: row.filter_options,
    } as InventoryAnalyticsData;
  } catch (error) {
    const diagnostic = safeDatabaseDiagnostic(error);
    console.error(`OmniLock inventory analytics database read failed [${diagnostic.code}]: ${diagnostic.message}`);
    return null;
  }
}
