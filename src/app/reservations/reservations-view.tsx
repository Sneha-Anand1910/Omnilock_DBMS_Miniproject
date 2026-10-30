"use client";

import { useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ReservationData } from "@/lib/reservations";
import { DataTable, EmptyState, Panel, StatusBadge } from "@/components/omnilock/ui";
import styles from "./reservations.module.css";

export default function ReservationsView({ data }: { data: ReservationData | null }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [customer, setCustomer] = useState("");
  const [product, setProduct] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [channel, setChannel] = useState("WEBSITE");
  const [sending, setSending] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const inFlight = useRef(false);
  const busy = sending || refreshing;
  const stock = data?.inventory.find(item => item.product_id === Number(product) && item.warehouse_id === Number(warehouse));
  const count = Number(quantity);
  const validQuantity = Number.isSafeInteger(count) && count > 0 && count <= 2147483647 && stock !== undefined && count <= stock.available;
  const validSelection = data?.customers.some(item => item.id === Number(customer)) && data.products.some(item => item.id === Number(product)) && data.warehouses.some(item => item.id === Number(warehouse));
  const ready = validSelection && validQuantity && ["WEBSITE", "MOBILE", "STORE"].includes(channel);
  const query = search.trim().toLowerCase();
  const statuses = Array.from(new Set((data?.reservations ?? []).map(row => row.status ?? "UNKNOWN"))).sort();
  if (status && !statuses.includes(status)) statuses.push(status);
  const filtered = (data?.reservations ?? []).filter(row => (!status || (row.status ?? "UNKNOWN") === status) && `${row.reservation_id} #${row.order_id} ${row.customer} ${row.product} ${row.sku ?? ""} ${row.warehouse} ${row.channel ?? ""}`.toLowerCase().includes(query));
  function refresh() { startTransition(() => router.refresh()); }

  async function createReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || busy || uncertain) return;
    if (!ready) { setNotice({ error: true, text: "Select an existing customer, product and warehouse, and a positive whole quantity within available stock." }); return; }
    inFlight.current = true;
    setSending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: Number(customer), productId: Number(product), warehouseId: Number(warehouse), quantity: count, channel }),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.success === true && Number.isSafeInteger(result.orderId)) {
        setNotice({ error: false, text: `Reservation created for order #${result.orderId}. The database sets its expiry to 15 minutes after creation.` });
        setQuantity("1"); setProduct(""); setWarehouse("");
      } else if (response.status === 400 && result?.success === false) {
        const message = typeof result.message === "string" ? result.message : "";
        const safe = ["Invalid reservation details", "Inventory record not found", "Quantity must be greater than zero"].includes(message) || /^Insufficient stock\. Available: -?\d+, Requested: \d+$/.test(message);
        setNotice({ error: true, text: safe ? message : "Reservation could not be completed. Refresh inventory and check your selections." });
      } else {
        setUncertain(true);
        setNotice({ error: true, text: "The result could not be confirmed. Refresh and inspect recent reservations before creating another to avoid duplicates." });
      }
      refresh();
    } catch {
      setUncertain(true);
      setNotice({ error: true, text: "The connection was interrupted; the reservation may have been created. Refresh and inspect recent reservations before retrying." });
      refresh();
    } finally { inFlight.current = false; setSending(false); }
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">INVENTORY HOLDS</p><h1>Reservations management</h1><p>Review stock reservations and create a hold for an existing customer.</p></div><button className="button" disabled={busy} onClick={refresh}>{refreshing ? "Refreshing…" : "Refresh data"}</button></div>
    {notice && <div className={`${styles.notice} ${notice.error ? styles.error : styles.success}`} role={notice.error ? "alert" : "status"}>{notice.text}</div>}
    {data === null ? <Panel title="Reservations unavailable" subtitle="The database could not be read."><p className={styles.hint} role="alert">Use Refresh data to try again. Creation is unavailable until inventory and customer records load.</p></Panel> : <div className={styles.sections}>
      <Panel title="Create reservation" subtitle="A successful reservation creates a pending order and holds inventory for 15 minutes.">
        {(!data.customers.length || !data.products.length || !data.warehouses.length) && <p className={styles.hint}>Existing customers, products, and warehouses are required before creating a reservation.</p>}
        <form onSubmit={createReservation}>
          <fieldset className={styles.form} disabled={busy || uncertain}>
            <legend className="sr-only">Reservation details</legend>
            <label>Customer<select required value={customer} onChange={event => setCustomer(event.target.value)}><option value="">Select customer</option>{data.customers.map(item => <option key={item.id} value={item.id}>{item.name} (#{item.id})</option>)}</select></label>
            <label>Product<select required value={product} onChange={event => { setProduct(event.target.value); setWarehouse(""); }}><option value="">Select product</option>{data.products.map(item => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ""}</option>)}</select></label>
            <label>Warehouse<select required value={warehouse} onChange={event => setWarehouse(event.target.value)}><option value="">Select warehouse</option>{data.warehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Quantity<input type="number" required min="1" max={stock ? Math.max(0, Math.min(stock.available, 2147483647)) : undefined} step="1" value={quantity} onChange={event => setQuantity(event.target.value)} aria-describedby="reservation-stock" /></label>
            <label>Sales channel<select value={channel} onChange={event => setChannel(event.target.value)}><option value="WEBSITE">Website</option><option value="MOBILE">Mobile</option><option value="STORE">Store</option></select></label>
            <button type="submit" className="button primary" disabled={!ready}>{sending ? "Creating…" : "Create reservation"}</button>
          </fieldset>
          <p id="reservation-stock" className={styles.hint} role="status">{!product || !warehouse ? "Select a product and warehouse to see available stock." : !stock ? "No inventory record exists for this product at this warehouse." : `Available inventory: ${stock.available} units. ${stock.available <= 0 ? "No stock is available for reservation." : !validQuantity ? "Enter a positive whole quantity no greater than available stock." : "PostgreSQL rechecks stock when you submit."}`}</p>
        </form>
        {uncertain && <div className={styles.hint}><button className="button" disabled={busy} onClick={() => { setUncertain(false); setNotice(null); }}>I checked recent reservations — enable form</button></div>}
      </Panel>
      <Panel title="All reservations" subtitle="Newest reservation IDs first · Times as recorded in the database">
        <div className={styles.filters} role="search" aria-label="Filter reservations">
          <label>Search<input type="search" placeholder="Order, customer, product, SKU or warehouse" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <button className="button" disabled={!search && !status} onClick={() => { setSearch(""); setStatus(""); }}>Clear filters</button>
        </div>
        <p className={styles.hint} role="status">Showing {filtered.length} of {data.reservations.length} reservations</p>
        {!data.reservations.length ? <EmptyState message="No reservations yet. Create one using the form above." /> : !filtered.length ? <EmptyState message="No reservations match your search and status filter." /> : <DataTable caption="Inventory reservations" headers={["Reservation", "Order", "Customer", "Product", "Warehouse", "Quantity", "Status", "Channel", "Expiry time"]}>
          {filtered.map(row => <tr key={row.reservation_id}><td>#{row.reservation_id}</td><td>#{row.order_id}</td><td>{row.customer}</td><td><strong>{row.product}</strong><small>{row.sku}</small></td><td>{row.warehouse}</td><td className="numeric">{row.quantity}</td><td><StatusBadge status={row.status} />{row.overdue && <small>Past expiry · pending processing</small>}</td><td>{row.channel ?? "—"}</td><td>{row.expires ?? "—"}</td></tr>)}
        </DataTable>}
        <div className="panel-footnote">Statuses and expiry flags reflect the last database read. Refresh to update. This page does not run expiry processing.</div>
      </Panel>
    </div>}
  </>;
}
