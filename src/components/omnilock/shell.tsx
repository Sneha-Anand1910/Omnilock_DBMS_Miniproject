"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "./icons";
import { navigation } from "./navigation";
import {
  initSoundState,
  setSoundEnabled,
  playNavSound,
  playHoverSound,
} from "@/lib/sound";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleRefresh = () => {
    playNavSound();
    startTransition(() => router.refresh());
  };

  return (
    <button
      className="button refresh-btn"
      disabled={pending}
      onClick={handleRefresh}
      title="Refresh snapshot from database"
    >
      <Icon name="refresh" className={pending ? "spin" : ""} />
      <span>{pending ? "Refreshing…" : "Refresh data"}</span>
      <span className="btn-glow-bar" />
    </button>
  );
}

export function SoundToggle() {
  const [enabled, setEnabled] = useState(() => initSoundState());

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    setSoundEnabled(next);
    if (next) {
      setTimeout(() => playNavSound(), 50);
    }
  };

  return (
    <button
      className={`audio-toggle ${enabled ? "is-active" : ""}`}
      onClick={handleToggle}
      aria-label={enabled ? "Mute interactive audio feedback" : "Enable interactive audio feedback"}
      title={enabled ? "Audio feedback: ON (Click to mute)" : "Audio feedback: MUTED (Click to activate)"}
    >
      <Icon name={enabled ? "soundOn" : "soundOff"} />
      <span className="audio-label">{enabled ? "AUDIO ON" : "MUTED"}</span>
    </button>
  );
}

