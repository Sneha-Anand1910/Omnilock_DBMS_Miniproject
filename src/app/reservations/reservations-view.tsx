"use client";

import { useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ReservationData } from "@/lib/reservations";
import { DataTable, EmptyState, Panel, StatusBadge } from "@/components/omnilock/ui";
import { playHoverSound, playSuccessSound, playAlertSound } from "@/lib/sound";
import styles from "./reservations.module.css";

export default function ReservationsView({ data }: { data: ReservationData | null }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [customer, setCustomer] = useState("");
  const [product, setProduct] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [quantity, setQuantity] = useState("");
  const [channel, setChannel] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const inFlight = useRef(false);

  const busy = sending || refreshing;
  const stock = data?.inventory.find(
    (item) => item.product_id === Number(product) && item.warehouse_id === Number(warehouse)
  );
  const count = Number(quantity);
  const validQuantity =
    Number.isSafeInteger(count) && count > 0 && count <= 2147483647 && stock !== undefined && count <= stock.available;
  const validSelection =
    data?.customers.some((item) => item.id === Number(customer)) &&
    data.products.some((item) => item.id === Number(product)) &&
    data.warehouses.some((item) => item.id === Number(warehouse));
  const ready = validSelection && validQuantity && ["WEBSITE", "MOBILE", "STORE"].includes(channel);

  const query = search.trim().toLowerCase();
  const statuses = Array.from(new Set((data?.reservations ?? []).map((row) => row.status ?? "UNKNOWN"))).sort();
  if (status && !statuses.includes(status)) statuses.push(status);
  const filtered = (data?.reservations ?? []).filter(
    (row) =>
      (!status || (row.status ?? "UNKNOWN") === status) &&
      `${row.reservation_id} #${row.order_id} ${row.customer} ${row.product} ${row.sku ?? ""} ${row.warehouse} ${
        row.channel ?? ""
      }`
        .toLowerCase()
        .includes(query)
  );

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function createReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || busy || uncertain) return;
    if (!ready) {
      setNotice({
        error: true,
        text: "Select an existing customer, product and warehouse, and a positive whole quantity within available stock.",
      });
      playAlertSound();
      return;
    }
    inFlight.current = true;
    setSending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: Number(customer),
          productId: Number(product),
          warehouseId: Number(warehouse),
          quantity: count,
          channel,
        }),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.success === true && Number.isSafeInteger(result.orderId)) {
        setNotice({
          error: false,
          text: `Reservation created for order #${result.orderId}. The database sets its expiry to 15 minutes after creation.`,
        });
        playSuccessSound();
        setQuantity("");
        setChannel("");
        setProduct("");
        setWarehouse("");
      } else if (response.status === 400 && result?.success === false) {
        const message = typeof result.message === "string" ? result.message : "";
        const safe =
          ["Invalid reservation details", "Inventory record not found", "Quantity must be greater than zero"].includes(
            message
          ) || /^Insufficient stock\. Available: -?\d+, Requested: \d+$/.test(message);
        setNotice({
          error: true,
          text: safe ? message : "Reservation could not be completed. Refresh inventory and check your selections.",
        });
        playAlertSound();
      } else {
        setUncertain(true);
        setNotice({
          error: true,
          text: "The result could not be confirmed. Refresh and inspect recent reservations before creating another to avoid duplicates.",
        });
        playAlertSound();
      }
      refresh();
    } catch {
      setUncertain(true);
      setNotice({
        error: true,
        text: "The connection was interrupted; the reservation may have been created. Refresh and inspect recent reservations before retrying.",
      });
      playAlertSound();
      refresh();
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">INVENTORY HOLDS</p>
          <h1>Reservations management</h1>
          <p>Review stock reservations and create a hold for an existing customer.</p>
        </div>
        <button
          className="button"
          disabled={busy}
          onClick={() => {
            playHoverSound();
            refresh();
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh data"}
        </button>
      </div>

      {notice && (
        <div
          className={`${styles.notice} ${notice.error ? styles.error : styles.success}`}
          role={notice.error ? "alert" : "status"}
        >
          {notice.text}
        </div>
      )}

      {data === null ? (
        <Panel title="Reservations unavailable" subtitle="The database could not be read.">
          <p className={styles.hint} role="alert">
            Use Refresh data to try again. Creation is unavailable until inventory and customer records load.
          </p>
        </Panel>
      ) : (
        <div className={styles.sections}>
          <Panel
            title="Create reservation"
            subtitle="A successful reservation creates a pending order and holds inventory for 15 minutes."
          >
            {(!data.customers.length || !data.products.length || !data.warehouses.length) && (
              <p className={styles.hint}>
                Existing customers, products, and warehouses are required before creating a reservation.
              </p>
            )}
            <form onSubmit={createReservation}>
              <fieldset className={styles.form} disabled={busy || uncertain}>
                <label>
                  Customer
                  <select required value={customer} onChange={(event) => setCustomer(event.target.value)}>
                    <option value="">Select customer</option>
                    {data.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Product
                  <select required value={product} onChange={(event) => setProduct(event.target.value)}>
                    <option value="">Select product</option>
                    {data.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Warehouse
                  <select required value={warehouse} onChange={(event) => setWarehouse(event.target.value)}>
                    <option value="">Select warehouse</option>
                    {data.warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    type="number"
                    min="1"
                    max="2147483647"
                    required
                    placeholder="Enter quantity"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </label>
                <label>
                  Sales channel
                  <select required value={channel} onChange={(event) => setChannel(event.target.value)}>
                    <option value="">Select sales channel</option>
                    <option value="WEBSITE">Website</option>
                    <option value="MOBILE">Mobile</option>
                    <option value="STORE">Store</option>
                  </select>
                </label>
                <div className={styles.submitWrap}>
                  <button className="button primary" type="submit" disabled={!ready || busy || uncertain}>
                    {sending ? "Holding…" : "Create 15-min hold"}
                  </button>
                </div>
              </fieldset>
              {stock && (
                <p className={styles.stockNotice}>
                  Stock check: <strong style={{ color: "var(--cyan)" }}>{stock.available}</strong> units available at this location
                </p>
              )}
            </form>
          </Panel>

          <Panel title="Active and historic reservations" subtitle="All holds created across channels">
            <div className={styles.filters} role="search" aria-label="Filter reservations">
              <label>
                Search
                <input
                  type="search"
                  placeholder="Order ID, customer, product, SKU, warehouse"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label>
                Status
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button"
                disabled={!search && !status}
                onClick={() => {
                  setSearch("");
                  setStatus("");
                  playHoverSound();
                }}
              >
                Clear filters
              </button>
            </div>

            <p className={styles.hint} role="status">
              Showing {filtered.length} of {data.reservations.length} reservations
            </p>

            {!data.reservations.length ? (
              <EmptyState message="No reservations recorded yet." />
            ) : !filtered.length ? (
              <EmptyState message="No reservations match your search and filter criteria." />
            ) : (
              <DataTable
                caption="Reservations list"
                headers={[
                  "Hold ID",
                  "Order ID",
                  "Customer",
                  "Product",
                  "Warehouse",
                  "Channel",
                  "Reserved units",
                  "Status",
                  "Expiry / Event",
                ]}
              >
                {filtered.map((row) => (
                  <tr key={row.reservation_id}>
                    <td>
                      <span className={styles.holdTag}>#{row.reservation_id}</span>
                    </td>
                    <td>
                      <strong className="order-id">#{row.order_id}</strong>
                    </td>
                    <td>{row.customer}</td>
                    <td>
                      <strong>{row.product}</strong>
                      {row.sku && <small>{row.sku}</small>}
                    </td>
                    <td>{row.warehouse}</td>
                    <td>
                      <span className="channel">{row.channel?.toLowerCase() ?? "—"}</span>
                    </td>
                    <td className="numeric">{row.quantity}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>
                      <span className={styles.expiryText}>{row.expires ?? "—"}</span>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
            <div className="panel-footnote">
              Active holds automatically expire after 15 minutes unless confirmed via payment or cancelled.
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
