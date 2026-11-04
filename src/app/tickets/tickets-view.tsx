"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { DataTable, EmptyState, Panel } from "@/components/omnilock/ui";
import { analytics, date, errorText, label, request, statuses, ticketList, type Analytics, type TicketList } from "./ticket-api";
import { Badge, Heading, Loading, Notice, SummaryCard, issueTypes } from "./ticket-ui";
import styles from "./tickets.module.css";

export default function TicketsView() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [issue, setIssue] = useState("");
  const [query, setQuery] = useState({ search: "", status: "", issue: "", page: 1 });
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<TicketList | null>(null);
  const [stats, setStats] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [statsError, setStatsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    const params = new URLSearchParams({ search: query.search, status: query.status, issueType: query.issue, page: String(query.page), pageSize: "10" });
    request(`/api/tickets?${params}`, { signal: controller.signal }).then(value => {
      const result = ticketList(value);
      if (result.page !== query.page || result.pageSize !== 10) throw new Error("Ticket API must honor the requested page and pageSize.");
      if (!controller.signal.aborted) setData(result);
    }).catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, revision]);
  useEffect(() => {
    const controller = new AbortController();
    setStatsLoading(true); setStatsError(""); setStats(null);
    request("/api/tickets/analytics", { signal: controller.signal }).then(value => {
      const result = analytics(value);
      if (!controller.signal.aborted) setStats(result);
    }).catch(reason => { if (!controller.signal.aborted) setStatsError(errorText(reason)); }).finally(() => { if (!controller.signal.aborted) setStatsLoading(false); });
    return () => controller.abort();
  }, [revision]);
  function apply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setQuery({ search: search.trim(), status, issue: issue.trim(), page: 1 }); }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return <div className={styles.root}>
    <Heading title="Support tickets" description="Manage customer conversations and resolve order issues.">
      <button className="button" disabled={loading || statsLoading} onClick={() => setRevision(value => value + 1)}>Refresh data</button>
      <Link className="button primary" href="/tickets/new">Create ticket</Link>
    </Heading>
    <section aria-label="Ticket analytics" aria-busy={statsLoading} className={styles.stats}>
      <SummaryCard title="Total" value={stats?.totalTickets} />
      {statuses.map(value => <SummaryCard key={value} title={value === "IN_PROGRESS" ? "In Progress" : value === "OPEN" ? "Open" : "Resolved"} value={stats?.statusCounts[value]} resolved={value === "RESOLVED"} />)}
    </section>
    {statsError && <Notice error>Analytics: {statsError} <button className="button" onClick={() => setRevision(value => value + 1)}>Retry</button></Notice>}
    <Panel title="Issues at a glance" subtitle="All tickets, independent of the list filters">
      {statsLoading ? <Loading /> : stats ? stats.issueTypeCounts.length ? <div className={styles.issues}>{stats.issueTypeCounts.map(item => <div className={styles.issue} key={item.issueType}>{label(item.issueType)}<strong>{item.count.toLocaleString("en-IN")}</strong></div>)}</div> : <EmptyState message="No ticket issues recorded yet." /> : <p className={`${styles.body} ${styles.hint}`}>Issue statistics unavailable.</p>}
    </Panel>
    <Panel title="Ticket register" subtitle="Search by ticket ID, order ID or description">
      <form className={`${styles.form} ${styles.filters}`} onSubmit={apply}>
        <div className={styles.field}><label className={styles.fieldLabel} htmlFor="ticket-search">Search tickets</label><input className={styles.control} id="ticket-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Order ID, ticket ID or description" type="search" /></div>
        <div className={styles.field}><label className={styles.fieldLabel} htmlFor="ticket-status-filter">Status</label><select className={styles.control} id="ticket-status-filter" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></div>
        <div className={styles.field}><label className={styles.fieldLabel} htmlFor="ticket-issue-filter">Issue Type</label><select className={styles.control} id="ticket-issue-filter" value={issue} onChange={event => setIssue(event.target.value)}><option value="">All issue types</option>{issueTypes.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
        <div className={styles.filterAction}><button className="button" type="submit">Apply filters</button></div>
      </form>
      {loading ? <Loading /> : error ? <div className={styles.body}><Notice error>{error}</Notice><button className="button" onClick={() => setRevision(value => value + 1)}>Retry loading</button></div> : data && data.tickets.length ? <DataTable caption="Customer support tickets" headers={["Ticket ID", "Order", "Issue type", "Status", "Created", "Details"]}>
        {data.tickets.map(item => <tr key={item._id}><td><Link href={`/tickets/${item._id}`} className={styles.link}>{item._id}</Link></td><td>#{item.orderId}</td><td>{label(item.issueType)}</td><td><Badge status={item.status} /></td><td>{date(item.createdAt)}</td><td><Link href={`/tickets/${item._id}`} className={styles.link} aria-label={`View ticket ${item._id}`}>View ticket</Link></td></tr>)}
      </DataTable> : <EmptyState message="No tickets on this page. Adjust filters, return to the previous page or create a ticket." />}
      {data && !loading && <nav aria-label="Ticket pagination" className={styles.pager}><span>{data.total.toLocaleString("en-IN")} tickets · Page {query.page} of {pages}</span>{pages > 1 && <div className={styles.actions}><button className="button" disabled={query.page <= 1} onClick={() => setQuery(value => ({ ...value, page: value.page - 1 }))}>Previous</button><button className="button" disabled={query.page >= pages} onClick={() => setQuery(value => ({ ...value, page: value.page + 1 }))}>Next</button></div>}</nav>}
    </Panel>
  </div>;
}
