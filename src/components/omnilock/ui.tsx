"use client";

import type { ReactNode } from "react";
import { Icon } from "./icons";
import { playHoverSound } from "@/lib/sound";

export function StatusBadge({ status }: { status: string | null }) {
  const value = status ?? "UNKNOWN";
  const tone = [
    "CONFIRMED",
    "COMPLETED",
    "DELIVERED",
    "AVAILABLE",
    "RESOLVED",
    "SUCCESS",
  ].includes(value)
    ? "teal"
    : [
        "PENDING",
        "ACTIVE",
        "LOW STOCK",
        "IN_PROGRESS",
        "IN_TRANSIT",
        "PROCESSING",
        "PACKED",
        "SHIPPED",
        "OUT_FOR_DELIVERY",
      ].includes(value)
    ? "amber"
    : ["CANCELLED", "EXPIRED", "OUT OF STOCK", "RETURNED", "REFUNDED"].includes(
        value
      )
    ? "red"
    : "blue";

  return (
    <span className={`badge badge-${tone}`}>
      <span className="badge-glow-dot" />
      <span className="badge-text">{value.toLowerCase().replaceAll("_", " ")}</span>
    </span>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon,
  accent = "blue",
}: {
  label: string;
  value?: string;
  detail: string;
  icon: string;
  accent?: string;
}) {
  const formattedValue =
    value === undefined
      ? "—"
      : /^\d+$/.test(value)
      ? new Intl.NumberFormat("en-IN").format(BigInt(value))
      : value;

  return (
    <article
      className={`stat-card stat-card-${accent}`}
      onMouseEnter={() => playHoverSound()}
    >
      <span className="hud-corner hud-tl" aria-hidden="true" />
      <span className="hud-corner hud-tr" aria-hidden="true" />
      <span className="hud-corner hud-bl" aria-hidden="true" />
      <span className="hud-corner hud-br" aria-hidden="true" />
      <div className="stat-card-glow-bg" aria-hidden="true" />

      <div className="stat-top">
        <span className="stat-label-text">{label}</span>
        <span className={`stat-icon-box ${accent}`}>
          <Icon name={icon} />
        </span>
      </div>

      <div className="stat-value-container">
        <p className="stat-value">{formattedValue}</p>
      </div>

      <div className="stat-detail-box">
        <p className="stat-detail">{detail}</p>
      </div>
      <div className="stat-bottom-laser" />
    </article>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <span className="hud-corner hud-tl" aria-hidden="true" />
      <span className="hud-corner hud-tr" aria-hidden="true" />
      <span className="hud-corner hud-bl" aria-hidden="true" />
      <span className="hud-corner hud-br" aria-hidden="true" />
      <div className="panel-glow-header" aria-hidden="true" />

      <div className="panel-heading">
        <div className="panel-title-group">
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {action && <div className="panel-action-wrap">{action}</div>}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

const numericHeaders = new Set(["On hand", "On Hand", "Total quantity", "Total Quantity", "Reserved", "Available", "Total amount", "Quantity", "Unit price", "Amount", "Price", "Capacity"]);

export function DataTable({
  headers,
  children,
  caption,
}: {
  headers: string[];
  children: ReactNode;
  caption: string;
}) {
  return (
    <div
      className="table-scroll"
      role="region"
      aria-label={caption}
      tabIndex={0}
      onMouseEnter={() => playHoverSound()}
    >
      <table className="cyber-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col" className={numericHeaders.has(header) ? "numeric" : undefined}>
                <span className="th-content">
                  {header}
                  <span className="th-glow-underline" />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({
  message,
  icon = "radar",
}: {
  message: string;
  icon?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-radar-sphere">
        <Icon name={icon} />
        <span className="empty-pulse" />
      </div>
      <p>{message}</p>
    </div>
  );
}
