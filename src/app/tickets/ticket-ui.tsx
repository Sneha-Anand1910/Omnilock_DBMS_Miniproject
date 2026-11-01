"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { label, type TicketStatus } from "./ticket-api";
import styles from "./tickets.module.css";

export const issueTypes = ["DELIVERY", "PAYMENT", "REFUND", "PRODUCT", "OTHER"] as const;

export function SummaryCard({ title, value, resolved = false }: { title: string; value?: number; resolved?: boolean }) {
  return <article className={`${styles.summaryCard} ${resolved ? styles.summaryResolved : ""}`}><h2 className={styles.summaryLabel}>{title}</h2><p className={styles.summaryValue}>{value === undefined ? "—" : value.toLocaleString("en-IN")}</p></article>;
}

export function Badge({ status }: { status: TicketStatus }) {
  return <span className={`badge ${status === "RESOLVED" ? "teal" : status === "OPEN" ? "amber" : "blue"}`}><span />{label(status)}</span>;
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div role={error ? "alert" : "status"} className={`${styles.notice} ${error ? styles.error : styles.success}`}>{children}</div>;
}
export function Heading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">CUSTOMER SUPPORT</p><h1>{title}</h1><p>{description}</p></div><div className={styles.actions}>{children}</div></div>;
}
export function BackLink() { return <Link className="button" href="/tickets">Back to tickets</Link>; }
export function Loading() { return <div className={styles.body} role="status">Loading ticket data…</div>; }
