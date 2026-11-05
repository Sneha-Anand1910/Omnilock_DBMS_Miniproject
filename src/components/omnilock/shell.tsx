"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "./icons";
import { navigation } from "./navigation";
import { displayTime } from "@/lib/display-time";
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
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(initSoundState());
  }, []);

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

function ProfileMenu() {
  const [user, setUser] = useState<{ name: string; email: string; phone: string | null; role: "STAFF" | "ADMIN" } | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async response => response.ok ? response.json() : null)
      .then(result => { if (result?.success) setUser(result.user); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") setOpen(false);
      if (event instanceof MouseEvent && !container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  async function logout() {
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed");
      window.location.assign("/login");
    } catch {
      setError("Could not sign out. Please retry.");
    }
  }

  const initials = user?.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "OL";
  return (
    <div className="profile-wrap" ref={container}>
      <button className="avatar" type="button" title={user?.name ?? "Profile"} aria-label="Open account details" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <span>{initials}</span><span className="avatar-ring" />
      </button>
      {open && <div className="profile-popover">
        <strong>{user?.name ?? "Account"}</strong>
        <span>{user?.email ?? "Loading account…"}</span>
        {user && <span>{user.role === "ADMIN" ? "Administrator" : "Staff"}</span>}
        {user?.phone && <span>{user.phone}</span>}
        {error && <p role="alert">{error}</p>}
        {user?.role === "ADMIN" && <Link className="profile-admin-link" href="/admin/users" onClick={() => setOpen(false)}>User management</Link>}
        <button type="button" onClick={logout}>Log out</button>
      </div>}
    </div>
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
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (!controller.signal.aborted) setIsAdmin(result?.user?.role === "ADMIN"); })
      .catch(() => { if (!controller.signal.aborted) setIsAdmin(false); });
    return () => controller.abort();
  }, [pathname]);

  const isActive = (slug: string) => {
    const href = slug ? `/${slug}` : "/";
    return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  };

  const filteredNav = navigation.filter((item) => {
    if ("adminOnly" in item && item.adminOnly && !isAdmin) return false;
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

      </aside>
    </>
  );
}

export function Header({ open, expanded }: { open: () => void; expanded: boolean }) {
  const pathname = usePathname();
  const [clock, setClock] = useState<string>("");
  useEffect(() => {
    const tick = () => {
      const current = displayTime(new Date());
      setClock(`${current.date} | ${current.time}`);
    };
    tick();
    const timer = window.setInterval(tick, 15_000);
    return () => window.clearInterval(timer);
  }, []);
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
        <time className="workspace-clock" aria-label="Current date and time in India">{clock || "India time"}</time>
        <SoundToggle />
        <span className="environment">
          <span className="environment-mark">
            <span className="beacon-ping" />
            <span className="beacon-core" />
          </span>
          <span className="env-text">OPERATIONS WORKSPACE</span>
        </span>
        <ProfileMenu />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rail, setRail] = useState(false);

  useEffect(() => {
    try {
      setRail(localStorage.getItem("omnilock_rail_mode") === "1");
    } catch {
      // Keep the server-rendered default when storage is unavailable.
    }
  }, []);

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

  if (pathname === "/login") return <>{children}</>;

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
        <main id="main-content" className="workspace" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
