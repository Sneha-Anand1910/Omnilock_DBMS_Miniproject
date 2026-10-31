"use client";

import { useState } from "react";
import type { InventoryRecord, WarehouseOption } from "@/lib/inventory";
import { DataTable, EmptyState, Panel, StatusBadge } from "@/components/omnilock/ui";
import styles from "./inventory.module.css";

export default function InventoryTable({ records, warehouses, threshold }: {
  records: InventoryRecord[]; warehouses: WarehouseOption[]; threshold: number;
}) {
  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const query = search.trim().toLowerCase();
  const filtered = records.filter(record =>
    (!warehouse || String(record.warehouse_id) === warehouse) &&
    (!query || record.product_name.toLowerCase().includes(query) || (record.sku ?? "").toLowerCase().includes(query))
  );
  const hasFilters = search !== "" || warehouse !== "";

  return <Panel title="Inventory availability" subtitle="Actual stock by product and warehouse">
    <div className={styles.filters} role="search" aria-label="Filter inventory">
      <div className={styles.search}><label htmlFor="inventory-search">Product name or SKU</label><input id="inventory-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search products or SKUs…" /></div>
      <div className={styles.warehouse}><label htmlFor="inventory-warehouse">Warehouse</label><select id="inventory-warehouse" value={warehouse} onChange={event => setWarehouse(event.target.value)}><option value="">All warehouses</option>{warehouses.map(option => <option key={option.warehouse_id} value={String(option.warehouse_id)}>{option.name}</option>)}</select></div>
      <button className="button" disabled={!hasFilters} onClick={() => { setSearch(""); setWarehouse(""); }}>Clear filters</button>
    </div>
    <div className={styles.results} role="status" aria-live="polite">Showing {filtered.length} of {records.length} inventory records</div>
    {!records.length ? <EmptyState message="No inventory records have been added yet." /> : !filtered.length ? <EmptyState message="No inventory matches your filters. Try another product, SKU, or warehouse, or clear the filters." /> :
      <DataTable caption="Inventory quantities by product and warehouse" headers={["Product name", "SKU", "Warehouse", "Total quantity", "Reserved", "Available", "Stock status"]}>
        {filtered.map(record => {
          const status = record.available <= 0 ? "OUT OF STOCK" : record.available <= threshold ? "LOW STOCK" : "AVAILABLE";
          return <tr key={record.inventory_id}>
            <td><strong>{record.product_name}</strong></td><td>{record.sku ?? "—"}</td><td>{record.warehouse}</td>
            <td className="numeric">{record.total.toLocaleString("en-IN")}</td><td className="numeric">{record.reserved.toLocaleString("en-IN")}</td>
            <td className="numeric"><span className={`${styles.quantity} ${record.available <= 0 ? styles.out : record.available <= threshold ? styles.low : styles.available}`}>{record.available.toLocaleString("en-IN")}</span></td>
            <td><StatusBadge status={status} /></td>
          </tr>;
        })}
      </DataTable>}
    <div className="panel-footnote">Total quantity is stock on hand. Available = total − reserved. Low stock: 1–{threshold} available units. Out of stock: 0 or fewer. Refresh data to retrieve current quantities.</div>
  </Panel>;
}
