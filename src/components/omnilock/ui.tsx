import type { ReactNode } from "react";
import { Icon } from "./icons";

export function StatusBadge({ status }: { status: string | null }) {
  const value = status ?? "UNKNOWN";
  const tone = ["CONFIRMED", "COMPLETED", "DELIVERED", "AVAILABLE"].includes(value) ? "teal" : ["PENDING", "ACTIVE", "LOW STOCK"].includes(value) ? "amber" : ["CANCELLED", "EXPIRED", "OUT OF STOCK"].includes(value) ? "red" : "blue";
  return <span className={`badge ${tone}`}><span />{value.toLowerCase().replaceAll("_", " ")}</span>;
}
export function StatCard({ label, value, detail, icon, accent = "blue" }: { label: string; value?: string; detail: string; icon: string; accent?: string }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${accent}`}><Icon name={icon} /></span></div><p className="stat-value">{value === undefined ? "—" : new Intl.NumberFormat("en-IN").format(BigInt(value))}</p><p className="stat-detail">{detail}</p></article>;
}
export function Panel({ title, subtitle, action, children, className = "" }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>{children}</section>;
}
export function DataTable({ headers, children, caption }: { headers: string[]; children: ReactNode; caption: string }) {
  return <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}><table><caption className="sr-only">{caption}</caption><thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
export function EmptyState({ message }: { message: string }) {
  return <div className="empty-state"><Icon name="inventory" /><p>{message}</p></div>;
}
