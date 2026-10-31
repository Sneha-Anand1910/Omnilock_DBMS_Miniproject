"use client";

import { useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PaymentsData } from "@/lib/payments";
import { DataTable, EmptyState, Panel, StatusBadge } from "@/components/omnilock/ui";
import styles from "./payments.module.css";

export default function PaymentsView({ data }: { data: PaymentsData | null }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [orderId, setOrderId] = useState("");
  const [method, setMethod] = useState("UPI");
  const [completed, setCompleted] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const inFlight = useRef(false);
  const busy = sending || refreshing;
  const eligible = (data?.eligible ?? []).filter(order => !completed.includes(order.order_id));
  const selected = eligible.find(order => order.order_id === Number(orderId));
  const statuses = Array.from(new Set((data?.history ?? []).map(payment => payment.status))).sort();
  if (status && !statuses.includes(status)) statuses.push(status);
  const query = search.trim().toLowerCase();
  const filtered = (data?.history ?? []).filter(payment => (!status || payment.status === status) && `${payment.payment_id} #${payment.order_id} ${payment.customer} ${payment.transaction_ref ?? ""} ${payment.method}`.toLowerCase().includes(query));
  function refresh() { startTransition(() => router.refresh()); }

  async function confirmPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy || inFlight.current) return;
    if (!window.confirm(`Record a simulated payment of ${selected.amount} for order #${selected.order_id}? No money will be charged. This will confirm the order and its reservations.`)) return;
    inFlight.current = true; setSending(true); setNotice(null);
    try {
      const response = await fetch("/api/payments/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: selected.order_id, method }) });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.success === true) {
        setCompleted(current => [...current, selected.order_id]);
        setOrderId("");
        setNotice({ error: false, text: `Simulated payment #${result.paymentId} confirmed for order #${selected.order_id}. Reference: ${result.transactionRef}. No money was charged.` });
      } else {
        setNotice({ error: true, text: typeof result?.message === "string" ? result.message : "Confirmation was not received. Refresh payment history before retrying." });
      }
      refresh();
    } catch {
      setNotice({ error: true, text: "The connection was interrupted. Refresh payment history before retrying; the payment may already have been recorded." });
      refresh();
    } finally { inFlight.current = false; setSending(false); }
  }

  return <>
    <div className="page-heading"><div><p className="eyebrow">PAYMENT OPERATIONS</p><h1>Payments management</h1><p>Review payment history and simulate payment confirmation.</p></div><button className="button" disabled={busy} onClick={refresh}>{refreshing ? "Refreshing…" : "Refresh data"}</button></div>
    {notice && <div className={`${styles.notice} ${notice.error ? styles.error : styles.success}`} role={notice.error ? "alert" : "status"}>{notice.text}</div>}
    {data === null ? <Panel title="Payments unavailable" subtitle="Payment records could not be loaded."><p className={styles.hint} role="alert">Use Refresh data to try again. Confirmation is unavailable until data loads.</p></Panel> : <div className={styles.sections}>
      <Panel title="Simulate payment confirmation" subtitle="Demo operation: writes a real payment record, but never charges money. Do not enter card or banking details.">
        {!eligible.length ? <EmptyState message="No eligible pending orders. Every item needs an active, unexpired reservation, a positive order total, and no successful payment." /> : <form onSubmit={confirmPayment}>
          <fieldset disabled={busy} className={styles.form}><legend className="sr-only">Simulated payment details</legend>
            <label>Pending order<select required value={orderId} onChange={event => setOrderId(event.target.value)}><option value="">Select an eligible order</option>{eligible.map(order => <option key={order.order_id} value={order.order_id}>#{order.order_id} · {order.customer} · {order.amount}</option>)}</select></label>
            <label>Simulated method<select value={method} onChange={event => setMethod(event.target.value)}><option value="UPI">UPI</option><option value="CARD">Card</option><option value="NET_BANKING">Net banking</option></select></label>
            <button className="button primary" type="submit" disabled={!selected}>{sending ? "Confirming…" : "Confirm simulated payment"}</button>
          </fieldset><p className={styles.hint}>{selected ? `Amount: ${selected.amount}. ` : ""}Amount comes from the database. Eligibility is rechecked under database locks; repeated successful payment for the same order is rejected.</p>
        </form>}
      </Panel>
      <Panel title="Payment history" subtitle="All recorded payments · Latest payment dates first">
        <div className={styles.form} role="search" aria-label="Filter payment history"><label>Search<input type="search" placeholder="Order, customer or transaction reference" value={search} onChange={event => setSearch(event.target.value)} /></label><label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{value}</option>)}</select></label><button className="button" disabled={!search && !status} onClick={() => { setSearch(""); setStatus(""); }}>Clear filters</button></div>
        <p className={styles.hint} role="status">Showing {filtered.length} of {data.history.length} payments</p>
        {!data.history.length ? <EmptyState message="No payments have been recorded yet." /> : !filtered.length ? <EmptyState message="No payments match your search and status filter." /> : <DataTable caption="Payment history" headers={["Payment", "Order", "Customer", "Amount", "Method", "Transaction reference", "Status", "Date"]}>{filtered.map(payment => <tr key={payment.payment_id}><td>#{payment.payment_id}</td><td>#{payment.order_id}</td><td>{payment.customer}</td><td className="numeric">{payment.amount}</td><td>{payment.method.replaceAll("_", " ")}</td><td>{payment.transaction_ref ?? "—"}</td><td><StatusBadge status={payment.status} /></td><td>{payment.date ?? "—"}</td></tr>)}</DataTable>}
        <div className="panel-footnote">Amounts and dates are shown as stored. SIM- references identify confirmations generated by this module. Refresh to retrieve updates.</div>
      </Panel>
    </div>}
  </>;
}
