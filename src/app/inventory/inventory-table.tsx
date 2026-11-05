"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { InventoryRecord, ProductOption, WarehouseOption } from "@/lib/inventory";
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
  products,
  threshold,
}: {
  records: InventoryRecord[];
  warehouses: WarehouseOption[];
  products: ProductOption[];
  threshold: number;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [viewMode, setViewMode] = useState<"twin" | "table" | "split">("split");
  const [restockProduct, setRestockProduct] = useState("");
  const [restockWarehouse, setRestockWarehouse] = useState("");
  const [restockQuantity, setRestockQuantity] = useState("");
  const [restockSending, setRestockSending] = useState(false);
  const [restockRefreshing, startRestockRefresh] = useTransition();
  const [restockUncertain, setRestockUncertain] = useState(false);
  const [restockNotice, setRestockNotice] = useState<{ error: boolean; text: string } | null>(null);
  const restockInFlight = useRef(false);

  const quantity = Number(restockQuantity);
  const restockReady =
    products.some((item) => String(item.product_id) === restockProduct) &&
    warehouses.some((item) => String(item.warehouse_id) === restockWarehouse) &&
    Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 2147483647;

  async function submitRestock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!restockReady || restockInFlight.current || restockSending || restockRefreshing || restockUncertain) return;
    restockInFlight.current = true;
    setRestockSending(true);
    setRestockNotice(null);
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: Number(restockProduct), warehouseId: Number(restockWarehouse), quantity }),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.success === true && Number.isSafeInteger(result.record?.stock_quantity)) {
        setRestockNotice({
          error: false,
          text: `Added ${quantity.toLocaleString("en-IN")} units. On hand now: ${Number(result.record.stock_quantity).toLocaleString("en-IN")}; reserved: ${Number(result.record.reserved_quantity).toLocaleString("en-IN")}; available: ${Number(result.record.available).toLocaleString("en-IN")}.`,
        });
        setRestockQuantity("");
        startRestockRefresh(() => router.refresh());
      } else if ([400, 404, 409].includes(response.status) && typeof result?.message === "string") {
        setRestockNotice({ error: true, text: result.message });
      } else {
        setRestockUncertain(true);
        setRestockNotice({ error: true, text: "The restock result could not be confirmed. Reload and inspect inventory before submitting again to avoid adding stock twice." });
      }
    } catch {
      setRestockUncertain(true);
      setRestockNotice({ error: true, text: "The connection was interrupted. Reload and inspect inventory before submitting again to avoid adding stock twice." });
    } finally {
      restockInFlight.current = false;
      setRestockSending(false);
    }
  }

  const query = search.trim().toLowerCase();
  const filtered = records.filter(
    (record) =>
      (!warehouse || String(record.warehouse_id) === warehouse) &&
      (!query ||
        record.product_name.toLowerCase().includes(query) ||
        (record.sku ?? "").toLowerCase().includes(query))
  );
  const hasFilters = search !== "" || warehouse !== "";
  const selectedWarehouseName = warehouses.find((option) => String(option.warehouse_id) === warehouse)?.name;

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
          <h2 className={styles.twinTitle}>Warehouse Digital Twin</h2>
          <p className={styles.twinDescription}>Explore warehouse stock visually.</p>
        </div>
        <div className={styles.headerControls}>
          <label className={styles.sharedWarehouse} htmlFor="inventory-warehouse">
            Select Warehouse
            <select id="inventory-warehouse" value={warehouse} onChange={(event) => setWarehouse(event.target.value)}>
              <option value="">All warehouses</option>
              {warehouses.map((option) => <option key={option.warehouse_id} value={String(option.warehouse_id)}>{option.name}</option>)}
            </select>
          </label>
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
      </div>

      <Panel title="Add Inventory / Restock" subtitle="Create stock for a product and warehouse, or add units to existing stock.">
        {restockNotice && <p className={`${styles.restockNotice} ${restockNotice.error ? styles.restockError : styles.restockSuccess}`} role={restockNotice.error ? "alert" : "status"}>{restockNotice.text}</p>}
        <form className={styles.restockForm} onSubmit={submitRestock}>
          <label className={styles.restockField}>Product
            <select required value={restockProduct} onChange={(event) => setRestockProduct(event.target.value)} disabled={restockSending || restockRefreshing || restockUncertain}>
              <option value="">Select product</option>
              {products.map((item) => <option key={item.product_id} value={item.product_id}>{item.product_name} ({item.sku})</option>)}
            </select>
          </label>
          <label className={styles.restockField}>Warehouse
            <select required value={restockWarehouse} onChange={(event) => setRestockWarehouse(event.target.value)} disabled={restockSending || restockRefreshing || restockUncertain}>
              <option value="">Select warehouse</option>
              {warehouses.map((item) => <option key={item.warehouse_id} value={item.warehouse_id}>{item.name}</option>)}
            </select>
          </label>
          <label className={styles.restockField}>Quantity to add
            <input type="number" min="1" max="2147483647" step="1" required placeholder="Enter units" value={restockQuantity} onChange={(event) => setRestockQuantity(event.target.value)} disabled={restockSending || restockRefreshing || restockUncertain} />
          </label>
          <div className={styles.restockActions}>
            <button className="button primary" type="submit" disabled={!restockReady || restockSending || restockRefreshing || restockUncertain}>{restockSending ? "Adding stock…" : restockRefreshing ? "Refreshing stock…" : "Add inventory / Restock"}</button>
            <span>On-hand stock increases; existing reservations stay unchanged.</span>
          </div>
        </form>
        {(!products.length || !warehouses.length) && <p className={styles.restockHint}>Create a product and warehouse before adding inventory.</p>}
        {restockUncertain && <div className={styles.restockRecovery}><button className="button" type="button" onClick={() => window.location.reload()}>Reload and review inventory</button></div>}
      </Panel>

      <div className={`${styles.viewContent} ${viewMode === "split" ? styles.splitView : ""}`}>
      {/* 3D Digital Twin Section */}
      {(viewMode === "twin" || viewMode === "split") && (
        <section className={styles.digitalTwinSection} aria-label="3D Warehouse Digital Twin">
          <p className={styles.warehouseContext} role="status">
            {selectedWarehouseName ? `Showing inventory for ${selectedWarehouseName}` : "Showing inventory for all warehouses"}
          </p>
          <WarehouseDigitalTwin
            records={records}
            selectedWarehouse={warehouse}
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
            Showing {filtered.length} of {records.length} inventory records{selectedWarehouseName ? ` for ${selectedWarehouseName}` : ""}
          </div>

          {!records.length ? (
            <EmptyState message="No inventory records have been added yet." />
          ) : !filtered.length ? (
            <EmptyState message="No inventory matches your filters. Try another product, SKU, or warehouse, or clear the filters." />
          ) : (
            <div className={viewMode === "split" ? styles.compactTable : undefined}>
            <DataTable
              caption="Inventory quantities by product and warehouse"
              headers={viewMode === "split" ? ["Product", "Warehouse", "Available", "Status"] : [
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
                    {viewMode === "split" ? <>
                      <td><strong>{record.product_name}</strong></td>
                      <td>{record.warehouse}</td>
                      <td className="numeric"><span className={`${styles.quantity} ${record.available <= 0 ? styles.out : record.available <= threshold ? styles.low : styles.available}`}>{record.available.toLocaleString("en-IN")}</span></td>
                      <td><StatusBadge status={status} /></td>
                    </> : <>
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
                    </>}
                  </tr>
                );
              })}
            </DataTable>
            </div>
          )}

          <div className="panel-footnote">
            Total quantity is stock on hand. Available = total − reserved. Low stock: 1–
            {threshold} available units. Out of stock: 0 or fewer. Refresh data to retrieve current
            quantities.
          </div>
        </Panel>
      )}
      </div>
    </div>
  );
}
