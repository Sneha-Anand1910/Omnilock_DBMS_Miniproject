"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "./icons";
import { navigation } from "./navigation";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button className="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}><Icon name="refresh" className={pending ? "spin" : ""} /><span>{pending ? "Refreshing…" : "Refresh data"}</span></button>;
}

export function Sidebar({ open, close }: { open: boolean; close: () => void }) {
  const pathname = usePathname();
  const isActive = (slug: string) => {
    const href = slug ? `/${slug}` : "/";
    return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  };
  return <>
    {open && <button className="sidebar-overlay" aria-label="Close navigation" onClick={close} />}
    <aside id="main-navigation" aria-label="Primary" className={`sidebar ${open ? "is-open" : ""}`}>
      <Link href="/" className="brand" onClick={close}><span className="brand-icon"><Icon name="lock" /></span><span>Omni<span className="brand-light">Lock</span><small>INVENTORY & OPERATIONS</small></span></Link>
      <button className="mobile-close icon-button" onClick={close} aria-label="Close navigation"><Icon name="close" /></button>
      <nav aria-label="Main navigation">{navigation.map(item => {
        const active = isActive(item.slug);
        return <div key={item.slug}>{item.group && <p className="nav-group">{item.group}</p>}<Link href={item.slug ? `/${item.slug}` : "/"} onClick={close} aria-current={active ? "page" : undefined} className={`nav-link ${active ? "active" : ""}`}><Icon name={item.icon} /><span>{item.label}</span>{active && <span className="nav-dot" />}</Link></div>;
      })}</nav>
      <div className="sidebar-bottom"><span className="workspace-avatar">OL</span><div><strong>OmniLock workspace</strong><small>DBMS · Level 3</small></div></div>
    </aside>
  </>;
}

export function Header({ open, expanded }: { open: () => void; expanded: boolean }) {
  const pathname = usePathname();
  const current = navigation.filter(item => item.slug && (pathname === `/${item.slug}` || pathname.startsWith(`/${item.slug}/`))).sort((a, b) => b.slug.length - a.slug.length)[0];
  const title = current?.label ?? (pathname === "/" ? "Dashboard" : "Workspace");
  const isTicketPage = pathname === "/tickets" || pathname.startsWith("/tickets/");
  const ticketChild = pathname === "/tickets/new" ? "Create Ticket" : pathname === "/tickets" ? null : "Ticket Details";
  return <header className="header"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="Open navigation" aria-expanded={expanded} aria-controls="main-navigation" onClick={open}><Icon name="menu" /></button>{isTicketPage ? <nav aria-label="Breadcrumb" className="header-crumbs"><Link href="/">Workspace</Link><span className="divider" aria-hidden="true">/</span>{ticketChild ? <><Link href="/tickets">Support Tickets</Link><span className="divider" aria-hidden="true">/</span><strong aria-current="page">{ticketChild}</strong></> : <strong aria-current="page">Support Tickets</strong>}</nav> : <><span>Workspace</span><span className="divider">/</span><strong>{title}</strong></>}</div><div className="header-right"><span className="environment"><span className="environment-mark" />Operations workspace</span><span className="avatar" title="OmniLock workspace">OL</span></div></header>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><Sidebar open={open} close={() => setOpen(false)} /><div className="main-shell"><Header open={() => setOpen(true)} expanded={open} /><main id="main-content" className="workspace">{children}</main><footer className="footer"><span>OmniLock <span className="footer-dot">·</span> Inventory & order management</span><span>One workspace. Every operation.</span></footer></div></div>;
}
