"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Panel } from "@/components/omnilock/ui";
import { ApiError, errorText, request, ticket } from "./ticket-api";
import { BackLink, Heading, Notice, issueTypes } from "./ticket-ui";
import styles from "./tickets.module.css";

export default function CreateTicket() {
  const [orderId, setOrderId] = useState("");
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [createdId, setCreatedId] = useState("");
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || uncertain || createdId) return;
    if (!/^\d+$/.test(orderId) || !Number.isSafeInteger(Number(orderId)) || Number(orderId) < 1 || !issueType.trim() || !description.trim()) { setError("Enter a positive whole order ID, issue type and description."); return; }
    inFlight.current = true; setBusy(true); setError("");
    try {
      const result = await request("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: Number(orderId), issueType: issueType.trim(), description: description.trim() }) });
      const created = ticket(result.ticket);
      setCreatedId(created._id);
    } catch (reason) {
      const unknownOutcome = !(reason instanceof ApiError) || reason.status >= 500 || reason.status < 400;
      setUncertain(unknownOutcome);
      setError(unknownOutcome ? "Creation could not be confirmed. Check the ticket register before submitting again; the ticket may already exist." : errorText(reason));
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <div className={styles.root}>
    <Heading title="Create support ticket" description="Link a customer issue to an existing OmniLock order."><BackLink /></Heading>
    {error && <Notice error>{error} {uncertain && <Link href="/tickets" className={styles.link}>Check tickets</Link>}</Notice>}
    {createdId && <Notice>Ticket created successfully. <Link className={styles.link} href={`/tickets/${createdId}`}>Open conversation</Link></Notice>}
    <Panel title="Ticket information" subtitle="All fields are required. The server validates the order and issue type.">
      <form onSubmit={submit} className={styles.form}>
        <div className={styles.field}><label className={styles.fieldLabel} htmlFor="ticket-order">Order ID</label><input className={styles.control} id="ticket-order" required inputMode="numeric" pattern="[0-9]+" value={orderId} onChange={event => setOrderId(event.target.value)} placeholder="Existing order ID" disabled={busy || !!createdId} /></div>
        <div className={styles.field}><label className={styles.fieldLabel} htmlFor="ticket-issue">Issue Type</label><select className={styles.control} id="ticket-issue" required value={issueType} onChange={event => setIssueType(event.target.value)} disabled={busy || !!createdId}><option value="" disabled>Select issue type</option>{issueTypes.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
        <div className={`${styles.field} ${styles.wide}`}><label className={styles.fieldLabel} htmlFor="ticket-description">Description</label><textarea className={`${styles.control} ${styles.textarea}`} id="ticket-description" required rows={5} value={description} onChange={event => setDescription(event.target.value)} placeholder="Describe the issue and the help needed…" disabled={busy || !!createdId} /></div>
        <div className={`${styles.actions} ${styles.wide}`}><button className="button primary" disabled={busy || uncertain || !!createdId} type="submit">{busy ? "Creating…" : "Create ticket"}</button><BackLink /></div>
      </form>
    </Panel>
  </div>;
}
