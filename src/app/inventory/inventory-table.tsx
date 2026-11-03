"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { InventoryRecord, WarehouseOption } from "@/lib/inventory";
import { DataTable, EmptyState, Panel, StatusBadge } from "@/components/omnilock/ui";
import { Icon } from "@/components/omnilock/icons";
import { playHoverSound, playInspectSound } from "@/lib/sound";
import styles from "./inventory.module.css";

// Dynamic load for 3D Warehouse Digital Twin
const WarehouseDigitalTwin = dynamic(
  () => import("@/components/3d/warehouse-digital-twin"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: "480px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(10, 18, 34, 0.8)",
          borderRadius: "16px",
          color: "var(--cyan)",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: "12px",
        }}
      >
        Initializing 3D Warehouse Digital Twin…
      </div>
    ),
  }
);

export default function InventoryTable({
  records,
  warehouses,
  threshold,
}: {
  records: InventoryRecord[];
  warehouses: WarehouseOption[];
  threshold: number;
}) {
  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [viewMode, setViewMode] = useState<"twin" | "table" | "split">("split");

  const query = search.trim().toLowerCase();
  const filtered = records.filter(
    (record) =>
      (!warehouse || String(record.warehouse_id) === warehouse) &&
      (!query ||
        record.product_name.toLowerCase().includes(query) ||
        (record.sku ?? "").toLowerCase().includes(query))
  );
  const hasFilters = search !== "" || warehouse !== "";

  const handleTwinRecordSelect = (record: InventoryRecord) => {
    setSearch(record.sku || record.product_name);
    if (record.warehouse_id) {
      setWarehouse(String(record.warehouse_id));
    }
  };

  return (
    <div className={styles.inventoryContainer}>
      {/* Top Workspace Viewport Mode Switcher */}
      <div className={styles.twinHeaderBar}>
        <div>
          <span className={styles.twinEyebrow}>SPATIAL INVENTORY MATRIX</span>
          <h2 className={styles.twinTitle}>Warehouse Digital Twin &amp; Stock Grid</h2>
        </div>
        <div className={styles.viewModePills}>
          <button
            type="button"
            className={`${styles.modePill} ${viewMode === "twin" ? styles.modeActive : ""}`}
            onClick={() => {
              setViewMode("twin");
              playHoverSound();
            }}
          >
            <Icon name="cube3d" /> 3D TWIN
          </button>
          <button
            type="button"
            className={`${styles.modePill} ${viewMode === "split" ? styles.modeActive : ""}`}
            onClick={() => {
              setViewMode("split");
              playHoverSound();
            }}
          >
            SPLIT VIEW
          </button>
          <button
            type="button"
            className={`${styles.modePill} ${viewMode === "table" ? styles.modeActive : ""}`}
            onClick={() => {
              setViewMode("table");
              playHoverSound();
            }}
          >
            <Icon name="viewTable" /> DATA GRID
          </button>
        </div>
      </div>

      {/* 3D Digital Twin Section */}
      {(viewMode === "twin" || viewMode === "split") && (
        <section className={styles.digitalTwinSection} aria-label="3D Warehouse Digital Twin">
          <WarehouseDigitalTwin
            records={records}
            warehouses={warehouses}
            threshold={threshold}
            onSelectRecord={handleTwinRecordSelect}
          />
        </section>
      )}

      {/* Tactical Data Grid Section */}
      {(viewMode === "table" || viewMode === "split") && (
        <Panel
          title="Inventory availability"
          subtitle="Actual stock by product and warehouse"
          action={
            viewMode === "table" ? (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setViewMode("split");
                  playInspectSound();
                }}
                style={{ fontSize: "11px", padding: "6px 12px" }}
              >
                <Icon name="cube3d" /> Open 3D Twin
              </button>
            ) : undefined
          }
        >
          <div className={styles.filters} role="search" aria-label="Filter inventory">
            <div className={styles.search}>
              <label htmlFor="inventory-search">Product name or SKU</label>
              <input
                id="inventory-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products or SKUs…"
              />
            </div>
            <div className={styles.warehouse}>
              <label htmlFor="inventory-warehouse">Warehouse</label>
              <select
                id="inventory-warehouse"
                value={warehouse}
                onChange={(event) => setWarehouse(event.target.value)}
              >
                <option value="">All warehouses</option>
                {warehouses.map((option) => (
                  <option key={option.warehouse_id} value={String(option.warehouse_id)}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="button"
              disabled={!hasFilters}
              onClick={() => {
                setSearch("");
                setWarehouse("");
                playHoverSound();
              }}
            >
              Clear filters
            </button>
          </div>

          <div className={styles.results} role="status" aria-live="polite">
            Showing {filtered.length} of {records.length} inventory records
          </div>

          {!records.length ? (
            <EmptyState message="No inventory records have been added yet." />
          ) : !filtered.length ? (
            <EmptyState message="No inventory matches your filters. Try another product, SKU, or warehouse, or clear the filters." />
          ) : (
            <DataTable
              caption="Inventory quantities by product and warehouse"
              headers={[
                "Product name",
                "SKU",
                "Warehouse",
                "Total quantity",
                "Reserved",
                "Available",
                "Stock status",
              ]}
            >
              {filtered.map((record) => {
                const status =
                  record.available <= 0
                    ? "OUT OF STOCK"
                    : record.available <= threshold
                    ? "LOW STOCK"
                    : "AVAILABLE";
                return (
                  <tr key={record.inventory_id}>
                    <td>
                      <strong>{record.product_name}</strong>
                    </td>
                    <td>
                      <span className={styles.skuTag}>{record.sku ?? "—"}</span>
                    </td>
                    <td>{record.warehouse}</td>
                    <td className="numeric">{record.total.toLocaleString("en-IN")}</td>
                    <td className="numeric muted">{record.reserved.toLocaleString("en-IN")}</td>
                    <td className="numeric">
                      <span
                        className={`${styles.quantity} ${
                          record.available <= 0
                            ? styles.out
                            : record.available <= threshold
                            ? styles.low
                            : styles.available
                        }`}
                      >
                        {record.available.toLocaleString("en-IN")}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={status} />
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          )}

          <div className="panel-footnote">
            Total quantity is stock on hand. Available = total − reserved. Low stock: 1–
            {threshold} available units. Out of stock: 0 or fewer. Refresh data to retrieve current
            quantities.
          </div>
        </Panel>
      )}
    </div>
  );
}
