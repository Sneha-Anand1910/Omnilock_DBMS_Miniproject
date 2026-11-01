"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { DataTable, EmptyState, Panel } from "@/components/omnilock/ui";
import "./catalog.css";

type Kind = "products" | "warehouses";
type Row = Record<string, string | number | null>;
type Category = { category_id: number; category_name: string };
type Query = { search: string; category: string; page: number };
type Field = { key: string; label: string; required?: boolean; max?: number; multiline?: boolean; numeric?: boolean };
const productFields: Field[] = [
  { key: "product_name", label: "Product name", required: true, max: 150 },
  { key: "sku", label: "SKU", required: true, max: 50 },
  { key: "price", label: "Price", required: true, numeric: true },
  { key: "category_id", label: "Category", required: true },
  { key: "description", label: "Description", multiline: true },
];
const warehouseFields: Field[] = [
  { key: "name", label: "Name", required: true, max: 100 },
  { key: "location", label: "Location", required: true, max: 200 },
  { key: "type", label: "Type", max: 50 },
  { key: "capacity", label: "Capacity", required: true, numeric: true },
];
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(typeof body?.error === "string" ? body.error : "Request failed. Please try again.", response.status);
  if (!body || body.success !== true) throw new Error("Unable to confirm the server response.");
  return body;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : "Request failed.";
