"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { DataTable, EmptyState, Panel, StatusBadge } from "@/components/omnilock/ui";
import "./preparation.css";

type Kind = "fulfillment" | "shipments";
type RecordRow = {
  id: number; order_id: number; order_item_id: number; product_name: string;
  customer: string; quantity: number; status: string; fulfillment_id?: number;
  fulfillment_status?: string; courier?: string; tracking_no?: string | null;
  fulfillment_date?: string | null; ship_date?: string | null; delivery_date?: string | null; ready?: boolean;
  stageBReady?: boolean; dispatch_eligible?: boolean;
};
type Option = { id: number; order_id: number; order_item_id: number; quantity: number; product_name: string; customer: string };
type Query = { search: string; status: string; page: number };
const fulfillmentStatuses = ["PENDING", "PROCESSING", "PACKED", "FULFILLED", "CANCELLED"];
const shipmentStatuses = ["PENDING", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "RETURNED", "CANCELLED"];
const deliverySteps = ["PENDING", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(typeof result?.error === "string" ? result.error : "Request failed.", response.status);
  if (!result || result.success !== true) throw new Error("The server response could not be confirmed.");
  return result;
}
function record(value: unknown): RecordRow {
  if (!value || typeof value !== "object") throw new Error("Invalid preparation record.");
  const row = value as RecordRow;
  if (!Number.isInteger(row.id) || row.id < 1 || !Number.isInteger(row.order_id) || !Number.isInteger(row.order_item_id) || typeof row.status !== "string" || typeof row.product_name !== "string") throw new Error("Invalid preparation record.");
  return row;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : "Request failed.";
const dateText = (value?: string | null) => value ? value.replace("T", " ") : "Not recorded";

export default function PreparationManager({ kind }: { kind: Kind }) {
  const fulfillment = kind === "fulfillment";
  const title = fulfillment ? "Fulfillment" : "Shipments";
  const statuses = fulfillment ? fulfillmentStatuses : shipmentStatuses;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState<Query>({ search: "", status: "", page: 1 });
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [eligible, setEligible] = useState<Option[]>([]);
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const [stageBReady, setStageBReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState("");
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");
  const [details, setDetails] = useState<RecordRow | null>(null);
  const [editCourier, setEditCourier] = useState("");
  const [editTracking, setEditTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const inFlight = useRef(false);
  const active = useRef<AbortController | null>(null);
  const detailPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController(); active.current = controller;
    const current = () => !controller.signal.aborted && active.current === controller;
    setLoading(true); setLoadError(""); setRows([]);
    const params = new URLSearchParams({ search: query.search, status: query.status, page: String(query.page), pageSize: "10" });
    request("/api/" + kind + "?" + params, { signal: controller.signal }).then(result => {
      if (!Array.isArray(result.records) || !Array.isArray(result.eligible) || typeof result.total !== "number" || !Number.isSafeInteger(result.total) || result.total < 0 || typeof result.ready !== "boolean" || result.page !== query.page || result.pageSize !== 10) throw new Error("Invalid list response.");
      const records = result.records.map(record);
      const options = result.eligible as Option[];
      if (options.some(option => !Number.isInteger(option.id) || option.id < 1 || typeof option.product_name !== "string")) throw new Error("Invalid eligibility response.");
      if (!current()) return;
      setReady(result.ready); setStageBReady(result.stageBReady === true); setEligible(options);
      const last = Math.max(1, Math.ceil(result.total / 10));
      if (query.page > last) { setQuery(value => ({ ...value, page: last })); return; }
      setRows(records); setTotal(result.total);
    }).catch(error => { if (current()) { setLoadError(errorText(error)); setReady(false); setStageBReady(false); setEligible([]); } })
      .finally(() => { if (current()) setLoading(false); });
    return () => controller.abort();
  }, [kind, query, revision]);
  function apply(next: Query) { active.current?.abort(); setLoading(true); setQuery(next); }
  function refresh() { active.current?.abort(); setLoading(true); setRevision(value => value + 1); }
  function refreshVisible() {
    apply({ search: search.trim(), status, page: search.trim() === query.search && status === query.status ? query.page : 1 });
    if (details) void openDetails(details.id);
  }
  async function openDetails(id: number) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try {
      const result = await request("/api/" + kind + "/" + id);
      const value = record(result.record);
      setDetails(value); setEditCourier(value.courier ?? ""); setEditTracking(value.tracking_no ?? "");
      requestAnimationFrame(() => { detailPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); detailPanel.current?.focus(); });
    } catch (error) { setDetails(null); setNotice({ error: true, text: errorText(error) }); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function mutate(body: Record<string, unknown>, id?: number, action?: "dispatch" | "transition") {
    if (inFlight.current || !(action ? stageBReady : ready) || uncertain) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try {
      const result = await request("/api/" + kind + (id === undefined ? "" : "/" + id), { method: action === "dispatch" ? "POST" : action === "transition" ? "PUT" : id === undefined ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setNotice({ error: false, text: action === "dispatch"
        ? result.alreadyDispatched === true ? "This fulfillment was already dispatched. No additional stock was deducted." : "Inventory dispatched atomically and fulfillment completed. Payment records are unchanged."
        : action === "transition" ? "Shipment moved to " + String(body.newStatus).toLowerCase().replaceAll("_", " ") + "."
        : id === undefined ? "Preparation record created. Nothing has been dispatched." : "Preparation information updated. Stock and order/payment states are unchanged." });
      if (id === undefined) { setSelected(""); setCourier(""); setTracking(""); }
      else if (action) {
        try { setDetails(record((await request("/api/" + kind + "/" + id)).record)); }
        catch { setDetails(null); }
      } else setDetails(null);
    } catch (error) {
      const unknown = !(error instanceof ApiError) || error.status >= 500;
      if (unknown) setUncertain(true);
      setNotice({ error: true, text: unknown ? errorText(error) + " Inspect current records before enabling another submission; the operation may already have succeeded." : errorText(error) });
      if (error instanceof ApiError && error.status === 409 && id !== undefined) {
        // Never automatically retry a stale mutation. Preserve draft text for review.
        try { setDetails(record((await request("/api/" + kind + "/" + id)).record)); }
        catch { setDetails(null); }
      }
    } finally { refresh(); inFlight.current = false; setBusy(false); }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eligible.some(option => String(option.id) === selected)) { setNotice({ error: true, text: "Select a currently eligible record." }); return; }
    if (fulfillment && !window.confirm("Start preparation? Existing cancellation rules will block cancellation/refunds for this order once active fulfillment exists. No stock will be deducted.")) return;
    void mutate(fulfillment ? { orderItemId: Number(selected) } : { fulfillmentId: Number(selected), courier, trackingNo: tracking });
  }
  const disabled = busy || loading || !ready || uncertain;
  const dispatchDisabled = busy || loading || !stageBReady || uncertain || !details?.stageBReady;
  const pages = Math.max(1, Math.ceil(total / 10));
  const next = details?.status === "PENDING" ? "PROCESSING" : details?.status === "PROCESSING" ? "PACKED" : null;
  const deliveryIndex = details ? deliverySteps.indexOf(details.status) : -1;
  const nextShipment = deliveryIndex >= 0 ? deliverySteps[deliveryIndex + 1] : undefined;
  return <div className="ol-preparation">
    <div className="page-heading"><div><p className="eyebrow">PREPARATION · DISPATCH · DELIVERY</p><h1>{title}</h1><p>{fulfillment ? "Prepare confirmed order items and dispatch their reserved inventory." : "Prepare shipments and track delivery from pending to delivered."}</p></div><button className="button" disabled={busy || loading} onClick={refreshVisible}>Refresh data</button></div>
    <div className="ol-preparation-notice">Preparation does not change stock. Dispatch deducts physical and reserved stock once. Create a pending shipment before dispatching its packed fulfillment. Active fulfillment blocks order cancellation; returns and automatic refunds are not supported here.</div>
    {!loading && !loadError && !ready && <div role="status" className="ol-preparation-notice ol-preparation-error">Read-only mode: apply the Stage A migration manually to enable preparation actions.</div>}
    {!loading && !loadError && !stageBReady && <div role="status" className="ol-preparation-notice">Dispatch and delivery controls are disabled until the Stage B migration is applied manually. Stage A preparation remains available.</div>}
    {notice && <div role={notice.error ? "alert" : "status"} className={"ol-preparation-notice " + (notice.error ? "ol-preparation-error" : "ol-preparation-success")}>{notice.text}</div>}
    {uncertain && <div className="ol-preparation-actions"><button className="button" disabled={busy || loading || !!loadError} onClick={() => { setUncertain(false); setNotice(null); }}>I have checked the latest records</button></div>}
    <Panel title={fulfillment ? "Start fulfillment preparation" : "Create pending shipment"} subtitle={fulfillment ? "Eligible items have confirmed orders, successful unrefunded payment and matching confirmed inventory holds." : "Only eligible PACKED fulfillments without an active shipment are listed."}>
      <form className="ol-preparation-form" onSubmit={create}>
        <div className="ol-preparation-field ol-preparation-wide"><label htmlFor="preparation-target">{fulfillment ? "Order item" : "Packed fulfillment"}</label><select id="preparation-target" required value={selected} disabled={disabled} onChange={event => setSelected(event.target.value)}><option value="">Select eligible {fulfillment ? "order item" : "fulfillment"}</option>{selected && !eligible.some(option => String(option.id) === selected) && <option value={selected} disabled>No longer eligible — select another</option>}{eligible.map(option => <option key={option.id} value={option.id}>#{option.id} · Order #{option.order_id} · {option.product_name} × {option.quantity} · {option.customer}</option>)}</select></div>
        {!fulfillment && <><div className="ol-preparation-field"><label htmlFor="preparation-courier">Courier *</label><input id="preparation-courier" required maxLength={100} value={courier} disabled={disabled} onChange={event => setCourier(event.target.value)} /></div><div className="ol-preparation-field"><label htmlFor="preparation-tracking">Tracking number (optional)</label><input id="preparation-tracking" maxLength={100} value={tracking} disabled={disabled} onChange={event => setTracking(event.target.value)} /></div></>}
        <div className="ol-preparation-actions ol-preparation-wide"><button className="button primary" type="submit" disabled={disabled || !eligible.some(option => String(option.id) === selected)}>{busy ? "Saving…" : fulfillment ? "Start preparation" : "Create pending shipment"}</button></div>
      </form>
      {!loading && !eligible.length && <p className="ol-preparation-body">{loadError ? "Eligibility is unavailable until records load." : "No eligible records. Eligibility is checked again atomically when saving."}</p>}
    </Panel>
    <Panel title={title + " register"} subtitle="Search by record, order or item ID, product, customer, or shipment tracking details.">
       <form className="ol-preparation-filters" role="search" onSubmit={event => { event.preventDefault(); apply({ search: search.trim(), status, page: 1 }); }}><div className="ol-preparation-field"><label htmlFor="preparation-search">Search</label><input type="search" id="preparation-search" value={search} placeholder={fulfillment ? "Search by order, customer, or product..." : "Search by order, courier, or tracking number..."} onChange={event => { setSearch(event.target.value); if (!event.target.value.trim()) apply({ search: "", status, page: 1 }); }} /></div><div className="ol-preparation-field"><label htmlFor="preparation-status">Status</label><select id="preparation-status" value={status} onChange={event => { setStatus(event.target.value); apply({ search: search.trim(), status: event.target.value, page: 1 }); }}><option value="">All statuses</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></div><button type="submit" className="button">Search</button><button type="button" className="button" onClick={() => { setSearch(""); setStatus(""); apply({ search: "", status: "", page: 1 }); }}>Clear</button></form>
      {loading ? <p className="ol-preparation-body" role="status">Loading records…</p> : loadError ? <div className="ol-preparation-body"><p role="alert">{loadError}</p><button className="button" onClick={refreshVisible}>Retry</button></div> : rows.length ? <DataTable caption={title + " preparation records"} headers={["ID", "Order / Item", "Customer / Product", "Quantity", ...(fulfillment ? [] : ["Courier / Tracking"]), "Status", "Action"]}>
        {rows.map(row => <tr key={row.id}><td>#{row.id}</td><td>Order #{row.order_id}<small>Item #{row.order_item_id}</small></td><td className="ol-preparation-cell">{row.customer}<small>{row.product_name}</small></td><td className="numeric">{row.quantity}</td>{!fulfillment && <td className="ol-preparation-cell">{row.courier}<small>{row.tracking_no ?? "Not assigned"}</small></td>}<td><StatusBadge status={row.status} />{row.status === "PENDING" && !fulfillment && <small>Not dispatched</small>}</td><td><button className="button" disabled={busy} onClick={() => void openDetails(row.id)}>View / manage</button></td></tr>)}
      </DataTable> : <EmptyState message="No matching preparation records." />}
      {!loading && !loadError && <nav className="ol-preparation-pagination" aria-label="Preparation pagination"><span>{total} records · Page {query.page} of {pages}</span>{pages > 1 && <div className="ol-preparation-actions"><button className="button" disabled={busy || query.page <= 1} onClick={() => apply({ ...query, page: query.page - 1 })}>Previous</button><button className="button" disabled={busy || query.page >= pages} onClick={() => apply({ ...query, page: query.page + 1 })}>Next</button></div>}</nav>}
    </Panel>
    {details && <div ref={detailPanel} tabIndex={-1} className="ol-preparation-editor"><Panel title={title + " #" + details.id} subtitle={"Order #" + details.order_id + " · Item #" + details.order_item_id} action={<button className="button" disabled={busy} onClick={() => setDetails(null)}>Close</button>}>
      <div className="ol-preparation-body"><p>{details.customer} · {details.product_name} × {details.quantity}</p><StatusBadge status={details.status} /><p>{fulfillment ? "Fulfillment date: " + dateText(details.fulfillment_date) : "Fulfillment #" + details.fulfillment_id + " · Ship date: " + dateText(details.ship_date) + " · Delivery date: " + dateText(details.delivery_date)}</p></div>
      {fulfillment ? <div className="ol-preparation-body">
        {next ? <button className="button primary" disabled={disabled || !details.ready} onClick={() => { if (window.confirm("Move fulfillment to " + next + "? This is preparation only; stock will not change.")) void mutate({ currentStatus: details.status, newStatus: next }, details.id); }}>Mark {next.toLowerCase()}</button>
          : details.status === "PACKED" ? <>
            <button className="button primary" disabled={dispatchDisabled || !details.dispatch_eligible} onClick={() => {
              if (window.confirm("Dispatch fulfillment #" + details.id + "? This permanently deducts " + details.quantity + " unit(s) from physical and reserved stock. Cancellation and automatic refunds will remain blocked.")) void mutate({ currentStatus: "PACKED" }, details.id, "dispatch");
            }}>{busy ? "Dispatching…" : "Dispatch inventory"}</button>
            <p>{details.dispatch_eligible ? "Stock, payment and reservation eligibility are checked again inside the atomic dispatch." : "Dispatch requires matching confirmed inventory holds, successful payment and a pending shipment. Prepare the shipment, then refresh this record."}</p>
          </> : <p>{details.status === "FULFILLED" ? "Inventory has been dispatched. Continue delivery tracking in Shipments." : "No fulfillment action is available for this status."}</p>}
      </div> : <>
        <div className="ol-preparation-body">
          <ol className="ol-delivery-timeline" aria-label="Shipment delivery progress">
            {deliverySteps.map((step, index) => <li key={step} className={deliveryIndex >= index ? "ol-delivery-complete" : ""} aria-current={details.status === step ? "step" : undefined}>
              <span>{index + 1}</span><strong>{step.toLowerCase().replaceAll("_", " ")}</strong>
              {step === "SHIPPED" && details.ship_date && <small>{dateText(details.ship_date)}</small>}
              {step === "DELIVERED" && details.delivery_date && <small>{dateText(details.delivery_date)}</small>}
            </li>)}
          </ol>
          {nextShipment ? <>
            <button className="button primary" disabled={dispatchDisabled || details.fulfillment_status !== "FULFILLED"} onClick={() => {
              if (window.confirm("Move shipment #" + details.id + " from " + details.status + " to " + nextShipment + "?")) void mutate({ currentStatus: details.status, newStatus: nextShipment }, details.id, "transition");
            }}>{busy ? "Updating…" : "Mark " + nextShipment.toLowerCase().replaceAll("_", " ")}</button>
            {details.fulfillment_status !== "FULFILLED" && <p>Dispatch fulfillment #{details.fulfillment_id} before shipping.</p>}
          </> : <p>{details.status === "DELIVERED" ? "Delivery completed." : "This shipment status has no supported transition."}</p>}
          <p>Returns and cancellation require a separate reviewed workflow. No automatic restocking or refunds are performed.</p>
        </div>
        {details.status === "PENDING" && details.fulfillment_status === "PACKED" && !details.ship_date && !details.delivery_date && <form className="ol-preparation-form" onSubmit={event => { event.preventDefault(); void mutate({ currentStatus: "PENDING", newStatus: "PENDING", courier: editCourier, trackingNo: editTracking, expectedCourier: details.courier, expectedTrackingNo: details.tracking_no ?? null }, details.id); }}>
          <div className="ol-preparation-field"><label htmlFor="edit-courier">Courier *</label><input id="edit-courier" required maxLength={100} value={editCourier} disabled={disabled} onChange={event => setEditCourier(event.target.value)} /></div>
          <div className="ol-preparation-field"><label htmlFor="edit-tracking">Tracking number</label><input id="edit-tracking" maxLength={100} value={editTracking} disabled={disabled} onChange={event => setEditTracking(event.target.value)} /></div>
          <div className="ol-preparation-wide"><button className="button primary" type="submit" disabled={disabled || !details.ready}>Save pending details</button><p>Status stays PENDING. This does not dispatch the shipment. Courier/tracking edits close after inventory dispatch.</p></div>
        </form>}
      </>}
    </Panel></div>}
  </div>;
}
