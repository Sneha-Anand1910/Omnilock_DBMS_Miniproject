"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { EmptyState, Panel } from "@/components/omnilock/ui";
import { ApiError, date, errorText, label, request, ticket, type Ticket } from "./ticket-api";
import { BackLink, Badge, Heading, Loading, Notice } from "./ticket-ui";
import styles from "./tickets.module.css";

export default function TicketDetails({ id }: { id: string }) {
  const [data, setData] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [sender, setSender] = useState<"CUSTOMER" | "SUPPORT">("SUPPORT");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertainMessage, setUncertainMessage] = useState(false);
  const inFlight = useRef(false);
  const activeLoad = useRef<AbortController | null>(null);
  const load = useCallback(() => {
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    return Promise.resolve().then(() => {
      if (!/^[a-f\d]{24}$/i.test(id)) throw new Error("Invalid ticket ID. Return to the ticket register and select a ticket.");
      return request(`/api/tickets/${id}`, { signal: controller.signal });
    }).then(result => {
      const value = ticket(result.ticket);
      if (value._id.toLowerCase() !== id.toLowerCase()) throw new Error("The API returned a different ticket. Reload before making changes.");
      if (!controller.signal.aborted) setData(value);
    }).catch(reason => { if (!controller.signal.aborted) { setData(null); setLoadError(errorText(reason)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, [id]);
  useEffect(() => { void load(); return () => activeLoad.current?.abort(); }, [load]);
  function refresh() { setLoading(true); setLoadError(""); void load(); }

  async function mutate(kind: "message" | "status") {
    if (!data || loading || inFlight.current || (kind === "message" && uncertainMessage)) return;
    const nextStatus = data.status === "OPEN" ? "IN_PROGRESS" : data.status === "IN_PROGRESS" ? "RESOLVED" : null;
    if (kind === "status" && (!nextStatus || !window.confirm(`Change this ticket from ${label(data.status)} to ${label(nextStatus)}?${nextStatus === "RESOLVED" ? " Resolved tickets cannot be reopened with the current API." : ""}`))) return;
    if (kind === "message" && (!text.trim() || text.length > 2000 || data.messages.length >= 100)) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try {
      const result = await request(`/api/tickets/${id}/${kind === "message" ? "messages" : "status"}`, {
        method: kind === "message" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "message" ? { sender, text: text.trim() } : { currentStatus: data.status, newStatus: nextStatus }),
      });
      if (result.success !== true) throw new Error("Update could not be confirmed.");
      if (kind === "message") setText("");
      setNotice({ error: false, text: kind === "message" ? "Message added successfully." : `Ticket moved to ${label(nextStatus!)}.` });
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setNotice({ error: true, text: "Another user updated this ticket. Its latest state is being loaded. Review it before trying again; your draft is preserved." });
      } else {
        const unknownOutcome = !(reason instanceof ApiError) || reason.status >= 500 || reason.status < 400;
        if (kind === "message" && unknownOutcome) setUncertainMessage(true);
        setNotice({ error: true, text: unknownOutcome ? "The update could not be confirmed. Review the refreshed conversation and status before retrying to avoid duplicate messages." : errorText(reason) });
      }
    } finally {
      setLoading(true); setLoadError("");
      await load();
      inFlight.current = false; setBusy(false);
    }
  }
  function send(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void mutate("message"); }
  const next = data?.status === "OPEN" ? "Start progress" : data?.status === "IN_PROGRESS" ? "Mark resolved" : null;
  return <div className={styles.root}>
    <Heading title="Ticket details" description="Review the issue, respond and track its resolution."><button className="button" disabled={loading || busy} onClick={refresh}>Refresh ticket</button><BackLink /></Heading>
    {notice && <Notice error={notice.error}>{notice.text}</Notice>}
    {loading ? <Loading /> : loadError ? <Notice error>{loadError} <button className="button" onClick={refresh}>Retry loading</button></Notice> : null}
    {data && !loading && !loadError && <>
      <Panel title="Ticket information" subtitle={`Ticket ${data._id}`} action={<Badge status={data.status} />}>
        <div className={styles.body}>
          <dl className={styles.details}><div><dt>Order</dt><dd>#{data.orderId}</dd></div><div><dt>Issue type</dt><dd>{label(data.issueType)}</dd></div><div><dt>Created</dt><dd>{date(data.createdAt)}</dd></div><div><dt>Last updated</dt><dd>{date(data.updatedAt)}</dd></div></dl>
          <h2>Description</h2><p className={styles.text}>{data.description}</p>
          <div className={styles.actions}>{next ? <button className="button primary" disabled={busy} onClick={() => void mutate("status")}>{busy ? "Updating…" : next}</button> : <p className={styles.hint}>Resolved — no further status transitions are allowed.</p>}</div>
        </div>
      </Panel>
      <Panel title="Conversation" subtitle={`${data.messages.length} of 100 messages`}>
        {data.messages.length ? <ol className={styles.messages}>{data.messages.map((message, index) => <li key={`${message.createdAt}-${index}`} className={`${styles.message} ${message.sender === "SUPPORT" ? styles.support : ""}`}><header><strong>{label(message.sender)}</strong><time className={styles.hint} dateTime={message.createdAt}>{date(message.createdAt)}</time></header><p className={styles.text}>{message.text}</p></li>)}</ol> : <EmptyState message="No messages yet. Start the conversation below." />}
      </Panel>
      <Panel title="Add a message" subtitle="Choose a sender for this project demonstration. This does not authenticate a user.">
        <form className={styles.form} onSubmit={send}>
          <div className={styles.field}><label className={styles.fieldLabel} htmlFor="ticket-sender">Sender</label><select className={styles.control} id="ticket-sender" value={sender} onChange={event => setSender(event.target.value as "CUSTOMER" | "SUPPORT")} disabled={busy}><option value="CUSTOMER">Customer</option><option value="SUPPORT">Support</option></select></div>
          <div className={`${styles.field} ${styles.wide}`}><label className={styles.fieldLabel} htmlFor="ticket-message">Message</label><textarea className={`${styles.control} ${styles.textarea}`} id="ticket-message" required maxLength={2000} rows={4} value={text} onChange={event => setText(event.target.value)} disabled={busy || data.messages.length >= 100} aria-describedby="message-length" /></div>
          <p id="message-length" className={`${styles.hint} ${styles.wide}`}>{text.length}/2,000 characters. {data.messages.length >= 100 ? "This ticket has reached the API’s 100-message limit." : "Messages are saved to this ticket’s conversation."}</p>
          {uncertainMessage && <div className={styles.wide}><Notice error>Review the conversation above before sending again. <button type="button" className="button" disabled={busy} onClick={() => setUncertainMessage(false)}>I have checked the conversation</button></Notice></div>}
          <div className={styles.wide}><button type="submit" className="button primary" disabled={busy || uncertainMessage || !text.trim() || data.messages.length >= 100}>{busy ? "Saving…" : "Send message"}</button></div>
        </form>
      </Panel>
    </>}
  </div>;
}
