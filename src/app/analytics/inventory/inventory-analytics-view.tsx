"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DataTable, EmptyState, Panel, StatCard } from "@/components/omnilock/ui";
import type { InventoryAnalyticsData } from "@/lib/inventory-analytics";
import styles from "./inventory-analytics.module.css";

type Filters = { search: string; warehouseId: string; categoryId: string; threshold: string };
const initialFilters: Filters = { search: "", warehouseId: "", categoryId: "", threshold: "10" };

function formatQuantity(value: string) {
  try { return new Intl.NumberFormat("en-IN").format(BigInt(value)); }
  catch { return value || "0"; }
}

function percentage(value: string, total: string) {
  try {
    const amount = BigInt(value);
    const maximum = BigInt(total);
    if (maximum <= BigInt(0) || amount <= BigInt(0)) return 0;
    return Math.min(100, Number((amount * BigInt(100)) / maximum));
  } catch { return 0; }
}

export default function InventoryAnalyticsView() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [applied, setApplied] = useState<Filters>(initialFilters);
  const [data, setData] = useState<InventoryAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ threshold: applied.threshold });
    if (applied.search.trim()) params.set("search", applied.search.trim());
    if (applied.warehouseId) params.set("warehouseId", applied.warehouseId);
    if (applied.categoryId) params.set("categoryId", applied.categoryId);
    fetch(`/api/analytics/inventory?${params}`, { signal: controller.signal })
      .then(async response => {
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "Unable to load inventory analytics.");
        return result as InventoryAnalyticsData;
      })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load inventory analytics."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applied, revision]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setApplied({ ...filters, search: filters.search.trim() });
  }

  function clearFilters() {
    setLoading(true);
    setError("");
    setFilters(initialFilters);
    setApplied(initialFilters);
  }

  function refresh() {
    setLoading(true);
    setError("");
    setRevision(value => value + 1);
  }

  const topMaximum = data?.topProducts.reduce((maximum, product) => {
    try { return BigInt(product.quantityOrdered) > maximum ? BigInt(product.quantityOrdered) : maximum; }
    catch { return maximum; }
  }, BigInt(0)) ?? BigInt(0);

  return <div className={styles.root}>
    <div className="page-heading">
      <div><p className="eyebrow">INVENTORY INSIGHTS</p><h1>Inventory analytics</h1><p>Review stock levels, warehouse availability, and top ordered products.</p></div>
      <button className="button" disabled={loading} onClick={refresh}>{loading ? "Refreshing…" : "Refresh data"}</button>
    </div>

    <Panel title="Search and filters" subtitle="Filters apply to stock reports; product and category filters also apply to top ordered products.">
      <form className={styles.filters} onSubmit={applyFilters}>
        <label>Product search<input type="search" maxLength={100} value={filters.search} onChange={event => setFilters(value => ({ ...value, search: event.target.value }))} placeholder="Product name, SKU, or category" /></label>
        <label>Warehouse<select value={filters.warehouseId} onChange={event => setFilters(value => ({ ...value, warehouseId: event.target.value }))}><option value="">All warehouses</option>{(data?.filterOptions.warehouses ?? []).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        <label>Category<select value={filters.categoryId} onChange={event => setFilters(value => ({ ...value, categoryId: event.target.value }))}><option value="">All categories</option>{(data?.filterOptions.categories ?? []).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        <label>Low-stock threshold<input type="number" min="0" max="1000000" step="1" required value={filters.threshold} onChange={event => setFilters(value => ({ ...value, threshold: event.target.value }))} /></label>
        <div className={styles.filterActions}><button className="button primary" type="submit" disabled={loading}>Apply filters</button><button className="button" type="button" onClick={clearFilters} disabled={loading}>Clear filters</button></div>
      </form>
    </Panel>

    {error && <section className={styles.errorPanel} role="alert" aria-labelledby="analytics-error-title">
      <div className={styles.errorCopy}><span className={styles.errorIcon} aria-hidden="true">!</span><div><h2 id="analytics-error-title">Inventory analytics unavailable</h2><p>{error}</p></div></div>
      <button className="button" onClick={refresh}>Retry</button>
    </section>}
    {loading && <div className={styles.loading} role="status" aria-live="polite"><span className={styles.spinner} aria-hidden="true" />Loading inventory analytics…</div>}

    {data && !loading && !error && <>
      <section className={styles.summary} aria-label="Inventory summary" aria-busy={loading}>
        <StatCard label="Total products" value={data.summary.totalProducts} detail="Matching the product filters" icon="products" />
        <StatCard label="Total warehouses" value={data.summary.totalWarehouses} detail="Matching the warehouse filter" icon="warehouses" />
        <StatCard label="Physical stock" value={data.summary.physical} detail="On hand across filtered stock" icon="inventory" />
        <StatCard label="Reserved stock" value={data.summary.reserved} detail="Held in filtered stock" icon="lock" accent="violet" />
        <StatCard label="Available stock" value={data.summary.available} detail="Filtered physical minus reserved" icon="inventory" accent="teal" />
      </section>

      <Panel title="Stock distribution" subtitle="Physical, reserved, and available quantities for the current product and warehouse filters.">
        <div className={styles.distribution}>
          {([
            { label: "Physical stock", value: data.summary.physical, color: styles.physicalBar },
            { label: "Reserved stock", value: data.summary.reserved, color: styles.reservedBar },
            { label: "Available stock", value: data.summary.available, color: styles.availableBar },
          ]).map(item => <div className={styles.distributionRow} key={item.label}>
            <div className={styles.distributionLabel}><span>{item.label}</span><strong>{formatQuantity(item.value)}</strong></div>
            <div className={styles.distributionTrack} role="img" aria-label={`${item.label}: ${formatQuantity(item.value)}`}><span className={item.color} style={{ width: `${percentage(item.value, data.summary.physical)}%` }} /></div>
          </div>)}
        </div>
        <div className="panel-footnote">Bar lengths are relative to physical stock. Available quantity is physical stock minus reserved stock.</div>
      </Panel>

      <Panel title="Low-stock products" subtitle={`Products with available stock at or below ${applied.threshold} units`}>
        {data.lowStock.length === 0 ? <EmptyState message="No inventory locations match this low-stock threshold and filter set." /> :
          <DataTable caption="Low stock by product and warehouse" headers={["Product name", "SKU", "Warehouse", "Physical", "Reserved", "Available"]}>
            {data.lowStock.map(item => <tr key={item.inventoryId}><td><strong>{item.productName}</strong></td><td>{item.sku ?? "—"}</td><td>{item.warehouse}</td><td className="numeric">{formatQuantity(item.physical)}</td><td className="numeric">{formatQuantity(item.reserved)}</td><td className="numeric"><span className={item.available.startsWith("-") || item.available === "0" ? styles.zero : styles.low}>{formatQuantity(item.available)}</span></td></tr>)}
          </DataTable>}
        <div className="panel-footnote">Available quantity is physical stock minus reserved stock. The threshold only filters this report; it does not change inventory.</div>
      </Panel>

      <div className={styles.reports}>
        <Panel title="Warehouse stock overview" subtitle="Stocked product counts and quantities by warehouse">
          {data.warehouses.length === 0 ? <EmptyState message="No warehouses match the current filters." /> : <>
            <DataTable caption="Stock totals by warehouse" headers={["Warehouse", "Stocked products", "Physical", "Reserved", "Available"]}>
              {data.warehouses.map(item => <tr key={item.warehouseId}><td><strong>{item.warehouse}</strong></td><td className="numeric">{formatQuantity(item.stockedProducts)}</td><td className="numeric">{formatQuantity(item.physical)}</td><td className="numeric">{formatQuantity(item.reserved)}</td><td className="numeric">{formatQuantity(item.available)}</td></tr>)}
            </DataTable>
            <div className={styles.bars} aria-label="Available stock proportion by warehouse">
              {data.warehouses.map(item => <div className={styles.barRow} key={`bar-${item.warehouseId}`}><span>{item.warehouse}</span><div className={styles.track} role="img" aria-label={`${item.warehouse}: ${formatQuantity(item.available)} available of ${formatQuantity(item.physical)} physical`}><span style={{ width: `${percentage(item.available, item.physical)}%` }} /></div><strong>{formatQuantity(item.available)}</strong></div>)}
            </div>
          </>}
        </Panel>

        <Panel title="Top ordered products" subtitle="Top 10 by total order-item quantity; order counts use distinct orders">
          {data.topProducts.length === 0 ? <EmptyState message="No order items match the current product filters." /> : <>
            <DataTable caption="Top ordered products" headers={["Rank", "Product", "SKU", "Quantity ordered", "Orders"]}>
              {data.topProducts.map(item => <tr key={item.productId}><td>{item.rank}</td><td><strong>{item.productName}</strong></td><td>{item.sku ?? "—"}</td><td className="numeric">{formatQuantity(item.quantityOrdered)}</td><td className="numeric">{formatQuantity(item.orderCount)}</td></tr>)}
            </DataTable>
            <div className={styles.bars} aria-label="Relative order quantities">
              {data.topProducts.map(item => {
                let width = 0;
                try { width = topMaximum > BigInt(0) ? Number((BigInt(item.quantityOrdered) * BigInt(100)) / topMaximum) : 0; } catch { width = 0; }
                return <div className={styles.barRow} key={`top-${item.productId}`}><span>{item.productName}</span><div className={`${styles.track} ${styles.orderTrack}`} role="img" aria-label={`${item.productName}: ${formatQuantity(item.quantityOrdered)} ordered`}><span style={{ width: `${Math.min(100, width)}%` }} /></div><strong>{formatQuantity(item.quantityOrdered)}</strong></div>;
              })}
            </div>
          </>}
          <div className="panel-footnote">Order totals are based on all matching order items. Warehouse selection does not affect this report because order items have no warehouse assignment.</div>
        </Panel>
      </div>
    </>}
  </div>;
}