export function Sidebar({
  open,
  close,
  rail,
  toggleRail,
}: {
  open: boolean;
  close: () => void;
  rail: boolean;
  toggleRail: () => void;
}) {
  const pathname = usePathname();
  const [navSearch, setNavSearch] = useState("");

  const isActive = (slug: string) => {
    const href = slug ? `/${slug}` : "/";
    return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  };

  const filteredNav = navigation.filter((item) => {
    if (!navSearch.trim()) return true;
    const q = navSearch.toLowerCase().trim();
    return (
      item.label.toLowerCase().includes(q) ||
      (item.group && item.group.toLowerCase().includes(q)) ||
      item.slug.toLowerCase().includes(q)
    );
  });

  return (
    <>
      {open && <button className="sidebar-overlay" aria-label="Close navigation" onClick={close} />}
      <aside
        id="main-navigation"
        aria-label="Primary"
        className={`sidebar ${open ? "is-open" : ""} ${rail ? "is-rail" : ""}`}
      >
        <div className="sidebar-glass-glow" aria-hidden="true" />
        <div className="sidebar-header">
          <Link
            href="/"
            className="brand"
            onClick={() => {
              playNavSound();
              close();
            }}
          >
            <span className="brand-icon">
              <Icon name="lock" />
              <span className="brand-pulse-ring" />
            </span>
            {!rail && (
              <span className="brand-text">
                <span className="brand-title">
                  Omni<span className="brand-light">Lock</span>
                </span>
                <small className="brand-sub">INVENTORY &amp; OPERATIONS</small>
              </span>
            )}
          </Link>

          <button
            type="button"
            className="rail-toggle-btn icon-button"
            onClick={toggleRail}
            title={rail ? "Expand sidebar navigation" : "Collapse to rail view"}
            aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon name={rail ? "chevronRight" : "chevronLeft"} />
          </button>

          <button
            className="mobile-close icon-button"
            onClick={close}
            aria-label="Close navigation"
          >
            <Icon name="close" />
          </button>
        </div>

        {!rail && (
          <div className="nav-search-container" role="search">
            <span className="search-icon">
              <Icon name="search" />
            </span>
            <input
              type="search"
              className="nav-search-input"
              placeholder="Search menu..."
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              aria-label="Search navigation items"
            />
            {navSearch && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setNavSearch("")}
                aria-label="Clear menu search"
              >
                ×
              </button>
            )}
          </div>
        )}

        <nav aria-label="Main navigation" className="nav-list-scroll">
          {filteredNav.map((item) => {
            const active = isActive(item.slug);
            return (
              <div key={item.slug || "dashboard"} className="nav-item-wrapper">
                {item.group && !rail && !navSearch && (
                  <p className="nav-group">{item.group}</p>
                )}
                <Link
                  href={item.slug ? `/${item.slug}` : "/"}
                  onClick={() => {
                    playNavSound();
                    close();
                  }}
                  onMouseEnter={() => playHoverSound()}
                  aria-current={active ? "page" : undefined}
                  className={`nav-link ${active ? "active" : ""}`}
                  title={rail ? item.label : undefined}
                >
                  <span className="nav-icon-box">
                    <Icon name={item.icon} />
                  </span>
                  {!rail && <span className="nav-label">{item.label}</span>}
                  {active && <span className="nav-active-pill" />}
                  {active && <span className="nav-glow-indicator" />}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="workspace-status-badge">
            <span className="status-radar-beacon">
              <span className="beacon-ping" />
              <span className="beacon-core" />
            </span>
            {!rail && (
              <div className="workspace-info">
                <strong>OmniLock workspace</strong>
                <small>DBMS · Level 3 · ONLINE</small>
              </div>
            )}
            {rail && <span className="rail-avatar">OL</span>}
          </div>
        </div>
      </aside>
    </>
  );
}

export function Header({ open, expanded }: { open: () => void; expanded: boolean }) {
  const pathname = usePathname();
  const current = navigation
    .filter(
      (item) => item.slug && (pathname === `/${item.slug}` || pathname.startsWith(`/${item.slug}/`))
    )
    .sort((a, b) => b.slug.length - a.slug.length)[0];

  const title = current?.label ?? (pathname === "/" ? "Dashboard" : "Workspace");
  const isTicketPage = pathname === "/tickets" || pathname.startsWith("/tickets/");
  const ticketChild =
    pathname === "/tickets/new"
      ? "Create Ticket"
      : pathname === "/tickets"
      ? null
      : "Ticket Details";

  return (
    <header className="header">
      <div className="header-glass-line" />
      <div className="breadcrumb">
        <button
          className="mobile-menu icon-button"
          aria-label="Open navigation"
          aria-expanded={expanded}
          aria-controls="main-navigation"
          onClick={open}
        >
          <Icon name="menu" />
        </button>

        {isTicketPage ? (
          <nav aria-label="Breadcrumb" className="header-crumbs">
            <Link href="/" onClick={() => playNavSound()}>
              Workspace
            </Link>
            <span className="divider" aria-hidden="true">
              /
            </span>
            {ticketChild ? (
              <>
                <Link href="/tickets" onClick={() => playNavSound()}>
                  Support Tickets
                </Link>
                <span className="divider" aria-hidden="true">
                  /
                </span>
                <strong aria-current="page">{ticketChild}</strong>
              </>
            ) : (
              <strong aria-current="page">Support Tickets</strong>
            )}
          </nav>
        ) : (
          <div className="breadcrumb-trail">
            <span className="crumb-root">Workspace</span>
            <span className="divider" aria-hidden="true">
              /
            </span>
            <strong className="crumb-active">{title}</strong>
          </div>
        )}
      </div>

      <div className="header-right">
        <SoundToggle />
        <span className="environment">
          <span className="environment-mark">
            <span className="beacon-ping" />
            <span className="beacon-core" />
          </span>
          <span className="env-text">OPERATIONS WORKSPACE</span>
        </span>
        <div className="avatar" title="OmniLock Operations Admin">
          <span>OL</span>
          <span className="avatar-ring" />
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [rail, setRail] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("omnilock_rail_mode") === "1";
    } catch {
      return false;
    }
  });

  const toggleRail = () => {
    const next = !rail;
    setRail(next);
    try {
      localStorage.setItem("omnilock_rail_mode", next ? "1" : "0");
    } catch {}
  };

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className={`app-shell ${rail ? "has-rail-nav" : ""}`}>
      <div className="cosmic-grid-overlay" aria-hidden="true" />
      <div className="ambient-spotlight-cyan" aria-hidden="true" />
      <div className="ambient-spotlight-violet" aria-hidden="true" />

      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <Sidebar
        open={open}
        close={() => setOpen(false)}
        rail={rail}
        toggleRail={toggleRail}
      />

      <div className={`main-shell ${rail ? "main-shell-rail" : ""}`}>
        <Header open={() => setOpen(true)} expanded={open} />
        <main id="main-content" className="workspace">
          {children}
        </main>
        <footer className="footer">
          <div className="footer-left">
            <span className="footer-brand">OmniLock</span>
            <span className="footer-dot">·</span>
            <span>Omnichannel Inventory &amp; Order Fulfillment Platform</span>
          </div>
          <div className="footer-right">
            <span className="sys-status">SYS 2035 · SPATIAL KERNEL v3.4</span>
            <span className="footer-dot">·</span>
            <span>One workspace. Every operation.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
