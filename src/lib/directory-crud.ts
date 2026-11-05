import "server-only";
import { NextResponse } from "next/server";

type Kind = "customers" | "categories";
class InvalidInput extends Error {}
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function text(value: unknown, field: string, max?: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new InvalidInput(field + " is required.");
    return null;
  }
  if (typeof value !== "string") throw new InvalidInput(field + " must be text.");
  const trimmed = value.trim();
  if (trimmed.includes("\u0000")) throw new InvalidInput(field + " contains an invalid character.");
  if (required && !trimmed) throw new InvalidInput(field + " is required.");
  if (max && Array.from(trimmed).length > max) throw new InvalidInput(field + " must be at most " + max + " characters.");
  return trimmed || null;
}
function idValue(value: string) {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) throw new InvalidInput("Invalid record ID.");
  return Number(value);
}
function pagination(value: string | null, fallback: number, max: number) {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw new InvalidInput("Invalid pagination. pageSize must be between 1 and 100.");
  return Number(value);
}
function handleError(error: unknown, kind: Kind) {
  if (error instanceof InvalidInput) return response({ error: error.message }, 400);
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === "23505") return response({ error: kind === "customers" ? "A customer with this email already exists." : "A category with this name already exists." }, 409);
  if (code === "23503") return response({ error: kind === "customers" ? "This customer is referenced by orders and cannot be deleted." : "This category is referenced by products and cannot be deleted." }, 409);
  if (code === "22001" || code === "23502" || code === "22P02") return response({ error: "Invalid field value." }, 400);
  console.error("OmniLock directory request failed.");
  return response({ error: "Unable to complete the request. Please try again." }, 500);
}
export async function listRecords(request: Request, kind: Kind) {
  try {
    const params = new URL(request.url).searchParams;
    const page = pagination(params.get("page"), 1, 2147483647);
    const pageSize = pagination(params.get("pageSize"), 10, 100);
    const search = (params.get("search") ?? "").trim();
    if (search.includes("\u0000")) throw new InvalidInput("Invalid search text.");
    const { sql } = await import("@/lib/neon-http");
    const offset = (page - 1) * pageSize;
    // strpos treats search text literally; no wildcard or SQL interpolation.
    const rows = kind === "customers" ? await sql`
      WITH filtered AS (
        SELECT customer_id, name, email, phone, address, to_jsonb(customer)->>'created_at' AS created_at FROM public.customer
        WHERE ${search} = '' OR strpos(lower(concat_ws(' ', customer_id::text, name, email, phone, address)), lower(${search})) > 0
      ), paged AS (SELECT * FROM filtered ORDER BY customer_id DESC LIMIT ${pageSize} OFFSET ${offset})
      SELECT (SELECT count(*)::integer FROM filtered) AS total,
        COALESCE((SELECT json_agg(paged ORDER BY customer_id DESC) FROM paged), '[]'::json) AS records
    ` : await sql`
      WITH filtered AS (
        SELECT category_id, category_name, description, to_jsonb(category)->>'created_at' AS created_at FROM public.category
        WHERE ${search} = '' OR strpos(lower(concat_ws(' ', category_id::text, category_name, description)), lower(${search})) > 0
      ), paged AS (SELECT * FROM filtered ORDER BY category_id DESC LIMIT ${pageSize} OFFSET ${offset})
      SELECT (SELECT count(*)::integer FROM filtered) AS total,
        COALESCE((SELECT json_agg(paged ORDER BY category_id DESC) FROM paged), '[]'::json) AS records
    `;
    return response({ success: true, [kind]: rows[0].records, total: rows[0].total, page, pageSize });
  } catch (error) { return handleError(error, kind); }
}
export async function getRecord(id: string, kind: Kind) {
  try {
    const recordId = idValue(id);
    const { sql } = await import("@/lib/neon-http");
    const rows = kind === "customers"
      ? await sql`SELECT customer_id, name, email, phone, address, to_jsonb(customer)->>'created_at' AS created_at FROM public.customer WHERE customer_id = ${recordId}`
      : await sql`SELECT category_id, category_name, description, to_jsonb(category)->>'created_at' AS created_at FROM public.category WHERE category_id = ${recordId}`;
    if (!rows.length) return response({ error: "Record not found." }, 404);
    return response({ success: true, [kind === "customers" ? "customer" : "category"]: rows[0] });
  } catch (error) { return handleError(error, kind); }
}
export async function saveRecord(request: Request, kind: Kind, id?: string) {
  try {
    const recordId = id === undefined ? null : idValue(id);
    let body: unknown;
    try { body = await request.json(); } catch { throw new InvalidInput("Invalid JSON body."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new InvalidInput("Request body must be an object.");
    const input = body as Record<string, unknown>;
    // Validate before opening the database connection.
    const name = text(input[kind === "customers" ? "name" : "category_name"], "Name", 100, true);
    const email = kind === "customers" ? text(input.email, "Email", 150, true) : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InvalidInput("Enter a valid email address.");
    const phone = kind === "customers" ? text(input.phone, "Phone", 15) : null;
    const optionalText = text(input[kind === "customers" ? "address" : "description"], kind === "customers" ? "Address" : "Description");
    const { sql } = await import("@/lib/neon-http");
    const rows = kind === "customers"
      ? recordId === null
        ? await sql`INSERT INTO public.customer (name, email, phone, address) VALUES (${name}, ${email}, ${phone}, ${optionalText}) RETURNING customer_id, name, email, phone, address`
        : await sql`UPDATE public.customer SET name = ${name}, email = ${email}, phone = ${phone}, address = ${optionalText} WHERE customer_id = ${recordId} RETURNING customer_id, name, email, phone, address`
      : recordId === null
        ? await sql`INSERT INTO public.category (category_name, description) VALUES (${name}, ${optionalText}) RETURNING category_id, category_name, description`
        : await sql`UPDATE public.category SET category_name = ${name}, description = ${optionalText} WHERE category_id = ${recordId} RETURNING category_id, category_name, description`;
    if (!rows.length) return response({ error: "Record not found." }, 404);
    return response({ success: true, [kind === "customers" ? "customer" : "category"]: rows[0] }, recordId === null ? 201 : 200);
  } catch (error) { return handleError(error, kind); }
}
export async function deleteRecord(id: string, kind: Kind) {
  try {
    const recordId = idValue(id);
    const { sql } = await import("@/lib/neon-http");
    // Existing NO ACTION foreign keys are the final authority, including concurrent inserts.
    const rows = kind === "customers"
      ? await sql`DELETE FROM public.customer WHERE customer_id = ${recordId} RETURNING customer_id`
      : await sql`DELETE FROM public.category WHERE category_id = ${recordId} RETURNING category_id`;
    if (!rows.length) return response({ error: "Record not found." }, 404);
    return response({ success: true });
  } catch (error) { return handleError(error, kind); }
}
