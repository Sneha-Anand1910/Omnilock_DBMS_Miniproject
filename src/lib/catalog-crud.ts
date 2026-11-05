import "server-only";
import { NextResponse } from "next/server";

type Kind = "products" | "warehouses";
class Invalid extends Error {}
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function text(value: unknown, label: string, limit?: number, required = false) {
  if (value === null || value === undefined) { if (required) throw new Invalid(label + " is required."); return null; }
  if (typeof value !== "string") throw new Invalid(label + " must be text.");
  const result = value.trim();
  if (result.includes("\u0000") || (required && !result) || (limit && Array.from(result).length > limit)) throw new Invalid("Invalid " + label.toLowerCase() + (limit ? "; maximum " + limit + " characters." : "."));
  return result || null;
}
function integer(value: unknown, label: string, minimum = 1) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > 2147483647) throw new Invalid(label + " must be an integer between " + minimum + " and 2147483647.");
  return value;
}
function id(value: string) {
  if (!/^[1-9]\d*$/.test(value)) throw new Invalid("Invalid ID.");
  return integer(Number(value), "ID");
}
function priceValue(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") throw new Invalid("Price is required.");
  const price = String(value).trim();
  // Validate the decimal representation before PostgreSQL can round it.
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(price)) throw new Invalid("Price must be between 0 and 99999999.99 with at most two decimal places.");
  return price;
}
function errorResponse(error: unknown, kind: Kind, deleting = false) {
  if (error instanceof Invalid) return json({ error: error.message }, 400);
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === "23505") return json({ error: "A product with this SKU already exists." }, 409);
  if (code === "23503") return json({ error: deleting ? (kind === "products" ? "This product is referenced by inventory or order items and cannot be deleted." : "This warehouse is referenced by inventory and cannot be deleted.") : "The selected category no longer exists. Select an existing category." }, deleting ? 409 : 400);
  if (["23514", "23502", "22001", "22003", "22P02"].includes(String(code))) return json({ error: "A field does not meet the database validation rules." }, 400);
  console.error("OmniLock catalog operation unavailable.");
  return json({ error: "Unable to complete the request. Please try again." }, 500);
}
export async function listCatalog(request: Request, kind: Kind) {
  try {
    const params = new URL(request.url).searchParams;
    const page = id(params.get("page") ?? "1");
    const pageSize = id(params.get("pageSize") ?? "10");
    if (pageSize > 100) throw new Invalid("pageSize must be between 1 and 100.");
    const search = text(params.get("search") ?? "", "Search") ?? "";
    const categoryId = kind === "products" && params.get("category_id") ? id(params.get("category_id")!) : null;
    const { sql } = await import("@/lib/neon-http");
    const offset = (page - 1) * pageSize;
    const rows = kind === "products" ? await sql`
      WITH filtered AS (
        SELECT p.product_id, p.product_name, p.sku, p.price::text AS price, p.description, p.category_id, c.category_name, to_jsonb(p)->>'created_at' AS created_at
        FROM public.product p JOIN public.category c ON c.category_id = p.category_id
        WHERE (${categoryId}::integer IS NULL OR p.category_id = ${categoryId})
          AND (${search} = '' OR strpos(lower(concat_ws(' ', p.product_id::text, p.product_name, p.sku, p.description)), lower(${search})) > 0)
      ), paged AS (SELECT * FROM filtered ORDER BY product_id DESC LIMIT ${pageSize} OFFSET ${offset})
      SELECT (SELECT count(*)::integer FROM filtered) AS total,
        COALESCE((SELECT json_agg(paged ORDER BY product_id DESC) FROM paged), '[]'::json) AS records,
        COALESCE((SELECT json_agg(c ORDER BY category_name, category_id) FROM (SELECT category_id, category_name FROM public.category) c), '[]'::json) AS categories
    ` : await sql`
      WITH filtered AS (
        SELECT warehouse_id, name, location, type, capacity, to_jsonb(warehouse)->>'created_at' AS created_at FROM public.warehouse
        WHERE ${search} = '' OR strpos(lower(concat_ws(' ', warehouse_id::text, name, location, type)), lower(${search})) > 0
      ), paged AS (SELECT * FROM filtered ORDER BY warehouse_id DESC LIMIT ${pageSize} OFFSET ${offset})
      SELECT (SELECT count(*)::integer FROM filtered) AS total,
        COALESCE((SELECT json_agg(paged ORDER BY warehouse_id DESC) FROM paged), '[]'::json) AS records
    `;
    return json({ success: true, [kind]: rows[0].records, total: rows[0].total, page, pageSize, ...(kind === "products" ? { categories: rows[0].categories } : {}) });
  } catch (error) { return errorResponse(error, kind); }
}
export async function getCatalog(recordId: string, kind: Kind) {
  try {
    const key = id(recordId);
    const { sql } = await import("@/lib/neon-http");
    const rows = kind === "products" ? await sql`SELECT p.product_id, p.product_name, p.sku, p.price::text AS price, p.description, p.category_id, c.category_name, to_jsonb(p)->>'created_at' AS created_at FROM public.product p JOIN public.category c ON c.category_id=p.category_id WHERE p.product_id=${key}` : await sql`SELECT warehouse_id, name, location, type, capacity, to_jsonb(warehouse)->>'created_at' AS created_at FROM public.warehouse WHERE warehouse_id=${key}`;
    if (!rows.length) return json({ error: "Record not found." }, 404);
    return json({ success: true, [kind === "products" ? "product" : "warehouse"]: rows[0] });
  } catch (error) { return errorResponse(error, kind); }
}
export async function saveCatalog(request: Request, kind: Kind, recordId?: string) {
  try {
    const key = recordId === undefined ? null : id(recordId);
    let body: unknown;
    try { body = await request.json(); } catch { throw new Invalid("Invalid JSON body."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Invalid("Request body must be an object.");
    const input = body as Record<string, unknown>;
    const name = text(input[kind === "products" ? "product_name" : "name"], "Name", kind === "products" ? 150 : 100, true);
    const sku = kind === "products" ? text(input.sku, "SKU", 50, true) : null;
    const price = kind === "products" ? priceValue(input.price) : null;
    const categoryId = kind === "products" ? integer(input.category_id, "Category ID") : null;
    const description = kind === "products" ? text(input.description, "Description") : null;
    const location = kind === "warehouses" ? text(input.location, "Location", 200, true) : null;
    const type = kind === "warehouses" ? text(input.type, "Type", 50) : null;
    const capacity = kind === "warehouses" ? integer(input.capacity, "Capacity", 0) : null;
    const { sql } = await import("@/lib/neon-http");
    if (kind === "products") {
      const categories = await sql`SELECT category_id FROM public.category WHERE category_id=${categoryId}`;
      if (!categories.length) throw new Invalid("Select an existing category.");
    }
    // Only parent-table metadata is changed. Never rewrite stock or historical prices.
    const rows = kind === "products" ? key === null
      ? await sql`INSERT INTO public.product (product_name, sku, price, description, category_id) VALUES (${name}, ${sku}, ${price}::numeric, ${description}, ${categoryId}) RETURNING product_id, product_name, sku, price::text AS price, description, category_id`
      : await sql`UPDATE public.product SET product_name=${name}, sku=${sku}, price=${price}::numeric, description=${description}, category_id=${categoryId} WHERE product_id=${key} RETURNING product_id, product_name, sku, price::text AS price, description, category_id`
      : key === null
      ? await sql`INSERT INTO public.warehouse (name, location, type, capacity) VALUES (${name}, ${location}, ${type}, ${capacity}) RETURNING warehouse_id, name, location, type, capacity`
      : await sql`UPDATE public.warehouse SET name=${name}, location=${location}, type=${type}, capacity=${capacity} WHERE warehouse_id=${key} RETURNING warehouse_id, name, location, type, capacity`;
    if (!rows.length) return json({ error: "Record not found." }, 404);
    return json({ success: true, [kind === "products" ? "product" : "warehouse"]: rows[0] }, key === null ? 201 : 200);
  } catch (error) { return errorResponse(error, kind); }
}
export async function deleteCatalog(recordId: string, kind: Kind) {
  try {
    const key = id(recordId);
    const { sql } = await import("@/lib/neon-http");
    // PostgreSQL's NO ACTION foreign keys are authoritative, even under concurrency.
    const rows = kind === "products" ? await sql`DELETE FROM public.product WHERE product_id=${key} RETURNING product_id` : await sql`DELETE FROM public.warehouse WHERE warehouse_id=${key} RETURNING warehouse_id`;
    if (!rows.length) return json({ error: "Record not found." }, 404);
    return json({ success: true });
  } catch (error) { return errorResponse(error, kind, true); }
}
