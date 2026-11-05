"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { DataTable, EmptyState, Panel, StatusBadge } from "@/components/omnilock/ui";
import { displayTime } from "@/lib/display-time";
import styles from "./users.module.css";

type User = { id: number; name: string; email: string; phone: string | null; role: "ADMIN" | "STAFF"; isActive: boolean; createdAt: string };
type Listing = { users: User[]; total: number; page: number; pageSize: number; managementReady: boolean };

export default function UsersView({ currentUserId }: { currentUserId: number }) {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [appliedRole, setAppliedRole] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [listing, setListing] = useState<Listing | null>(null);
  const [choices, setChoices] = useState<Record<number, "ADMIN" | "STAFF">>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/users?search=${encodeURIComponent(applied)}&role=${encodeURIComponent(appliedRole)}&page=${page}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || result.success !== true) throw new Error(result.message || "Unable to load accounts");
        return result as Listing;
      })
      .then((result) => {
        setListing(result);
        setChoices(Object.fromEntries(result.users.map((user) => [user.id, user.role])));
      })
      .catch((cause) => { if (cause.name !== "AbortError") { setListing(null); setError(cause.message || "Unable to load accounts"); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applied, appliedRole, page, refresh]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setLoading(true);
    setPage(1);
    setApplied(search.trim());
    setAppliedRole(roleFilter);
    setRefresh((value) => value + 1);
  }

  async function changeRole(user: User) {
    const role = choices[user.id] ?? user.role;
    if (role === user.role || saving !== null || inFlight.current || !listing?.managementReady || user.id === currentUserId) return;
    if (!window.confirm(`Change ${user.name}'s role from ${user.role} to ${role}?`)) return;
    inFlight.current = true;
    setSaving(user.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result.message || "Role change failed");
      setNotice(`${user.name} is now ${role === "ADMIN" ? "an Administrator" : "Staff"}. Their existing sessions were revoked; they must sign in again.`);
      setLoading(true);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Role change failed");
      setChoices((current) => ({ ...current, [user.id]: user.role }));
    } finally { inFlight.current = false; setSaving(null); }
  }

  async function changeStatus(user: User) {
    if (saving !== null || inFlight.current || !listing?.managementReady || user.id === currentUserId) return;
    const next = !user.isActive;
    if (!window.confirm(`${next ? "Enable" : "Disable"} ${user.name}'s account?${next ? "" : " Their sessions will be revoked immediately."}`)) return;
    inFlight.current = true; setSaving(user.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: next }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result.message || "Status change failed");
      setNotice(`${user.name}'s account is now ${next ? "active" : "disabled"}.`);
      setLoading(true); setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status change failed");
    } finally { inFlight.current = false; setSaving(null); }
  }

  const pages = Math.max(1, Math.ceil((listing?.total ?? 0) / (listing?.pageSize ?? 20)));
  return <>
    <div className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>User management</h1><p>Review Staff and Administrator accounts and approve role changes.</p></div></div>
    <Panel title="Application accounts" subtitle="Only Administrators can view or change account roles.">
      <form className={styles.filters} onSubmit={submit} role="search">
        <label>Search accounts<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email" /></label>
        <label>Role<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">All roles</option><option value="ADMIN">ADMIN</option><option value="STAFF">STAFF</option></select></label>
        <button className="button" type="submit">Search</button>
        <button className="button" type="button" onClick={() => { setSearch(""); setRoleFilter(""); setApplied(""); setAppliedRole(""); setPage(1); setError(""); setLoading(true); setRefresh((value) => value + 1); }}>Clear</button>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {listing && !listing.managementReady && <p className={styles.message} role="status">Apply the admin role-management migration in Neon to enable account changes and audit history.</p>}
      {loading ? <p className={styles.message} role="status">Loading accounts…</p> : !listing?.users.length ? <EmptyState message="No accounts match this search." /> : <>
        <DataTable caption="Application accounts" headers={["User ID", "Name", "Email", "Role", "Account status", "Created date", "Created time", "Management actions"]}>
          {listing.users.map((user) => <tr key={user.id}>
            <td>#{user.id}</td>
            <td><strong>{user.name}</strong>{user.id === currentUserId && <small>You</small>}</td>
            <td>{user.email}</td>
            <td><StatusBadge status={user.role} /></td>
            <td><StatusBadge status={user.isActive ? "ACTIVE" : "DISABLED"} /></td>
            <td>{displayTime(user.createdAt).date}</td>
            <td>{displayTime(user.createdAt).time}</td>
            <td><div className={styles.roleControls}>
              <select aria-label={`Role for ${user.name}`} value={choices[user.id] ?? user.role} disabled={saving !== null || !listing.managementReady || user.id === currentUserId} onChange={(event) => setChoices((current) => ({ ...current, [user.id]: event.target.value as "ADMIN" | "STAFF" }))}>
                <option value="STAFF">Staff</option><option value="ADMIN">Administrator</option>
              </select>
              <button className="button" type="button" disabled={saving !== null || !listing.managementReady || user.id === currentUserId || (choices[user.id] ?? user.role) === user.role} onClick={() => changeRole(user)}>{saving === user.id ? "Saving…" : "Save role"}</button>
              <button className="button" type="button" disabled={saving !== null || !listing.managementReady || user.id === currentUserId} onClick={() => changeStatus(user)}>{user.isActive ? "Disable" : "Enable"}</button>
            </div></td>
          </tr>)}
        </DataTable>
        {pages > 1 && <div className={styles.pagination}>
          <button className="button" type="button" disabled={page <= 1 || loading} onClick={() => { setLoading(true); setPage(page - 1); }}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button className="button" type="button" disabled={page >= pages || loading} onClick={() => { setLoading(true); setPage(page + 1); }}>Next</button>
        </div>}
      </>}
      <p className={styles.message}>Role changes revoke the affected account&apos;s sessions. The last active Administrator cannot be demoted or disabled.</p>
    </Panel>
  </>;
}
