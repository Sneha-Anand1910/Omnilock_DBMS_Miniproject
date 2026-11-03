"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { DataTable, EmptyState, Panel } from "@/components/omnilock/ui";
import "./directory.css";

type Kind = "customers" | "categories";
type Row = Record<string, string | number | null>;
type Listing = { rows: Row[]; total: number; page: number; pageSize: number };
type Notice = { error: boolean; message: string };
type Field = { key: string; label: string; required?: boolean; max?: number; type?: string; multiline?: boolean };
const customerFields: Field[] = [
  { key: "name", label: "Name", required: true, max: 100 },
  { key: "email", label: "Email", required: true, max: 150, type: "email" },
  { key: "phone", label: "Phone", max: 15, type: "tel" },
  { key: "address", label: "Address", multiline: true },
];
const categoryFields: Field[] = [
  { key: "category_name", label: "Category name", required: true, max: 100 },
  { key: "description", label: "Description", multiline: true },
];
class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function request(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const result = await fetch(url, { cache: "no-store", ...init });
  const body = await result.json().catch(() => null);
  if (!result.ok) throw new RequestError(typeof body?.error === "string" ? body.error : "Request failed. Please try again.", result.status);
  if (!body || body.success !== true) throw new Error("The server response could not be confirmed.");
  return body;
}
function message(error: unknown) { return error instanceof Error ? error.message : "Request failed."; }
function parseRow(value: unknown, idKey: string, fields: Field[]): Row {
  if (!value || typeof value !== "object") throw new Error("Invalid record response.");
  const row = value as Row;
  if (typeof row[idKey] !== "number" || !Number.isInteger(row[idKey]) || Number(row[idKey]) < 1 ||
    fields.some(field => typeof row[field.key] !== "string" && !(row[field.key] === null && !field.required))) {
    throw new Error("Invalid record response.");
  }
  return row;
}
export default function DirectoryManager({ kind }: { kind: Kind }) {
  const customer = kind === "customers";
  const title = customer ? "Customers" : "Categories";
  const singular = customer ? "customer" : "category";
  const idKey = customer ? "customer_id" : "category_id";
  const nameKey = customer ? "name" : "category_name";
  const fields = customer ? customerFields : categoryFields;
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState({ search: "", page: 1 });
  const [revision, setRevision] = useState(0);
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const inFlight = useRef(false);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const editingRef = useRef<number | null>(null);
  const listRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listRequest.current = controller;
    const isCurrent = () => !controller.signal.aborted && listRequest.current === controller;
    const params = new URLSearchParams({ search: query.search, page: String(query.page), pageSize: "10" });
    request("/api/" + kind + "?" + params, { signal: controller.signal }).then(body => {
      if (!Array.isArray(body[kind]) || typeof body.total !== "number" || !Number.isSafeInteger(body.total) || body.total < 0 || body.page !== query.page || body.pageSize !== 10) throw new Error("Invalid listing response.");
      const rows = (body[kind] as unknown[]).map(row => parseRow(row, idKey, fields));
      if (isCurrent()) {
        const last = Math.max(1, Math.ceil(body.total / 10));
        if (query.page > last) { setQuery(value => ({ ...value, page: last })); return; }
        setListing({ rows, total: body.total, page: query.page, pageSize: 10 });
      }
    }).catch(error => { if (isCurrent()) setLoadError(message(error)); })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => controller.abort();
  }, [kind, query, revision, idKey, fields]);

  function reset() { setEditing(null); editingRef.current = null; setDraft({}); }
  function refresh() { setLoading(true); setLoadError(""); setRevision(value => value + 1); }
  function changeQuery(next: { search: string; page: number }) {
    // Invalidate immediately, before React runs the next effect's cleanup.
    listRequest.current?.abort(); setLoading(true); setLoadError("");
    setQuery(next);
  }
  function changeSearch(value: string) {
    setSearch(value);
    if (customer && !value.trim()) changeQuery({ search: "", page: 1 });
  }
  function clearSearch() { setSearch(""); changeQuery({ search: "", page: 1 }); }
  function refreshVisibleSearch() {
    if (!customer) { refresh(); return; }
    const visibleSearch = search.trim();
    changeQuery({ search: visibleSearch, page: visibleSearch === query.search ? query.page : 1 });
  }
  async function edit(id: number) {
    if (inFlight.current || uncertain) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try {
      const body = await request("/api/" + kind + "/" + id);
      const row = parseRow(body[singular], idKey, fields);
      setEditing(id); editingRef.current = id;
      setDraft(Object.fromEntries(fields.map(field => [field.key, String(row[field.key] ?? "")])));
      formHeading.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formHeading.current?.focus();
    } catch (error) { setNotice({ error: true, message: message(error) }); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || uncertain) return;
    const body = Object.fromEntries(fields.map(field => [field.key, (draft[field.key] ?? "").trim()]));
    const invalid = fields.find(field => (field.required && !body[field.key]) || (field.max && Array.from(body[field.key]).length > field.max));
    if (invalid) { setNotice({ error: true, message: "Check " + invalid.label.toLowerCase() + " and its length." }); return; }
    inFlight.current = true; setBusy(true); setNotice(null);
    try {
      const result = await request("/api/" + kind + (editing === null ? "" : "/" + editing), {
        method: editing === null ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      parseRow(result[singular], idKey, fields);
      setNotice({ error: false, message: title.slice(0, 1) + singular.slice(1) + (editing === null ? " created." : " updated.") });
      reset(); refresh();
    } catch (error) {
      const unknown = !(error instanceof RequestError) || error.status >= 500;
      if (unknown) { setUncertain(true); refresh(); }
      setNotice({ error: true, message: unknown ? "The save could not be confirmed. Refresh and inspect the records before retrying; it may already have succeeded." : message(error) });
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function remove(row: Row) {
    if (inFlight.current || uncertain) return;
    const id = Number(row[idKey]);
    if (!window.confirm("Delete " + singular + ' "' + row[nameKey] + '"? ' + (customer ? "Customers referenced by orders cannot be deleted." : "Categories referenced by products cannot be deleted."))) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try {
      await request("/api/" + kind + "/" + id, { method: "DELETE" });
      if (editingRef.current === id) reset();
      setNotice({ error: false, message: "Record deleted." }); refresh();
    } catch (error) {
      setNotice({ error: true, message: error instanceof RequestError && error.status < 500 ? message(error) : "Deletion could not be confirmed. Refresh the list to check its current state." });
      refresh();
    } finally { inFlight.current = false; setBusy(false); }
  }
  function applySearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); changeQuery({ search: search.trim(), page: 1 }); }
  const pages = listing ? Math.max(1, Math.ceil(listing.total / listing.pageSize)) : 1;
  return <div className="ol-directory">
    <div className="page-heading"><div><p className="eyebrow">DIRECTORY</p><h1>{title}</h1><p>{customer ? "Manage customer contact details and order relationships." : "Organize the categories used by your products."}</p></div><button className="button" disabled={busy || loading} onClick={refreshVisibleSearch}>Refresh data</button></div>
    {notice && <div className={"ol-directory-notice " + (notice.error ? "ol-directory-error" : "ol-directory-success")} role={notice.error ? "alert" : "status"}>{notice.message}</div>}
    <Panel title={editing === null ? "Add " + singular : "Edit " + singular + " #" + editing} subtitle="Required fields are marked *. Changes are saved to PostgreSQL.">
      <h2 className="sr-only" ref={formHeading} tabIndex={-1}>{editing === null ? "Add" : "Edit"} {singular} form</h2>
      <form className="ol-directory-form" onSubmit={save}>
        {fields.map(field => <div className={"ol-directory-field" + (field.multiline ? " ol-directory-wide" : "")} key={field.key}>
          <label htmlFor={kind + "-" + field.key}>{field.label}{field.required ? " *" : ""}</label>
          {field.multiline ? <textarea id={kind + "-" + field.key} rows={3} value={draft[field.key] ?? ""} disabled={busy || uncertain} onChange={event => setDraft(value => ({ ...value, [field.key]: event.target.value }))} /> :
            <input id={kind + "-" + field.key} type={field.type ?? "text"} required={field.required} maxLength={field.max} value={draft[field.key] ?? ""} disabled={busy || uncertain} onChange={event => setDraft(value => ({ ...value, [field.key]: event.target.value }))} />}
        </div>)}
        <div className="ol-directory-actions ol-directory-wide"><button className="button primary" disabled={busy || uncertain} type="submit">{busy ? "Working…" : editing === null ? "Add " + singular : "Save changes"}</button>{editing !== null && <button className="button" type="button" disabled={busy || uncertain} onClick={reset}>Cancel edit</button>}</div>
      </form>
      {uncertain && <div className="ol-directory-body"><p>Check the refreshed listing before enabling another save.</p><button className="button" disabled={busy || loading || !!loadError} onClick={() => { setUncertain(false); reset(); setNotice(null); }}>I have checked the records</button></div>}
    </Panel>
    <Panel title={title + " register"} subtitle={customer ? "Search by ID, name, email, phone or address." : "Search by ID, category name or description."}>
      <form className="ol-directory-filters" role="search" onSubmit={applySearch}><div className="ol-directory-field"><label htmlFor={kind + "-search"}>Search {kind}</label><input id={kind + "-search"} type="search" value={search} onChange={event => changeSearch(event.target.value)} placeholder={"Search " + kind + "…"} /></div><button className="button" type="submit">Search</button><button className="button" type="button" onClick={clearSearch}>Clear</button></form>
      {loading ? <p className="ol-directory-body" role="status">Loading {kind}…</p> : loadError ? <div className="ol-directory-body"><p role="alert">{loadError}</p><button className="button" onClick={refresh}>Retry</button></div> : listing?.rows.length ? <DataTable caption={title + " records"} headers={["ID", ...fields.map(field => field.label), "Actions"]}>
        {listing.rows.map(row => <tr key={String(row[idKey])}><td>#{row[idKey]}</td>{fields.map(field => <td key={field.key} className="ol-directory-cell">{row[field.key] || "—"}</td>)}<td><div className="ol-directory-actions"><button className="button" disabled={busy || uncertain} onClick={() => void edit(Number(row[idKey]))} aria-label={"Edit " + row[nameKey]}>Edit</button><button className="button ol-directory-delete" disabled={busy || uncertain} onClick={() => void remove(row)} aria-label={"Delete " + row[nameKey]}>Delete</button></div></td></tr>)}
      </DataTable> : <EmptyState message={query.search ? "No matching records. Adjust your search." : "No records yet. Add the first one above."} />}
      {!loading && listing && <nav aria-label={title + " pagination"} className="ol-directory-pagination"><span>{listing.total} records · Page {listing.page} of {pages}</span><div className="ol-directory-actions"><button className="button" disabled={busy || listing.page <= 1} onClick={() => changeQuery({ ...query, page: query.page - 1 })}>Previous</button><button className="button" disabled={busy || listing.page >= pages} onClick={() => changeQuery({ ...query, page: query.page + 1 })}>Next</button></div></nav>}
      <p className="ol-directory-footnote">{customer ? "Customers linked to orders cannot be deleted." : "Categories linked to products cannot be deleted."}</p>
    </Panel>
  </div>;
}