function parseRow(value: unknown, product: boolean): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid record response.");
  const row = value as Row;
  const key = product ? "product_id" : "warehouse_id";
  const fields = product ? productFields : warehouseFields;
  if (!Number.isInteger(row[key]) || Number(row[key]) < 1 || fields.some(field => {
    const value = row[field.key];
    if (field.key === "capacity" || field.key === "category_id") return typeof value !== "number" || !Number.isInteger(value) || value < (field.key === "category_id" ? 1 : 0);
    return typeof value !== "string" && !(value === null && !field.required);
  })) throw new Error("Invalid record response.");
  return row;
}
export default function CatalogManager({ kind }: { kind: Kind }) {
  const product = kind === "products";
  const title = product ? "Products" : "Warehouses";
  const singular = product ? "product" : "warehouse";
  const idKey = product ? "product_id" : "warehouse_id";
  const fields = product ? productFields : warehouseFields;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState<Query>({ search: "", category: "", page: 1 });
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const inFlight = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  const editor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current = controller;
    const current = () => !controller.signal.aborted && activeRequest.current === controller;
    setLoading(true); setLoadError(""); setRows([]);
    const params = new URLSearchParams({ search: query.search, page: String(query.page), pageSize: "10", category_id: query.category });
    request("/api/" + kind + "?" + params, { signal: controller.signal }).then(body => {
      if (!Array.isArray(body[kind]) || typeof body.total !== "number" || !Number.isSafeInteger(body.total) || body.total < 0 || body.page !== query.page || body.pageSize !== 10) throw new Error("Invalid listing response.");
      const records = (body[kind] as unknown[]).map(row => parseRow(row, product));
      if (product && (!Array.isArray(body.categories) || body.categories.some(item => !item || !Number.isInteger(item.category_id) || item.category_id < 1 || typeof item.category_name !== "string"))) throw new Error("Invalid category response.");
      if (!current()) return;
      if (product) { setCategories(body.categories as Category[]); setCategoriesReady(true); }
      const last = Math.max(1, Math.ceil(body.total / 10));
      if (query.page > last) { setQuery(value => ({ ...value, page: last })); return; }
      setRows(records); setTotal(body.total);
    }).catch(error => { if (current()) { setLoadError(errorText(error)); if (product) setCategoriesReady(false); } })
      .finally(() => { if (current()) setLoading(false); });
    return () => controller.abort();
  }, [kind, product, query, revision]);

  function apply(next: Query) { activeRequest.current?.abort(); setLoading(true); setQuery(next); }
  function refreshRecords() { activeRequest.current?.abort(); setLoading(true); setRevision(value => value + 1); }
  function refreshVisible() { apply({ search: search.trim(), category: filter, page: search.trim() === query.search && filter === query.category ? query.page : 1 }); }
  function clear() { setSearch(""); setFilter(""); apply({ search: "", category: "", page: 1 }); }
  function resetEditor() { setEditing(null); setDraft({}); }
  async function edit(id: number) {
    if (inFlight.current || uncertain) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try {
      const body = await request("/api/" + kind + "/" + id);
      const row = parseRow(body[singular], product);
      setEditing(id); setDraft(Object.fromEntries(fields.map(field => [field.key, String(row[field.key] ?? "")])));
      editor.current?.scrollIntoView({ behavior: "smooth", block: "start" }); editor.current?.focus();
    } catch (error) { setNotice({ error: true, text: errorText(error) }); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || uncertain) return;
    const values = Object.fromEntries(fields.map(field => [field.key, (draft[field.key] ?? "").trim()]));
    const invalid = fields.find(field => field.required && !values[field.key] || field.max && Array.from(values[field.key]).length > field.max);
    if (invalid) { setNotice({ error: true, text: "Check " + invalid.label.toLowerCase() + " and its maximum length." }); return; }
    if (product && (!/^\d{1,8}(\.\d{1,2})?$/.test(values.price) || !categories.some(category => String(category.category_id) === values.category_id))) {
      setNotice({ error: true, text: "Select an existing category and enter a price from 0 to 99999999.99 with at most two decimal places." }); return;
    }
    if (!product && (!/^\d+$/.test(values.capacity) || Number(values.capacity) > 2147483647)) { setNotice({ error: true, text: "Capacity must be a whole number from 0 to 2147483647." }); return; }
    const body = product ? { ...values, category_id: Number(values.category_id) } : { ...values, capacity: Number(values.capacity) };
    inFlight.current = true; setBusy(true); setNotice(null);
    try {
      const result = await request("/api/" + kind + (editing === null ? "" : "/" + editing), { method: editing === null ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      parseRow(result[singular], product);
      setNotice({ error: false, text: (product ? "Product" : "Warehouse") + (editing === null ? " created." : " updated.") });
      resetEditor(); refreshRecords();
    } catch (error) {
      const unknown = !(error instanceof ApiError) || error.status >= 500;
      if (unknown) { setUncertain(true); refreshRecords(); }
      setNotice({ error: true, text: unknown ? "The save could not be confirmed. Inspect the refreshed records before retrying; the change may already be saved." : errorText(error) });
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function remove(row: Row) {
    if (inFlight.current || uncertain) return;
    if (!window.confirm('Delete ' + singular + ' "' + row[product ? "product_name" : "name"] + '"? Referenced records cannot be deleted.')) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try {
      await request("/api/" + kind + "/" + row[idKey], { method: "DELETE" });
      if (editing === row[idKey]) resetEditor();
      setNotice({ error: false, text: "Record deleted." });
    } catch (error) { setNotice({ error: true, text: error instanceof ApiError && error.status < 500 ? errorText(error) : "Deletion could not be confirmed. Check the refreshed listing before retrying." }); }
    finally { refreshRecords(); inFlight.current = false; setBusy(false); }
  }
  const editorDisabled = busy || uncertain || (product && (!categoriesReady || categories.length === 0));
  const pages = Math.max(1, Math.ceil(total / 10));
  return <div className="ol-catalog">
    <div className="page-heading"><div><p className="eyebrow">WORKSPACE</p><h1>{title}</h1><p>{product ? "Manage products, categories and current prices." : "Manage warehouse locations and capacity information."}</p></div><button className="button" disabled={busy || loading} onClick={refreshVisible}>Refresh data</button></div>
    {notice && <div role={notice.error ? "alert" : "status"} className={"ol-catalog-notice " + (notice.error ? "ol-catalog-error" : "ol-catalog-success")}>{notice.text}</div>}
    <div ref={editor} tabIndex={-1} className="ol-catalog-editor">
      <Panel title={editing === null ? "Add " + singular : "Edit " + singular + " #" + editing} subtitle="Required fields are marked *. Inventory quantities are managed separately.">
        {product && !categoriesReady && <p className="ol-catalog-body">{loading ? "Loading categories…" : "Categories are unavailable. Refresh data to retry."}</p>}
        {product && categoriesReady && !categories.length && <p className="ol-catalog-body">Create a category in the Categories module, then refresh this page to add products.</p>}
        <form className="ol-catalog-form" onSubmit={save}>
          {fields.map(field => <div key={field.key} className={"ol-catalog-field" + (field.multiline ? " ol-catalog-wide" : "")}>
            <label htmlFor={kind + "-" + field.key}>{field.label}{field.required ? " *" : ""}</label>
            {field.key === "category_id" ? <select id={kind + "-" + field.key} required disabled={editorDisabled} value={draft.category_id ?? ""} onChange={event => setDraft(value => ({ ...value, category_id: event.target.value }))}><option value="">Select category</option>{draft.category_id && !categories.some(c => String(c.category_id) === draft.category_id) && <option value={draft.category_id} disabled>Category unavailable — select another</option>}{categories.map(category => <option key={category.category_id} value={category.category_id}>{category.category_name}</option>)}</select>
              : field.multiline ? <textarea id={kind + "-" + field.key} rows={3} disabled={editorDisabled} value={draft[field.key] ?? ""} onChange={event => setDraft(value => ({ ...value, [field.key]: event.target.value }))} />
              : <input id={kind + "-" + field.key} type="text" inputMode={field.numeric ? (product ? "decimal" : "numeric") : undefined} required={field.required} maxLength={field.max} disabled={editorDisabled} value={draft[field.key] ?? ""} onChange={event => setDraft(value => ({ ...value, [field.key]: event.target.value }))} />}
          </div>)}
          <div className="ol-catalog-actions ol-catalog-wide"><button className="button primary" disabled={editorDisabled} type="submit">{busy ? "Working…" : editing === null ? "Add " + singular : "Save changes"}</button>{editing !== null && <button className="button" type="button" disabled={busy || uncertain} onClick={resetEditor}>Cancel edit</button>}</div>
        </form>
        {uncertain && <div className="ol-catalog-body"><p>Check the records before enabling another save.</p><button className="button" disabled={busy || loading || !!loadError} onClick={() => { setUncertain(false); resetEditor(); setNotice(null); }}>I have checked the records</button></div>}
      </Panel>
    </div>
    <Panel title={title + " register"} subtitle={product ? "Search product ID, name, SKU or description." : "Search warehouse ID, name, location or type."}>
      <form className={"ol-catalog-filters" + (product ? " ol-catalog-product-filters" : "")} role="search" onSubmit={event => { event.preventDefault(); apply({ search: search.trim(), category: filter, page: 1 }); }}>
        <div className="ol-catalog-field"><label htmlFor={kind + "-search"}>Search {kind}</label><input id={kind + "-search"} type="search" value={search} onChange={event => { const value = event.target.value; setSearch(value); if (!value.trim()) apply({ search: "", category: filter, page: 1 }); }} /></div>
        {product && <div className="ol-catalog-field"><label htmlFor="product-category-filter">Category</label><select id="product-category-filter" value={filter} onChange={event => { setFilter(event.target.value); apply({ search: search.trim(), category: event.target.value, page: 1 }); }}><option value="">All categories</option>{filter && !categories.some(c => String(c.category_id) === filter) && <option value={filter}>Category unavailable</option>}{categories.map(category => <option key={category.category_id} value={category.category_id}>{category.category_name}</option>)}</select></div>}
        <button className="button" type="submit">Search</button><button className="button" type="button" onClick={clear}>Clear</button>
      </form>
      {loading ? <p className="ol-catalog-body" role="status">Loading {kind}…</p> : loadError ? <div className="ol-catalog-body"><p role="alert">{loadError}</p><button className="button" onClick={refreshVisible}>Retry</button></div> : rows.length ? <DataTable caption={title + " records"} headers={product ? ["ID", "Name", "SKU", "Category", "Price", "Actions"] : ["ID", "Name", "Location", "Type", "Capacity", "Actions"]}>
        {rows.map(row => <tr key={String(row[idKey])}><td>#{row[idKey]}</td>{(product ? ["product_name", "sku", "category_name", "price"] : ["name", "location", "type", "capacity"]).map(key => <td className="ol-catalog-cell" key={key}>{row[key] ?? "—"}</td>)}<td><div className="ol-catalog-actions"><button className="button" disabled={busy || uncertain} aria-label={"Edit " + row[product ? "product_name" : "name"]} onClick={() => void edit(Number(row[idKey]))}>Edit</button><button className="button ol-catalog-delete" disabled={busy || uncertain} aria-label={"Delete " + row[product ? "product_name" : "name"]} onClick={() => void remove(row)}>Delete</button></div></td></tr>)}
      </DataTable> : <EmptyState message={query.search || query.category ? "No matching records. Adjust or clear the filters." : "No records yet. Add one using the form above."} />}
      {!loading && !loadError && <nav className="ol-catalog-pagination" aria-label={title + " pagination"}><span>{total} records · Page {query.page} of {pages}</span><div className="ol-catalog-actions"><button className="button" disabled={busy || query.page <= 1} onClick={() => apply({ ...query, page: query.page - 1 })}>Previous</button><button className="button" disabled={busy || query.page >= pages} onClick={() => apply({ ...query, page: query.page + 1 })}>Next</button></div></nav>}
      <p className="ol-catalog-footnote">{product ? "Products referenced by inventory or order items cannot be deleted. Price changes do not rewrite existing orders." : "Warehouses referenced by inventory cannot be deleted. Capacity is informational; editing it does not move or adjust stock."}</p>
    </Panel>
  </div>;
}
