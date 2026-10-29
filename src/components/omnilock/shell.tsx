"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "./icons";
import { navigation } from "./navigation";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button className="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}><Icon name="refresh" className={pending ? "spin" : ""} /><span>{pending ? "Refreshing…" : "Refresh data"}</span></button>;
}

export function Sidebar({ open, close }: { open: boolean; close: () => void }) {
  const pathname = usePathname();
  return <>
    {open && <button className="sidebar-overlay" aria-label="Close navigation" onClick={close} />}
    <aside id="main-navigation" className={`sidebar ${open ? "is-open" : ""}`}>
      <Link href="/" className="brand" onClick={close}><span className="brand-icon"><Icon name="lock" /></span><span>Omni<span className="brand-light">Lock</span><small>INVENTORY & OPERATIONS</small></span></Link>
      <button className="mobile-close icon-button" onClick={close} aria-label="Close navigation"><Icon name="close" /></button>
      <nav aria-label="Main navigation">{navigation.map(item => <div key={item.slug}>{item.group && <p className="nav-group">{item.group}</p>}<Link href={`/${item.slug}`} onClick={close} aria-current={pathname === `/${item.slug}` ? "page" : undefined} className={`nav-link ${pathname === `/${item.slug}` ? "active" : ""}`}><Icon name={item.icon} /><span>{item.label}</span>{pathname === `/${item.slug}` && <span className="nav-dot" />}</Link></div>)}</nav>
      <div className="sidebar-bottom"><span className="workspace-avatar">OL</span><div><strong>OmniLock workspace</strong><small>DBMS · Level 3</small></div></div>
    </aside>
  </>;
}

export function Header({ open, expanded }: { open: () => void; expanded: boolean }) {
  const pathname = usePathname();
  const title = navigation.find(item => `/${item.slug}` === pathname)?.label ?? "Workspace";
  return <header className="header"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="Open navigation" aria-expanded={expanded} aria-controls="main-navigation" onClick={open}><Icon name="menu" /></button><span>Workspace</span><span className="divider">/</span><strong>{title}</strong></div><div className="header-right"><span className="environment">Development workspace</span><span className="avatar" title="OmniLock workspace">OL</span></div></header>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="app-shell"><a className="skip-link" href="#main-content">Skip to content</a><Sidebar open={open} close={() => setOpen(false)} /><div className="main-shell"><Header open={() => setOpen(true)} expanded={open} /><main id="main-content" className="workspace">{children}</main><footer className="footer"><span>OmniLock <span className="footer-dot">·</span> Inventory & order management</span><span>One workspace. Every operation.</span></footer></div></div>;
}
