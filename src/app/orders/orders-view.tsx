"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ManagedOrder } from "@/lib/orders";
import { DataTable, EmptyState, Panel, StatusBadge } from "@/components/omnilock/ui";
import styles from "./orders.module.css";

// Matches cancel_order's current status restrictions; the API rechecks under a lock.
const canCancel = (status: string | null) => status !== "CANCELLED" && status !== "FULFILLED";
const amount = (value: string | null) => value ?? "—";

export default function OrdersView({ orders }: { orders: ManagedOrder[] | null }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [cancelled, setCancelled] = useState<number[]>([]);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [refreshing, startTransition] = useTransition();
  const inFlight = useRef(false);
  const detailsRef = useRef<HTMLElement>(null);
  const effectiveStatus = (order: ManagedOrder) => cancelled.includes(order.order_id) ? "CANCELLED" : order.status;
  const statuses = Array.from(new Set((orders ?? []).map(order => effectiveStatus(order) ?? "UNKNOWN"))).sort();
  // Preserve the chosen filter even when cancellation removes its last matching row.
  if (status && !statuses.includes(status)) statuses.push(status);
  const query = search.trim().replace(/^#/, "");
  const filtered = (orders ?? []).filter(order => String(order.order_id).includes(query) && (!status || (effectiveStatus(order) ?? "UNKNOWN") === status));
  const selected = orders?.find(order => order.order_id === selectedId);
  const busy = pendingId !== null || refreshing;
  function refresh() { startTransition(() => router.refresh()); }

  async function cancelOrder(order: ManagedOrder) {
    if (inFlight.current || busy || !canCancel(effectiveStatus(order))) return;
    if (!window.confirm(`Cancel order #${order.order_id}? Active inventory reservations will be released. This cannot be undone here.`)) return;
    inFlight.current = true;
    setPendingId(order.order_id);
    setNotice(null);
    try {
      const response = await fetch(`/api/orders/${order.order_id}/cancel`, { method: "POST" });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success !== true) {
        // Show only known business-rule messages, never arbitrary database errors.
        const message = typeof result?.message === "string" ? result.message : "";
        const safeMessage = /^Cannot cancel order with status (CANCELLED|FULFILLED)$/.test(message) || /^Order \d+ not found$/.test(message)
          ? message : "Cancellation was not confirmed. Refresh and check the order status before retrying.";
        setNotice({ kind: "error", text: safeMessage });
      } else {
        setCancelled(current => [...current, order.order_id]);
        setNotice({ kind: "success", text: `Order #${order.order_id} cancelled successfully. Active inventory reservations were released.` });
      }
      refresh();
    } catch {
      setNotice({ kind: "error", text: "The cancellation response could not be received. Refresh and check the order status before retrying." });
      refresh();
    } finally {
      inFlight.current = false;
      setPendingId(null);
    }
  }

  function cancelButton(order: ManagedOrder) {
    const permitted = canCancel(effectiveStatus(order));
    return <button className={`button ${styles.cancel}`} disabled={!permitted || busy} title={!permitted ? "Cancelled and fulfilled orders cannot be cancelled." : undefined} onClick={() => void cancelOrder(order)}>{pendingId === order.order_id ? "Cancelling…" : "Cancel order"}</button>;
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">ORDER OPERATIONS</p><h1>Orders management</h1><p>Review orders, inspect products, and manage cancellations.</p></div><button className="button" disabled={busy} onClick={refresh}>{refreshing ? "Refreshing…" : "Refresh data"}</button></div>
    {notice && <div className={`${styles.notice} ${notice.kind === "error" ? styles.error : styles.success}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</div>}
    {orders === null ? <Panel title="Orders unavailable" subtitle="We could not load orders from the database."><p className={styles.notice} role="alert">Please use Refresh data to try again. No order data is shown while the connection is unavailable.</p></Panel> : <>
      <Panel title="All orders" subtitle="Latest orders first · Dates and amounts as stored in the database">
        <div className={styles.filters} role="search" aria-label="Filter orders">
          <label>Order ID<input type="search" placeholder="Search order ID, e.g. #5" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <button className="button" disabled={!search && !status} onClick={() => { setSearch(""); setStatus(""); }}>Clear filters</button>
        </div>
        <p className={styles.count} role="status">Showing {filtered.length} of {orders.length} orders</p>
        {!orders.length ? <EmptyState message="No orders yet." /> : !filtered.length ? <EmptyState message="No orders match your search and status filter." /> : <DataTable caption="Orders and cancellation actions" headers={["Order ID", "Customer", "Channel", "Date", "Total amount", "Status", "Actions"]}>
          {filtered.map(order => <tr key={order.order_id}><td><strong>#{order.order_id}</strong></td><td>{order.customer}</td><td>{order.channel ?? "—"}</td><td>{order.date ?? "—"}</td><td className="numeric">{amount(order.total_amount)}</td><td><StatusBadge status={effectiveStatus(order)} /></td><td><div className={styles.actions}><button className="button" aria-controls="order-details" aria-expanded={selectedId === order.order_id} onClick={() => { setSelectedId(order.order_id); requestAnimationFrame(() => detailsRef.current?.focus()); }}>View details</button>{cancelButton(order)}</div></td></tr>)}
        </DataTable>}
        <div className="panel-footnote">Cancelled and fulfilled orders cannot be cancelled. The database validates every cancellation request.</div>
      </Panel>
      {selected && <section id="order-details" ref={detailsRef} tabIndex={-1} className={styles.details} aria-label={`Details for order ${selected.order_id}`}>
        <Panel title={`Order #${selected.order_id}`} subtitle={`${selected.customer} · ${selected.date ?? "Date unavailable"}`} action={<button className="button" onClick={() => setSelectedId(null)}>Close details</button>}>
          <div className={styles.summary}><StatusBadge status={effectiveStatus(selected)} /><span>Channel: {selected.channel ?? "—"}</span><strong>Total amount: {amount(selected.total_amount)}</strong>{cancelButton(selected)}</div>
          {!selected.items.length ? <EmptyState message="No products were recorded for this order." /> : <DataTable caption={`Products in order ${selected.order_id}`} headers={["Product", "SKU", "Quantity", "Unit price"]}>{selected.items.map(item => <tr key={item.order_item_id}><td>{item.product}</td><td>{item.sku ?? "—"}</td><td className="numeric">{item.quantity}</td><td className="numeric">{amount(item.unit_price)}</td></tr>)}</DataTable>}
        </Panel>
      </section>}
    </>}
  </>;
}
